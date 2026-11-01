import type { TripState } from '../../shared/types.js';

/** 与 PATCH /state 的钳位一致：1–7 天 */
export const DAY_MIN = 1;
export const DAY_MAX = 7;

const CN: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const NUM = String.raw`(?:\d{1,2}|十[一二三四五六七八九]?|[一二三四五六七八九]十[一二三四五六七八九]?|[一二两三四五六七八九])`;
const OVERRIDE_RE = new RegExp(String.raw`(?:改成|改为|改到|换成|换到|调整为|调整到)\s*[:：]?\s*(${NUM})\s*[天日](?!气)`, 'g');
const RANGE_RE = new RegExp(String.raw`(?<!第\s{0,2})(?<!月\s{0,2})(${NUM})\s*(?:到|至|或者|或|还是|~|～|-|—|－)\s*(${NUM})\s*[天日](?!气)`, 'g');
const COLLOQ_RE = /(?<!第\s{0,2})(?<!月\s{0,2})([一两二三四五六七八九])([一二三四五六七八九])\s*[天日](?!气)/g;
const MENTION_RE = new RegExp(String.raw`(?<!第\s{0,2})(?<!月\s{0,2})(?<![\d.])(?<![一二两三四五六七八九十])(${NUM})\s*[天日](?!气)`, 'g');
const DECIMAL_RE = /\d+\.\d+\s*[天日]/;
const HALF_RE = new RegExp(String.raw`${NUM}\s*[天日]\s*半`);

export type DaysIntent =
  | { kind: 'none' }
  | { kind: 'set'; days: number }
  | { kind: 'ambiguous' }
  | { kind: 'out_of_range' };

export function cnOrArabic(tok: string): number | null {
  if (/^\d{1,2}$/.test(tok)) return Number(tok);
  if (tok === '十') return 10;
  if (tok.startsWith('十') && tok.length === 2) return CN[tok[1]] ? 10 + CN[tok[1]] : null;
  if (tok.length === 1) return CN[tok] ?? null;
  if (tok.length === 2 && tok[1] === '十') return CN[tok[0]] ? CN[tok[0]] * 10 : null;
  if (tok.length === 3 && tok[1] === '十') {
    const a = CN[tok[0]], b = CN[tok[2]];
    return a && b ? a * 10 + b : null;
  }
  return null;
}

function normalize(raw: string) {
  return raw
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/一天到晚|一整天/g, ' ');
}

type Qual = 'ok' | 'neg' | 'fuzzy';
function qualifier(text: string, start: number, end: number): Qual {
  const pre = text.slice(Math.max(0, start - 8), start);
  const post = text.slice(end, end + 4);
  if (/(?:不要|不是|不用|并非)\s*$/.test(pre) || /(?:^|[^一-龥])别\s*$/.test(pre)) return 'neg';
  if (/(?:不到|少于|不足|超过|多于|差不多|大约|大概|左右)\s*$/.test(pre) || /^左右/.test(post)) return 'fuzzy';
  return 'ok';
}

function classify(nums: number[]): DaysIntent {
  const uniq = [...new Set(nums)];
  if (!uniq.length) return { kind: 'none' };
  const ok = uniq.filter(n => n >= DAY_MIN && n <= DAY_MAX);
  const bad = uniq.filter(n => n < DAY_MIN || n > DAY_MAX);
  if (ok.length === 1 && bad.length === 0) return { kind: 'set', days: ok[0] };
  if (ok.length === 0 && bad.length === 1) return { kind: 'out_of_range' };
  return { kind: 'ambiguous' };
}

function collect(text: string, re: RegExp, qual: Qual): number[] {
  re.lastIndex = 0;
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    if (qualifier(text, m.index, m.index + m[0].length) !== qual) continue;
    const n = cnOrArabic(m[1]);
    if (n != null) out.push(n);
  }
  return out;
}

/**
 * 从最新一句用户消息里读行程天数。
 * 明确的「3天 / 三天 / 改成3天」会更新；「第3天」「每天」「3月5日」不算；
 * 互相矛盾、范围（两三天 / 2到3天）或超出 1–7 则不改，交给调用方追问。
 */
export function parseDaysIntent(message: string): DaysIntent {
  const text = normalize(message);
  OVERRIDE_RE.lastIndex = 0;
  const overrides = [...text.matchAll(OVERRIDE_RE)].filter(m => qualifier(text, m.index, m.index + m[0].length) === 'ok');
  if (overrides.length) {
    // 「从2天改成3天」「改成3天，不对，改成4天」以最后一次「改成」为准。
    // 「改成3天或4天」后面还有另一个天数，不猜。
    const last = overrides[overrides.length - 1];
    const trailing = collect(text.slice(last.index + last[0].length), MENTION_RE, 'ok');
    if (trailing.length) return { kind: 'ambiguous' };
    const n = cnOrArabic(last[1]);
    return n == null ? { kind: 'ambiguous' } : classify([n]);
  }
  if (DECIMAL_RE.test(text) || HALF_RE.test(text)) return { kind: 'ambiguous' };
  RANGE_RE.lastIndex = 0;
  COLLOQ_RE.lastIndex = 0;
  if (RANGE_RE.test(text) || COLLOQ_RE.test(text)) return { kind: 'ambiguous' };
  const precise = collect(text, MENTION_RE, 'ok');
  if (precise.length) return classify(precise);
  if (collect(text, MENTION_RE, 'fuzzy').length || collect(text, MENTION_RE, 'neg').length) return { kind: 'ambiguous' };
  return { kind: 'none' };
}

/** 把天数意图写进 TripState。note 非空时拼进助手回复，让用户看见改了或需要确认。 */
export function applyDaysIntent(state: TripState, message: string): { state: TripState; note: string } {
  const intent = parseDaysIntent(message);
  if (intent.kind === 'set') {
    if (intent.days === state.days) return { state, note: '' };
    return { state: { ...state, days: intent.days }, note: `已按 ${intent.days} 天更新行程。` };
  }
  if (intent.kind === 'ambiguous') return { state, note: `天数不太确定，仍按 ${state.days} 天来。想改的话直接说「改成3天」。` };
  if (intent.kind === 'out_of_range') return { state, note: `行程天数目前支持 ${DAY_MIN}–${DAY_MAX} 天，仍按 ${state.days} 天来。` };
  return { state, note: '' };
}
