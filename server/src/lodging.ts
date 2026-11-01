import type { MapProvider, PoiResult } from './map/MapProvider.js';
import { isQuotaError } from './limits.js';
import { resolveLocation, locationChoices, SemanticError, type LodgingIntent, type LocationCandidate } from './semantic.js';

// 供应商返回的行政层级枚举；不据此分析用户的自然语言地点名。
const REGION_LEVELS = new Set(['省', '市', '区县', '开发区']);

function goodLocation(p: PoiResult): boolean {
  return Number.isFinite(p.location?.lng) && Number.isFinite(p.location?.lat) && Math.abs(p.location.lng) <= 180 && Math.abs(p.location.lat) <= 90 && p.location.lng !== 0 && p.location.lat !== 0;
}

/** 行政区编码的父子层级校验，防止搜索结果超出已确认的区域。 */
function withinRegion(p: PoiResult, adcode: string): boolean {
  const prefixLength = adcode.endsWith('0000') ? 2 : adcode.endsWith('00') ? 4 : 6;
  return typeof p.adcode === 'string' && /^\d{6}$/.test(p.adcode) && p.adcode.startsWith(adcode.slice(0, prefixLength));
}

function unresolved(anchor: string): string {
  return `地图中暂未找到与“${anchor}”相符的位置，请确认名称或提供具体地址。`;
}

/** 地点类型和候选匹配均采用语义结果，地图负责提供可核对的地理事实。 */
export async function recommendLodging(city: string, question: string, map: MapProvider, semantic: LodgingIntent): Promise<string | null> {
  if (map.name !== 'amap') return null;
  city = semantic.city || city;
  const { nearby, anchor, locationType } = semantic;
  if (nearby && !anchor) return '请告诉我想住在哪个区域或地点附近。';
  if (anchor && locationType === 'unknown') return `请确认“${anchor}”指的是哪个区域或具体地点。`;
  try {
    let hotels: PoiResult[];
    let area = city;
    if (anchor && locationType === 'region') {
      const regions = (await map.geocodeCandidates(anchor, city))
        .filter(g => REGION_LEVELS.has(g.level) && typeof g.adcode === 'string' && /^\d{6}$/.test(g.adcode));
      const candidates: LocationCandidate[] = regions.map((g, i) => ({
        id: String(i), name: g.formattedAddress || g.district || g.city || g.province,
        level: g.level, province: g.province, city: g.city, district: g.district, adcode: g.adcode,
      }));
      const match = await resolveLocation(question, city, semantic, candidates);
      if (match.status === 'ambiguous') return locationChoices(anchor, match.candidates);
      if (match.status === 'not_found') return unresolved(anchor);
      const index = candidates.findIndex(c => c.id === match.id);
      const region = regions[index];
      area = `${candidates[index].name}区域内`;
      hotels = (await map.searchPoi('酒店', region.adcode!, { types: '100000' }))
        .filter(p => withinRegion(p, region.adcode!));
    } else if (anchor && locationType === 'poi') {
      const pois = (await map.searchPoi(anchor, city)).filter(p => typeof p.name === 'string' && goodLocation(p));
      const candidates: LocationCandidate[] = pois.map((p, i) => ({
        id: String(i), name: p.name, address: p.address, type: p.type,
        province: p.province, city: p.city, district: p.district, amapId: p.amapId, adcode: p.adcode, location: p.location,
      }));
      const match = await resolveLocation(question, city, semantic, candidates);
      if (match.status === 'ambiguous') return locationChoices(anchor, match.candidates);
      if (match.status === 'not_found') return unresolved(anchor);
      const poi = pois[candidates.findIndex(c => c.id === match.id)];
      area = `${poi.name}附近 3 公里内`;
      hotels = await map.searchAround(poi.location, { types: '100000', radius: 3000 });
    } else {
      hotels = await map.searchPoi('酒店', city, { types: '100000' });
    }
    const places = hotels.filter(p => p.name && goodLocation(p)).slice(0, 5);
    if (!places.length) return `暂时没有找到${area}的住宿地点，请尝试其他位置。`;
    return `高德地图显示${area}有以下住宿地点（房价、房态和营业情况请向商家确认）：\n${places.map((p, i) => `${i + 1}. ${p.name}${p.address ? `：${p.address}` : ''}${p.rating ? `，评分 ${p.rating}` : ''}`).join('\n')}`;
  } catch (e) {
    if (isQuotaError(e) || e instanceof SemanticError) throw e;
    return '暂时无法查询住宿地点，请稍后再试。';
  }
}
