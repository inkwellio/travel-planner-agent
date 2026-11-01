import type { Attraction, CategoryPreference } from '../../shared/types.js';
import type { AttractionJudgment } from './semantic.js';

const NATURE_BLOCK = /博物馆|纪念馆|寺庙|人文|历史|美食|室内|不要|排除|免费/;
const NATURE_THEME = /自然风光|自然景观|自然风景|山水风光|户外风景|自然景点/;

/** 节奏是软约束，不单独构成景点类别，也不能挡住自然或人文的地图补位。 */
function isSoftPaceCriterion(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 12) return false;
  if (/自然|人文|历史|博物馆|寺庙|景点|风光|不要|排除|美食|室内/.test(value)) return false;
  return /轻松|慢节奏|悠闲|不赶/.test(value);
}

function isNatureTheme(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 16) return false;
  if (NATURE_BLOCK.test(value)) return false;
  return NATURE_THEME.test(value) || (/自然/.test(value) && /风光|景观|风景|山水|景点|户外/.test(value));
}

function isCultureTheme(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 16) return false;
  if (/不要|排除|免费|美食/.test(value) || isNatureTheme(value)) return false;
  return /人文|历史|博物馆|纪念馆|寺庙|古迹|文物/.test(value);
}

/** 宽泛的自然风光请求。轻松节奏可忽略；混入人文、室内等类别时不走这条放宽。 */
export function isBroadNatureRequest(include: string[]): boolean {
  const themes = include.map(item => item.trim()).filter(item => item && !isSoftPaceCriterion(item));
  if (!themes.length) return false;
  return themes.every(isNatureTheme);
}

/**
 * 软性偏好同时希望自然风光和人文历史。多项是“符合任一”而不是必须同时满足。
 * 轻松节奏可以出现在 include 里，但不作为类别门槛。
 */
export function isSoftMixedPrefer(criteria: CategoryPreference): boolean {
  if (criteria.mode !== 'prefer') return false;
  const themes = criteria.include.map(item => item.trim()).filter(item => item && !isSoftPaceCriterion(item));
  if (!themes.some(isNatureTheme) || !themes.some(isCultureTheme)) return false;
  return themes.every(item => isNatureTheme(item) || isCultureTheme(item));
}

/**
 * 补充资料往往只能核验少数景点。预算按目标数量放大，避免只补几条就停。
 * 候选池本身已有上限，这里再封顶，避免长行程把整个池子都送去搜索。
 */
export function enrichmentBudget(unknownCount: number, targetCount: number): number {
  if (unknownCount <= 0) return 0;
  const cap = Math.max(12, Math.min(Math.max(targetCount, 1) * 3, 24));
  return Math.min(unknownCount, cap);
}

const BLOCKED_CATEGORY = /博物馆|美术馆|纪念馆|展览馆|科技馆|寺庙|道观|教堂|清真寺|回教寺|特色商业街|商业街|城市广场|购物中心|故居|陵墓|陵园|出入口/;
const INDOOR_CATEGORY = /博物馆|美术馆|纪念馆|展览馆|科技馆/;
const CULTURE_CATEGORY = /博物馆|纪念馆|寺庙道观|寺庙|道观|文物古迹|古迹|故居/;
const CULTURE_CATEGORY_SECONDARY = /美术馆|展览馆|教堂|清真寺|回教寺|陵墓|陵园|红色景区/;
const EXCLUDE_CATEGORY = /博物馆|纪念馆|美术馆|展览馆|科技馆|寺庙|道观|教堂|清真寺|商业街|城市广场|购物|故居|陵墓|陵园|湿地|森林|海滩|公园|风景区|植物园|动物园|水族馆|古迹/g;

function categoryText(attraction: Pick<Attraction, 'poiType' | 'tags'>): string {
  return [attraction.poiType ?? '', ...attraction.tags].join(' ');
}

/** 0 表示不能当作自然风光的地图候选。只看地图类别和已有补充摘录，不看名称。 */
export function scenicNatureRank(attraction: Pick<Attraction, 'poiType' | 'tags' | 'highlights'>): number {
  const category = categoryText(attraction);
  if (BLOCKED_CATEGORY.test(category)) return 0;
  const detail = `${category} ${attraction.highlights?.value ?? ''}`;
  if (/湿地|森林|海滩|海滨|草原|峡谷|瀑布|自然保护|地质公园|山岳|湖泊|山水/.test(detail)) return 3;
  if (/植物园|动物园|水族馆|公园|风景区|景区/.test(detail)) return 2;
  if (/风景名胜|国家级景点|省级景点|观景点|世界遗产/.test(detail)) return 1;
  return 0;
}

/** 0 表示不能当作人文历史的地图候选。只看博物馆、寺庙和古迹等地图类别，不看名称，也不编造摘录。 */
export function cultureHistoryRank(attraction: Pick<Attraction, 'poiType' | 'tags'>): number {
  const category = categoryText(attraction);
  if (!category.trim()) return 0;
  if (/特色商业街|商业街|城市广场|购物中心|出入口/.test(category) && !CULTURE_CATEGORY.test(category)) return 0;
  if (CULTURE_CATEGORY.test(category)) return 3;
  if (CULTURE_CATEGORY_SECONDARY.test(category)) return 2;
  return 0;
}

function withoutNegation(text: string): string {
  return text.replace(/请|不要|排除|不想要|不想|避免|别去|拒绝/g, '').trim();
}

/** 硬性排除命中地图类别时不能靠补位放进来。排除条件无法从类别判断时，仍交给审核结果。 */
function blockedByHardExclude(attraction: Pick<Attraction, 'poiType' | 'tags' | 'indoor'>, exclude: string[]): boolean {
  const category = categoryText(attraction);
  for (const raw of exclude) {
    const text = raw.trim();
    if (!text) continue;
    if (/室内/.test(text) && (attraction.indoor || INDOOR_CATEGORY.test(category))) return true;
    const stated = withoutNegation(text);
    const namesVenue = /博物馆|纪念馆|美术馆|展览馆|科技馆|寺庙|道观|教堂|清真寺|商业街|城市广场|购物|故居|陵墓|陵园|古迹/.test(stated);
    if (/人文|历史/.test(stated) && !/自然/.test(stated) && !namesVenue && cultureHistoryRank(attraction) > 0) return true;
    if (stated && isNatureTheme(stated) && scenicNatureRank(attraction) > 0) return true;
    for (const token of text.match(EXCLUDE_CATEGORY) ?? []) {
      if (category.includes(token)) return true;
    }
  }
  return false;
}

export interface Shortlist {
  ids: string[];
  confirmed: string[];
  /** 补充资料仍不足、仅凭地图类别保留的候选。 */
  filled: string[];
}

/**
 * 已核实的匹配优先。补充资料加不出证据时：
 * 宽泛自然风光用未违反排除条件的风景/公园类地点补足；
 * 软性偏好同时包含自然与人文历史时，用地图上符合其中任一条的风景、博物馆、寺庙或古迹补足。
 * 不把模型判为不符合、排除条件无法确认、或摘录对不上原文的地点算进去，也不编造引用。
 */
export function composeShortlist(pool: Attraction[], judged: AttractionJudgment[], criteria: CategoryPreference, count: number, enrichmentAttempted: boolean): Shortlist {
  const byId = new Map(pool.map(a => [a.id, a]));
  const confirmed = judged
    .filter(j => j.status === 'match' || (criteria.mode === 'prefer' && j.status === 'alternative'))
    .sort((a, b) => Number(b.status === 'match') - Number(a.status === 'match') || b.score - a.score)
    .map(j => j.id)
    .slice(0, count);
  const mixed = isSoftMixedPrefer(criteria);
  if (!enrichmentAttempted || (!isBroadNatureRequest(criteria.include) && !mixed) || confirmed.length >= count) {
    return { ids: confirmed, confirmed, filled: [] };
  }
  const used = new Set(confirmed);
  const ranked = judged
    .filter(j => !used.has(j.id) && j.status === 'unknown' && !j.downgraded && j.inclusion === 'unknown' && j.exclusion === 'clear')
    .flatMap(j => {
      const attraction = byId.get(j.id);
      if (!attraction || blockedByHardExclude(attraction, criteria.exclude)) return [];
      const nature = scenicNatureRank(attraction);
      const culture = mixed ? cultureHistoryRank(attraction) : 0;
      const rank = Math.max(nature, culture);
      return rank > 0 ? [{ id: j.id, nature, culture, rank, score: j.score }] : [];
    });
  const room = count - confirmed.length;
  const filled = mixed ? alternateThemeFill(ranked, room) : ranked
    .sort((a, b) => b.rank - a.rank || b.score - a.score)
    .slice(0, room)
    .map(item => item.id);
  return { ids: [...confirmed, ...filled], confirmed, filled };
}

/** 名额有限时交替放入自然与人文候选，避免短名单被其中一类占满。 */
function alternateThemeFill(items: { id: string; nature: number; culture: number; rank: number; score: number }[], limit: number): string[] {
  const byStrength = (a: { rank: number; score: number }, b: { rank: number; score: number }) => b.rank - a.rank || b.score - a.score;
  const nature = items.filter(item => item.nature > 0).sort(byStrength);
  const culture = items.filter(item => item.nature === 0 && item.culture > 0).sort(byStrength);
  const picked: string[] = [];
  let natureIndex = 0;
  let cultureIndex = 0;
  let cultureTurn = (culture[0]?.rank ?? 0) > (nature[0]?.rank ?? 0);
  while (picked.length < limit && (natureIndex < nature.length || cultureIndex < culture.length)) {
    const takeCulture = cultureTurn ? cultureIndex < culture.length : natureIndex >= nature.length;
    if (takeCulture && cultureIndex < culture.length) picked.push(culture[cultureIndex++].id);
    else if (natureIndex < nature.length) picked.push(nature[natureIndex++].id);
    cultureTurn = !cultureTurn;
  }
  return picked;
}
