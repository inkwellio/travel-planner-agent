import type { SearchProvider, SearchResult } from './SearchProvider.js';
import { consume } from '../limits.js';
/** Tavily Search API */
export class TavilyProvider implements SearchProvider {
  readonly name = 'tavily';
  constructor(private key: string) {}
  async search(query: string, count: number): Promise<SearchResult[]> {
    consume('search');
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: count, include_raw_content: true, search_depth: 'basic' }),
    });
    if (!r.ok) throw new Error(`tavily ${r.status}`);
    const j: any = await r.json();
    return (j.results ?? []).map((v: any) => ({ title: v.title, url: v.url, snippet: v.content ?? '', content: v.raw_content ?? undefined }));
  }
}
