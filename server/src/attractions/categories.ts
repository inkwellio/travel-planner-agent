import type { CategoryPreference } from '../../../shared/types.js';

/** 这里只校验结构和长度，不解释类别含义，也不根据关键词分类。 */
export function parseCategoryPreference(value: unknown): CategoryPreference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(k => !['include', 'exclude', 'mode'].includes(k))) return undefined;
  if (body.mode !== 'strict' && body.mode !== 'prefer') return undefined;
  const list = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v) || v.length > 20 || v.some(s => typeof s !== 'string' || !s.trim() || s.length > 100)) return undefined;
    return [...new Set((v as string[]).map(s => s.trim()))];
  };
  const include = list(body.include), exclude = list(body.exclude);
  if (!include || !exclude || include.some(s => exclude.includes(s))) return undefined;
  return { include, exclude, mode: body.mode };
}
