import type { SearchProvider, SearchResult } from './SearchProvider.js';
import { BochaProvider } from './BochaProvider.js';
import { TavilyProvider } from './TavilyProvider.js';
import { MockSearchProvider } from './MockSearchProvider.js';
import { isQuotaError } from '../limits.js';

let p: SearchProvider | undefined;
export function getSearchProvider(): SearchProvider {
  if (p) return p;
  const key = process.env.SEARCH_API_KEY, which = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  p = !key ? new MockSearchProvider() : which === 'tavily' ? new TavilyProvider(key) : which === 'bocha' ? new BochaProvider(key) : new MockSearchProvider();
  return p;
}

/** 只使用搜索供应商返回的内容，不请求搜索结果里的任意网址。 */
export async function searchWithContent(query: string, count = 4): Promise<(SearchResult & { text: string })[]> {
  const results = await getSearchProvider().search(query, count).catch(e => { if (isQuotaError(e)) throw e; console.warn('[search]', (e as Error).message); return []; });
  return results.map(r => ({ ...r, text: (r.content || r.snippet || '').slice(0, 6000) }));
}
export type { SearchProvider, SearchResult };
