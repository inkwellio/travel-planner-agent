import type { TripState } from '../../shared/types.js';
import type { GeocodeHit } from './map/MapProvider.js';

/**
 * 从最新一句里读目的地。认「去 X / X怎么玩 / 改成 X / 想去 X 玩」。
 * 行程还没有目的地时，整句就是一个短地名（「上海」「杭州市」）也当作候选。
 * 不维护城市白名单。名字再交给地理编码：对不上行政区（「西湖」常被编成景区或西湖区）就不改目的地。
 */
const PLACE = String.raw`[\u4e00-\u9fff]{2,12}`;
const NUM = String.raw`(?:\d{1,2}|[一二两三四五六七八九十]{1,3})`;
const EXPLICIT_RE = new RegExp(String.raw`(?:(?:目的地|城市)\s*)?(?:改成|改为|改到|换成|换到|调整为|调整到|设为|设成)\s*[:：]?\s*(${PLACE})`, 'g');
const DEST_IS_RE = new RegExp(String.raw`(?:目的地|城市)\s*(?:是|为|[:：])\s*(${PLACE})`, 'g');
const GO_RE = new RegExp(String.raw`(?:想去|要去|打算去|准备去|计划去|前往|去|到)\s*(${PLACE})`, 'g');
const HOW_RE = new RegExp(String.raw`(${PLACE})\s*(?:怎么玩|如何玩|怎样玩|咋玩|怎么逛|怎么旅游|怎么安排)`, 'g');
const PLAY_DAYS_RE = new RegExp(String.raw`(${PLACE})\s*玩\s*${NUM}\s*[天日](?!气)`, 'g');
const BEFORE_DAYS_RE = new RegExp(String.raw`(${PLACE})\s*${NUM}\s*[天日](?!气)`, 'g');
const OR_RE = new RegExp(String.raw`(${PLACE}\s*(?:还是|或者|或)\s*${PLACE})`, 'g');

/** 句首口头语，从长到短。用来把「带爸妈慢慢逛西湖怎么玩」收成「西湖」，不是地名表。 */
const LEADING = /^(?:调整为|调整到|带爸妈|不愿意|目的地|去年|今年|明年|后年|打算|准备|计划|我们|你们|他们|她们|大家|自己|这个|那个|这里|那里|请问|想要|可以|如果|觉得|还是|或者|回去|过去|出来|出去|回来|爸妈|父母|老人|孩子|小孩|家人|朋友|一起|现在|今天|明天|后天|最近|周末|慢慢|好好|随便|怎么|如何|怎样|改成|改为|改到|换成|换到|设为|设成|城市|安排|行程|出发|想|要|去|到|在|从|把|让|给|跟|就|也|再|又|都|很|请|帮|问|那|这|我|你|他|她|它|的|了|呢|吧|啊|呀|哦|是|玩|逛|游|看|带|年)/;
const TRAILING = /(?:怎么安排|怎么旅游|怎么逛|怎样玩|如何玩|怎么玩|逛逛|看看|一下|旅游|旅行|玩玩|吗|呢|吧|啊|呀|了|的|哦|哈|啦|玩|游|逛|看)$/;
const DAY_SUFFIX = new RegExp(String.raw`${NUM}\s*[天日]$`);
const NOT_PLACE = new Set(['这里', '那里', '这边', '那边', '附近', '本地', '市区', '城里', '郊外', '景点', '地方', '酒店', '机场', '车站', '家里', '里面', '外面', '哪里', '哪儿', '每天', '整天', '全天', '半天', '今日', '明日', '昨日', '怎么样', '什么']);
/** 整句太短、又不像地名的口头语。说「去你好」仍走原来的句式，不在这里放行。 */
const NOT_BARE = new Set(['你好', '您好', '谢谢', '多谢', '好的', '可以', '不行', '不是', '推荐', '帮忙', '帮我', '安排', '规划', '行程', '随便', '看看', '想去', '出发', '哈哈', '嗯嗯', '收到', '知道', '不用', '不要', '没有']);

export type PlaceKind = 'region' | 'poi' | 'unknown';
export type DestinationIntent =
  | { kind: 'none' }
  | { kind: 'ambiguous' }
  | { kind: 'candidate'; name: string; explicit: boolean };

const POI_LEVELS = new Set(['兴趣点', '道路', '门牌号', '单元号', '道路交叉路口', '公交站台', '地铁站', '热点商圈', '国家']);

function normalize(raw: string) {
  return raw.replace(/\u3000/g, ' ').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));
}

function cleanPlace(raw: string) {
  let s = raw.trim();
  for (let i = 0; i < 8; i++) {
    const next = s.replace(LEADING, '').replace(TRAILING, '').replace(DAY_SUFFIX, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function isDayToken(s: string) {
  return new RegExp(String.raw`^${NUM}\s*[天日]$`).test(s);
}

/** 写入行程时去掉「市 / 省」，芯片上用短名。 */
export const NEED_CITY = '先告诉我目的地城市，例如「南京怎么玩」，我再推荐景点。';
/** 省级目的地太大，景点检索需要落到具体城市。 */
export function needCityInProvince(province: string) {
  const name = spoken(province) || province.trim();
  return `${name}范围比较大，请先选一个具体城市，例如「南京怎么玩」。`;
}
export function spoken(name: string) {
  return name.replace(/(?:特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州)$/u, '').replace(/(?:市|省)$/u, '');
}

function accept(raw: string): string | null | 'or' {
  if (/还是|或者|或/.test(raw)) {
    const parts = raw.split(/还是|或者|或/).map(cleanPlace).filter(n => n.length >= 2 && !isDayToken(n) && !NOT_PLACE.has(n));
    if (parts.length >= 2) return 'or';
    return parts[0] ?? null;
  }
  const name = cleanPlace(raw);
  // 「南京和苏州」是两个目的地；「呼和浩特」拆开后只剩一边，仍当一个名字。
  if (name.includes('和')) {
    const parts = name.split('和').filter(n => n.length >= 2 && !NOT_PLACE.has(n));
    if (parts.length >= 2) return 'or';
  }
  if (name.length < 2 || name.length > 12 || isDayToken(name) || NOT_PLACE.has(name)) return null;
  return name;
}

function negatedAt(text: string, index: number, raw: string, whole: string) {
  if (/^去掉/.test(whole) || /^去掉/.test(raw)) return true;
  if (/^(?:不要|不想|别)(?=去|到|想|改|换|调|设)/.test(raw)) return true;
  const pre = text.slice(Math.max(0, index - 4), index);
  return /(?:不要|不想|别想|并非|不是|别|不)\s*$/.test(pre);
}

interface Mention { name: string; start: number; end: number; explicit: boolean; negated: boolean; or: boolean }

function collect(text: string, re: RegExp, explicit: boolean): Mention[] {
  re.lastIndex = 0;
  const out: Mention[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (m[0].startsWith('到')) {
      const prev = text[start - 1] ?? '';
      if ('看听收感找遇得说想'.includes(prev)) continue;
    }
    const raw = m[1] ?? '';
    const negated = negatedAt(text, start, raw, m[0]);
    const parsed = accept(raw);
    if (parsed === 'or') { out.push({ name: '', start, end, explicit, negated, or: true }); continue; }
    if (!parsed) continue;
    out.push({ name: parsed, start, end, explicit, negated, or: false });
  }
  return out;
}

/**
 * 整句去掉引号和句号后只剩 2–12 个汉字，才像单独报了一个地名。
 * 「玩上海」「上海怎么玩」不是整句地名，交给上面的句式。
 */
function barePlace(text: string): string | null {
  const core = text.trim().replace(/^[\s"'“”「」『』]+|[\s"'“”「」『』。！？!?，,、.]+$/g, '');
  if (!/^[\u4e00-\u9fff]{2,12}$/.test(core)) return null;
  if (NOT_PLACE.has(core) || NOT_BARE.has(core) || isDayToken(core)) return null;
  if (/还是|或者|或/.test(core)) return null;
  return core;
}

/**
 * 明确的一个地名 → candidate；两个目的地或「还是」→ ambiguous；顺口提到景点 → none。
 * `destination` 为空时，才把「上海」这种整句短地名当成候选；已经有目的地时不因单独一个词改城市。
 */
export function parseDestinationIntent(message: string, opts?: { destination?: string }): DestinationIntent {
  const text = normalize(message);
  const fresh = (re: RegExp, explicit: boolean) => collect(text, new RegExp(re.source, 'g'), explicit);
  const mentions = [
    ...fresh(EXPLICIT_RE, true),
    ...fresh(DEST_IS_RE, true),
    ...fresh(GO_RE, false),
    ...fresh(HOW_RE, false),
    ...fresh(PLAY_DAYS_RE, false),
    ...fresh(BEFORE_DAYS_RE, false),
    ...fresh(OR_RE, false),
  ];
  if (mentions.some(m => m.or && !m.negated)) return { kind: 'ambiguous' };
  const explicit = mentions.filter(m => m.explicit && !m.negated && m.name);
  if (explicit.length) {
    const last = explicit[explicit.length - 1];
    const trailing = mentions.filter(m => !m.negated && m.name && m.start >= last.end && spoken(m.name) !== spoken(last.name));
    if (trailing.length) return { kind: 'ambiguous' };
    return { kind: 'candidate', name: last.name, explicit: true };
  }
  const soft = [...new Map(mentions.filter(m => !m.negated && m.name).map(m => [spoken(m.name), m.name])).values()];
  if (soft.length > 1) return { kind: 'ambiguous' };
  if (soft.length === 1) return { kind: 'candidate', name: soft[0], explicit: false };
  if (opts && !(opts.destination ?? '').trim()) {
    const bare = barePlace(text);
    if (bare) return { kind: 'candidate', name: bare, explicit: false };
  }
  return { kind: 'none' };
}

function normAdmin(s: string) {
  return s.replace(/(?:特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|盟)$/u, '').replace(/(?:市|省)$/u, '');
}

function adminEq(admin: string, user: string) {
  if (!admin) return false;
  const u = user.trim();
  return admin === u || normAdmin(admin) === u || normAdmin(admin) === normAdmin(u);
}

/**
 * 地理编码结果算不算可写入的目的地。
 * 「西湖」经常被编成「西湖区」，用户没把「区」说出来时不当成新城；「南京」对上「南京市」才算。
 */
export function interpretGeocode(user: string, hit: GeocodeHit | null): PlaceKind {
  const name = user.trim();
  if (!hit?.level || !name) return 'unknown';
  if (POI_LEVELS.has(hit.level)) return 'poi';
  if (hit.level === '市') return [hit.city, hit.province].some(n => adminEq(n, name)) ? 'region' : 'poi';
  if (hit.level === '省') return adminEq(hit.province, name) ? 'region' : 'poi';
  if (hit.level === '区县' || hit.level === '开发区') {
    if (hit.district && hit.district === name) return 'region';
    if (adminEq(hit.city, name) || adminEq(hit.province, name)) return 'region';
    return 'poi';
  }
  if (hit.level === '乡镇' || hit.level === '村庄') {
    if ((hit.township && hit.township === name) || (hit.district && hit.district === name)) return 'region';
    return 'poi';
  }
  if (adminEq(hit.city, name) || adminEq(hit.province, name)) return 'region';
  return 'poi';
}

/** 直辖市按城市用；不含 city 的省级结果才需要追问具体城市。 */
const MUNICIPALITY = /^(?:北京|上海|天津|重庆)市?$/u;

/**
 * 目的地是否只到省/自治区一级。
 * 省可以写入规划参数，但景点检索与推荐需要落到城市；上海等直辖市不算。
 */
export function isBroadProvince(user: string, hit: GeocodeHit | null): boolean {
  if (!hit || hit.level !== '省') return false;
  if (hit.city?.trim()) return false;
  const name = spoken(user.trim());
  if (MUNICIPALITY.test(name) || MUNICIPALITY.test(normAdmin(hit.province))) return false;
  return adminEq(hit.province, user.trim()) || !user.trim();
}

async function classifyPlace(name: string): Promise<PlaceKind> {
  const { getMapProvider } = await import('./map/index.js');
  try {
    return interpretGeocode(name, await getMapProvider().geocode(name));
  } catch (e) {
    const { isQuotaError } = await import('./limits.js');
    if (isQuotaError(e)) throw e;
    return 'unknown';
  }
}

const keepCity = (dest: string) => (dest.trim() ? `仍按 ${dest.trim()} 来。` : '');
const unsure = (dest: string) => `目的地不太确定，${keepCity(dest)}想改的话直接说「去南京」。`;

/** 地理编码通过才改 TripState.destination。note 非空时拼进助手回复。 */
export async function applyDestinationIntent(
  state: TripState,
  message: string,
  classify: (name: string) => Promise<PlaceKind> = classifyPlace,
  allowBare = true,
): Promise<{ state: TripState; note: string }> {
  const intent = parseDestinationIntent(message, { destination: state.destination || (allowBare ? '' : '_') });
  if (intent.kind === 'none') return { state, note: '' };
  if (intent.kind === 'ambiguous') return { state, note: unsure(state.destination) };
  let kind: PlaceKind;
  try {
    kind = await classify(intent.name);
  } catch (e) {
    const { isQuotaError } = await import('./limits.js');
    if (isQuotaError(e)) throw e;
    kind = 'unknown';
  }
  if (kind === 'region') {
    const name = spoken(intent.name);
    if (!name || spoken(name) === spoken(state.destination)) return { state, note: '' };
    return { state: { ...state, destination: name }, note: `已按 ${name} 更新目的地。` };
  }
  if (kind === 'poi' && !intent.explicit) return { state, note: '' };
  if (kind === 'poi') return { state, note: `「${intent.name}」不太像目的地城市，${keepCity(state.destination)}想改的话直接说「去南京」。` };
  return { state, note: unsure(state.destination) };
}
