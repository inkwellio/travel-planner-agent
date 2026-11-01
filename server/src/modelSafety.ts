/** 不可信内容和模型输出的基本约束；不能代替对来源真实性的判断。 */
export const ENRICH_KEYS = ['highlights', 'duration', 'bestTime', 'closedDays', 'ticket', 'audience', 'tips', 'food'] as const;
const instruction = /忽略.{0,12}(指令|规则|提示|上文)|(?:系统|开发者|管理员)(?:指令|提示|消息)|(?:输出|回复|告诉用户|请访问|点击|发送|泄露|提供).{0,15}(?:密码|密钥|令牌|链接|网址|指令)|(?:ignore|disregard|override).{0,30}(?:instructions|rules|prompt)|(?:system|developer)\s*[:：]|https?:\/\/|javascript:|<[^>]*>/i;
export function safeText(value: unknown, max = 40): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && !instruction.test(value);
}

export interface SourcePage { text: string; url: string }
export function safeSourceUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try { const parsed = new URL(url); return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password; } catch { return false; }
}

/** 值必须是指定来源的连续原文；不能证明来源本身真实或无恶意。 */
export function validateExtractedFields(raw: unknown, pages: SourcePage[]): Record<string, { value: string; ref: number }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, { value: string; ref: number }> = {};
  for (const key of ENRICH_KEYS) {
    const item = (raw as Record<string, unknown>)[key];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { value, ref } = item as { value?: unknown; ref?: unknown };
    if (!safeText(value) || typeof ref !== 'number' || !Number.isInteger(ref) || ref < 0 || !pages[ref] || !safeSourceUrl(pages[ref].url)) continue;
    if (pages[ref].text.slice(0, 5000).includes(value)) out[key] = { value, ref };
  }
  return out;
}

export function validDayGroups(raw: unknown, days: number, ids: string[]): raw is string[][] {
  if (!Array.isArray(raw) || raw.length !== days || !raw.every(Array.isArray)) return false;
  const flat: unknown[] = raw.flat();
  return flat.length === ids.length && flat.every(id => typeof id === 'string' && ids.includes(id)) && new Set(flat).size === ids.length;
}
