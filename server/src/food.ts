import type { MapProvider, PoiResult } from './map/MapProvider.js';
import { isQuotaError } from './limits.js';

/** 餐饮问题单独查询餐饮 POI，避免把景点当作餐厅推荐。 */
/** @deprecated 旧版兼容接口，不参与聊天入口的语义分流。 */
export function isFoodRequest(message: string): boolean {
  return /好吃|美食|餐厅|饭店|饭馆|餐馆|小吃|吃饭|吃什么|吃点|吃的|菜馆|老字号|杭帮菜|本帮菜/.test(message.replace(/(?:不要|不想|不用|别)(?:推荐|找|吃)?(?:美食|餐厅|饭店|饭馆|餐馆|小吃|吃的)/g, ''));
}

const FAST_FOOD = /肯德基|麦当劳|必胜客|汉堡王|德克士|华莱士|塔斯汀|赛百味|达美乐|棒约翰|kfc|mcdonalds?|pizzahut|burgerking/i;

/** 全国连锁快餐。区域连锁和本地老字号不在此列。 */
export function isNationalFastFood(name: string): boolean {
  return FAST_FOOD.test(name.replace(/\s+/g, ''));
}

/** 用户点名快餐或这些品牌时保留；“不要肯德基”仍然排除。 */
export function asksForNationalFastFood(message: string): boolean {
  const text = message.replace(/(?:不要|不想|别吃|别推荐|不用|排除)[^，。,.\n]{0,12}(?:肯德基|麦当劳|必胜客|汉堡王|德克士|华莱士|塔斯汀|赛百味|达美乐|棒约翰|快餐|连锁|kfc|mcdonald|pizza\s*hut|burger\s*king)/gi, '');
  return /快餐|肯德基|麦当劳|必胜客|汉堡王|德克士|华莱士|塔斯汀|赛百味|达美乐|棒约翰|kfc|mcdonald|pizza\s*hut|burger\s*king/i.test(text);
}

/** 默认去掉全国连锁快餐，保留地图返回的本地餐厅顺序。用户明确要吃快餐时不改顺序。 */
export function preferLocalRestaurants<T extends { name: string }>(places: T[], message: string): T[] {
  const named = places.filter(p => p.name.trim());
  if (asksForNationalFastFood(message)) return named;
  return named.filter(p => !isNationalFastFood(p.name));
}

export async function recommendFood(city: string, message: string, map: MapProvider, keyword = '餐厅'): Promise<string> {
  if (map.name !== 'amap') return `目前没有可用的${city}餐饮信息，暂时无法推荐具体店铺。`;
  try {
    const collected: PoiResult[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 3; page++) {
      const opts = page === 1 ? { types: '050000' } : { types: '050000', page };
      const batch = (await map.searchPoi(keyword, city, opts)).filter(p => p.name);
      for (const place of batch) {
        const key = `${place.name}\n${place.address ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(place);
      }
      if (preferLocalRestaurants(collected, message).length >= 5 || batch.length < 10) break;
    }
    const skippedChains = !asksForNationalFastFood(message) && collected.some(p => isNationalFastFood(p.name));
    const places = preferLocalRestaurants(collected, message).slice(0, 5);
    if (!places.length) {
      if (skippedChains) return `在${city}检索到的餐饮多为肯德基、麦当劳、必胜客等全国连锁快餐，暂时没有足够的本地餐厅可推荐。可以指定菜系、老字号或商圈再试。`;
      return `暂时没有找到${city}的相关餐饮地点，可以换个菜系或区域再试。`;
    }
    const note = skippedChains ? '已跳过肯德基、麦当劳、必胜客等全国连锁快餐。' : '';
    return `在${city}找到这些餐饮地点（高德地图数据，${note}营业情况请出发前确认）：\n${places.map((p, i) => `${i + 1}. ${p.name}${p.address ? `：${p.address}` : ''}${p.rating ? `，评分 ${p.rating}` : ''}`).join('\n')}`;
  } catch (e) {
    if (isQuotaError(e)) throw e;
    return `暂时无法查询${city}的餐饮信息，请稍后再试。`;
  }
}
