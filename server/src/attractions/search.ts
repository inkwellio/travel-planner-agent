import { isQuotaError } from '../limits.js';
import { haversineKm, type LngLat, type MapProvider, type PoiResult } from '../map/MapProvider.js';
import { resolveLocation, locationChoices, type PlaceIntent } from '../semantic.js';

export class AttractionSearchError extends Error {
  constructor() { super('地图景点查询暂时不可用，请稍后重试。'); }
}
export class AreaResolutionError extends Error {}

export type AttractionArea =
  | { kind: 'city'; label: string; city: string }
  | { kind: 'region'; label: string; city: string; adcode: string }
  | { kind: 'poi'; label: string; city: string; location: LngLat; radius: number };

// 地图协议中的行政层级与编码，不用于解释用户的自然语言。
const REGION_LEVELS = new Set(['省', '市', '区县', '开发区']);
const located = (p: PoiResult) => Number.isFinite(p.location?.lng) && Number.isFinite(p.location?.lat)
  && Math.abs(p.location.lng) <= 180 && Math.abs(p.location.lat) <= 90 && p.location.lng !== 0 && p.location.lat !== 0;

export async function resolveAttractionArea(city: string, query: string, intent: PlaceIntent, map: MapProvider): Promise<AttractionArea> {
  city = intent.city || city;
  if (!intent.anchor) return { kind: 'city', label: city, city };
  if (intent.locationType === 'unknown') throw new AreaResolutionError(`请确认“${intent.anchor}”指的是哪个区域或具体地点。`);
  // 仅将地图请求故障转换为查询错误，模型不可用仍沿用语义服务错误。
  const lookup = async <T>(run: () => Promise<T>): Promise<T> => {
    try { return await run(); } catch (e) { if (isQuotaError(e)) throw e; throw new AttractionSearchError(); }
  };
  const regions = intent.locationType === 'region'
    ? (await lookup(() => map.geocodeCandidates(intent.anchor!, city)))
      .filter(g => REGION_LEVELS.has(g.level) && typeof g.adcode === 'string' && /^\d{6}$/.test(g.adcode)) : [];
  const pois = intent.locationType === 'poi'
    ? (await lookup(() => map.searchPoi(intent.anchor!, city))).filter(p => p.name && located(p)) : [];
  const candidates = intent.locationType === 'region'
    ? regions.map((g, i) => ({ id: String(i), name: g.formattedAddress || g.district || g.city || g.province,
      level: g.level, province: g.province, city: g.city, district: g.district, adcode: g.adcode }))
    : pois.map((p, i) => ({ id: String(i), name: p.name, type: p.type, address: p.address,
      province: p.province, city: p.city, district: p.district, amapId: p.amapId, adcode: p.adcode, location: p.location }));
  const match = await resolveLocation(query, city, intent, candidates);
  if (match.status === 'ambiguous') throw new AreaResolutionError(locationChoices(intent.anchor, match.candidates));
  if (match.status === 'not_found') throw new AreaResolutionError(`地图中暂未确认“${intent.anchor}”的位置，请确认名称或提供具体地址。`);
  const index = candidates.findIndex(c => c.id === match.id);
  if (intent.locationType === 'region') return { kind: 'region', label: candidates[index].name, city, adcode: regions[index].adcode! };
  return { kind: 'poi', label: `${pois[index].name}附近 3 公里内`, city, location: pois[index].location, radius: 3000 };
}

function inArea(p: PoiResult, area: AttractionArea): boolean {
  if (!located(p)) return false;
  if (area.kind === 'region') {
    const length = area.adcode.endsWith('0000') ? 2 : area.adcode.endsWith('00') ? 4 : 6;
    return typeof p.adcode === 'string' && /^\d{6}$/.test(p.adcode) && p.adcode.startsWith(area.adcode.slice(0, length));
  }
  return area.kind !== 'poi' || haversineKm(p.location, area.location) * 1000 <= area.radius;
}

/** 保留检索故障，只有地图成功返回空数据才属于没有候选。 */
export async function searchAttractionPois(map: MapProvider, area: AttractionArea, keywords: string[], limit: number): Promise<{ pois: PoiResult[]; partial: boolean }> {
  let failed = 0;
  const seen = new Map<string, PoiResult>();
  const exhausted = new Set<string>();
  const queries = [...new Set(keywords)].slice(0, 6);
  for (let page = 1; page <= Math.ceil(limit / 10) && seen.size < limit; page++) {
    for (const keyword of queries) {
      if (exhausted.has(keyword) || seen.size >= limit) continue;
      let found: PoiResult[];
      try {
        found = area.kind === 'poi'
          ? await map.searchAround(area.location, { types: '', radius: area.radius, keywords: keyword, page })
          : await map.searchPoi(keyword, area.kind === 'region' ? area.adcode : area.city, { page });
      } catch (e) {
        if (isQuotaError(e)) throw e;
        failed++; exhausted.add(keyword); continue;
      }
      if (found.length < 10) exhausted.add(keyword);
      for (const p of found) if (p.amapId && p.name && inArea(p, area) && !seen.has(p.amapId)) seen.set(p.amapId, p);
    }
    if (exhausted.size === queries.length) break;
  }
  if (failed && !seen.size) throw new AttractionSearchError();
  return { pois: [...seen.values()].slice(0, limit), partial: failed > 0 };
}
