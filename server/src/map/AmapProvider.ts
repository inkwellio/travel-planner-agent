import type { DayWeather, TransitOption } from '../../../shared/types.js';
import type { GeocodeHit, LngLat, MapProvider, PoiResult } from './MapProvider.js';
import { consume, isQuotaError } from '../limits.js';
import { selectTransitOptions } from './transit.js';

const BASE = 'https://restapi.amap.com';
const ll = (p: LngLat) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
const CITY_ADCODE: Record<string, string> = { 杭州: '330100' };

/**
 * 高德 POI 照片。空的 /showpic/ 路径会 400；store.is.autonavi.com 的 http 链接升到 https。
 * 已下线的图（任意 id 不存在时 CDN 也回 400 空包）无法在请求前识别，前端缩略图加载失败再换下一张。
 */
export function normalizePhotoUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return;
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return;
  let url: URL;
  try { url = new URL(s); } catch { return; }
  if (!url.pathname || url.pathname === '/' || /\/showpic\/?$/.test(url.pathname)) return;
  if (url.protocol === 'http:' && url.hostname === 'store.is.autonavi.com') url.protocol = 'https:';
  return url.toString();
}

/** 高德 Web 服务实现。key 仅在后端（AMAP_WEB_KEY） */
export class AmapProvider implements MapProvider {
  readonly name = 'amap';
  constructor(private key: string) {}
  private transitCities = new Map<string, Promise<string>>();

  private async get(path: string, params: Record<string, string>): Promise<any> {
    consume('amap');
    const qs = new URLSearchParams({ key: this.key, output: 'json', ...params });
    const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(8000) });
    const json: any = await res.json();
    if (json.status !== '1') throw new Error(`amap ${path} failed: ${json.info}`);
    return json;
  }

  async searchPoi(keyword: string, city: string, opts: { types?: string; page?: number } = {}): Promise<PoiResult[]> {
    const j = await this.get('/v3/place/text', { keywords: keyword, city, citylimit: 'true', offset: '10', extensions: 'all', ...(opts.types ? { types: opts.types } : {}), ...(opts.page ? { page: String(opts.page) } : {}) });
    return this.parsePois(j.pois);
  }

  async searchAround(location: { lng: number; lat: number }, opts: { types: string; radius: number; keywords?: string; page?: number }): Promise<PoiResult[]> {
    const j = await this.get('/v3/place/around', { location: ll(location), radius: String(opts.radius), offset: '10', sortrule: 'distance', extensions: 'all',
      ...(opts.types ? { types: opts.types } : {}), ...(opts.keywords ? { keywords: opts.keywords } : {}), ...(opts.page ? { page: String(opts.page) } : {}) });
    return this.parsePois(j.pois);
  }

  private parsePois(pois: any): PoiResult[] {
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined); // 高德空值常为 []
    return (Array.isArray(pois) ? pois : []).map((p: any): PoiResult => {
      const [lng, lat] = String(p.location).split(',').map(Number);
      const rating = Number(str(p.biz_ext?.rating));
      return {
        name: p.name, address: str(p.address), amapId: p.id, location: { lng, lat }, type: str(p.type),
        province: str(p.pname), city: str(p.cityname), district: str(p.adname), adcode: str(p.adcode),
        rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
        photos: (p.photos ?? []).flatMap((x: any) => { const u = normalizePhotoUrl(x?.url); return u ? [u] : []; }).slice(0, 3),
        openHours: str(p.biz_ext?.opentime2) ?? str(p.biz_ext?.open_time), phone: str(p.tel),
      };
    });
  }

  /** v5 交通查询需要城市编码，由地图行政区服务确认并缓存，不维护城市表。 */
  private transitCityCode(city: string): Promise<string> {
    const name = city.trim();
    const cached = this.transitCities.get(name);
    if (cached) return cached;
    const pending = this.get('/v3/config/district', { keywords: name, subdistrict: '0', extensions: 'base' }).then(j => {
      const codes = [...new Set<string>((Array.isArray(j.districts) ? j.districts : [])
        .map((d: any) => d.citycode).filter((code: unknown) => typeof code === 'string' && /^\d{3,4}$/.test(code)))];
      if (codes.length !== 1) throw new Error('无法确认公共交通查询城市');
      return codes[0];
    }).catch(error => { this.transitCities.delete(name); throw error; });
    if (this.transitCities.size >= 128) this.transitCities.delete(this.transitCities.keys().next().value!);
    this.transitCities.set(name, pending);
    return pending;
  }

  async transitRoute(from: LngLat, to: LngLat, city: string, opts: { destinationCity?: string } = {}): Promise<TransitOption | undefined> {
    const [city1, city2] = await Promise.all([this.transitCityCode(city), this.transitCityCode(opts.destinationCity || city)]);
    const params = { origin: ll(from), destination: ll(to), city1, city2, show_fields: 'cost', AlternativeRoute: '5' };
    const results = await Promise.allSettled([
      this.get('/v5/direction/transit/integrated', { ...params, strategy: '7' }),
      this.get('/v5/direction/transit/integrated', { ...params, strategy: '5' }),
    ]);
    return selectTransitOptions(results[0], results[1]);
  }

  async drivingRoute(from: LngLat, to: LngLat) {
    const j = await this.get('/v3/direction/driving', { origin: ll(from), destination: ll(to), extensions: 'base', strategy: '0' });
    const p = j.route?.paths?.[0];
    if (!p) return undefined;
    return { durationMin: Math.round(Number(p.duration) / 60), distanceKm: Math.round(Number(p.distance) / 100) / 10, tolls: Number(p.tolls) || 0, source: 'amap' as const };
  }

  async nearbyParking(at: LngLat) {
    const j = await this.get('/v3/place/around', { location: ll(at), types: '150900', radius: '1000', offset: '3', sortrule: 'distance' });
    const p = j.pois?.[0];
    return p ? `${p.name}（约 ${p.distance} m）` : undefined;
  }

  async geocode(address: string): Promise<GeocodeHit | null> {
    try {
      return (await this.geocodeCandidates(address))[0] ?? null;
    } catch (e) {
      if (isQuotaError(e)) throw e;
      return null;
    }
  }

  async geocodeCandidates(address: string, city?: string): Promise<GeocodeHit[]> {
    const q = address.trim();
    if (!q) return [];
    const j = await this.get('/v3/geocode/geo', { address: q, ...(city ? { city } : {}) });
    const str = (v: unknown) => (typeof v === 'string' && v ? v : '');
    return (Array.isArray(j.geocodes) ? j.geocodes : []).flatMap((g: any): GeocodeHit[] => {
      const level = str(g.level);
      if (!level) return [];
      return [{ level, province: str(g.province), city: str(g.city), district: str(g.district), township: str(g.township),
        formattedAddress: str(g.formatted_address), adcode: str(g.adcode) }];
    });
  }

  async weather(city: string, days: number): Promise<DayWeather[]> {
    const j = await this.get('/v3/weather/weatherInfo', { city: CITY_ADCODE[city] ?? city, extensions: 'all' });
    const casts: any[] = j.forecasts?.[0]?.casts ?? [];
    return casts.slice(0, days).map(c => ({
      date: c.date, text: c.dayweather, tempMin: Number(c.nighttemp), tempMax: Number(c.daytemp),
      rainy: /雨|雪/.test(c.dayweather), source: 'amap' as const,
    }));
  }
}
