import type { Field } from '../../../shared/types';

const md = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日更新`; };
const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };
const safeUrl = (u?: string) => { try { const parsed = new URL(u ?? ''); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; } };

/**
 * 字段出处标注：
 * web → “来源：XX · 10月15日更新”（可点开原网页）；llm / sample → 灰色“仅供参考”；amap / manual → 不标
 */
export function RefTag({ field, text }: { field?: Pick<Field, 'source' | 'sourceUrl' | 'sourceTitle' | 'fetchedAt'>; text?: string }) {
  if (!field) return null;
  if (field.source === 'web' && field.sourceUrl && safeUrl(field.sourceUrl)) {
    return <a href={field.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 px-1.5 rounded-pill bg-secondary-fixed text-secondary text-[10px] font-medium align-middle whitespace-nowrap hover:underline" title={field.sourceTitle}>
      来源：{(field.sourceTitle || host(field.sourceUrl)).slice(0, 12)} · {md(field.fetchedAt)}</a>;
  }
  if (field.source === 'llm' || field.source === 'sample') {
    return <span className="ml-1 px-1.5 rounded-pill bg-surface-container-high text-outline text-[10px] font-medium align-middle whitespace-nowrap" title={field.source === 'llm' ? '模型生成，无网页依据' : '本地示例库'}>{text ?? '仅供参考'}</span>;
  }
  return null;
}
