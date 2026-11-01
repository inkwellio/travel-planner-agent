import type { DayWeather } from '../../../shared/types.js';
import { haversineKm, type GeocodeHit, type LngLat, type MapProvider } from './MapProvider.js';
import { HANGZHOU } from '../attractions/sampleHangzhou.js';

/** 从示例景点名上剥掉「寺 / 春晓 / 博物馆」这类后缀，得到简称（西湖、苏堤、灵隐）。不是城市名单。 */
const SCENIC_SUFFIX = /(?:国家湿地公园|湿地公园|博物馆|馆区|春晓|残雪|飞来峰|御街|大运河|寺|塔|村|街|桥|公园)$/;
const SAMPLE_CORES = new Set(HANGZHOU.flatMap(a => {
  const cores: string[] = [];
  for (const seg of a.name.split(/[·・（(]/)) {
    const s = seg.replace(/[）)]/g, '');
    if (s.length >= 2) cores.push(s);
    const stripped = s.replace(SCENIC_SUFFIX, '');
    if (stripped.length >= 2 && stripped !== s && !/(?:省|市|县|区|国)$/.test(stripped)) cores.push(stripped);
  }
  return cores;
}));
/** 示例库里没有的景点：庙、塔、湖这类后缀不像行政区。配了高德 key 时以地理编码为准，不走这里。 */
const ATTRACTION_TAIL = /(?:博物馆|湿地公园|景区|公园|庙|寺|塔|宫|殿|陵|墓|祠|馆|街|巷|桥|堤|楼|亭|台|洞|峰|泉|井|坊|湖|屿|园)$/;
/** 省级简称（不含直辖市）。仅 mock 地理编码用；真实环境以高德 level 为准。 */
const PROVINCE_SHORT = new Set([
  '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
]);

const LINES = ['公交 7 路', '公交 51 路', '地铁 1 号线', '地铁 2 号线', '公交 87 路', '公交 315 路', '地铁 4 号线'];
const STATIONS = ['龙翔桥', '凤起路', '武林广场', '定安路', '岳王庙', '曙光路', '近江'];

/** 无 key 时的本地估算（示例数据，source 标为 sample，前端显示“仅供参考”） */
export class MockProvider implements MapProvider {
  readonly name = 'mock';

  /**
   * 无 key 时没有地理编码服务：示例库景点名和明显的景点后缀视为兴趣点，
   * 其余短语按行政区放行，这样「去南京」在本地 demo 里能改目的地。
   * 真实环境走 AmapProvider.geocode，对不上就由上层追问。
   */
  async geocode(address: string): Promise<GeocodeHit | null> {
    const name = address.trim();
    if (!name) return null;
    if (SAMPLE_CORES.has(name) || ATTRACTION_TAIL.test(name)) {
      return { level: '兴趣点', province: '', city: '', district: '', township: '' };
    }
    if (/(?:特别行政区|自治区|自治州)$/.test(name) || name.endsWith('省') || PROVINCE_SHORT.has(name)) {
      const province = PROVINCE_SHORT.has(name)
        ? (name === '内蒙古' || name === '新疆' || name === '广西' || name === '西藏' || name === '宁夏' ? name : `${name}省`)
        : name;
      return { level: '省', province, city: '', district: '', township: '' };
    }
    if (/[区县旗]$/.test(name)) return { level: '区县', province: '', city: '', district: name, township: '' };
    if (/[镇乡]$/.test(name)) return { level: '乡镇', province: '', city: '', district: '', township: name };
    return { level: '市', province: '', city: name.endsWith('市') ? name : `${name}市`, district: '', township: '' };
  }

  async geocodeCandidates(address: string): Promise<GeocodeHit[]> {
    const hit = await this.geocode(address);
    return hit ? [hit] : [];
  }

  async searchPoi(keyword: string) {
    return HANGZHOU.filter(a => a.name.includes(keyword)).map(a => ({ name: a.name, location: a.location }));
  }
  async searchAround() { return []; }
  async transitRoute(from: LngLat, to: LngLat) {
    const km = haversineKm(from, to);
    const seed = Math.abs(Math.round((from.lng + to.lat) * 1000));
    const make = (kind: 'subway' | 'bus') => {
      const routes = LINES.filter(line => kind === 'subway' ? line.startsWith('地铁') : line.startsWith('公交'));
      const transfer = km > 5;
      const lines = transfer ? [routes[seed % routes.length], routes[(seed + 1) % routes.length]] : [routes[seed % routes.length]];
      return {
        lines, lineModes: lines.map(() => kind), transfers: transfer ? [STATIONS[seed % STATIONS.length]] : [],
        durationMin: Math.max(1, Math.round(km / (kind === 'subway' ? 28 : 18) * 60 + (transfer ? 15 : 8))),
        fare: kind === 'subway' ? 4 : 2, walkMeters: Math.round(300 + km * 60), source: 'sample' as const,
      };
    };
    const subway = make('subway'), bus = make('bus');
    return { ...subway, alternatives: { subway, bus }, availability: { subway: 'available' as const, bus: 'available' as const } };
  }

  async drivingRoute(from: LngLat, to: LngLat) {
    const km = haversineKm(from, to) * 1.35;
    return { durationMin: Math.round(km / 25 * 60 + 5), distanceKm: Math.round(km * 10) / 10, tolls: 0, source: 'sample' as const };
  }
  async nearbyParking() { return '景区周边有公共停车场（示例），节假日易满，建议公共交通'; }
  async weather(_city: string, days: number): Promise<DayWeather[]> {
    const base = new Date();
    const pattern = [
      { text: '多云', tempMin: 16, tempMax: 24, rainy: false },
      { text: '中雨', tempMin: 15, tempMax: 20, rainy: true },
      { text: '晴', tempMin: 14, tempMax: 23, rainy: false },
    ];
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(base.getTime() + (i + 1) * 86400000);
      return { date: d.toISOString().slice(0, 10), ...pattern[i % 3], source: 'sample' as const };
    });
  }
}
