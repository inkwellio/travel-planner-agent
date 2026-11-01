import type { SearchProvider, SearchResult } from './SearchProvider.js';
import { consume } from '../limits.js';
/** 博查 Web Search API */
export class BochaProvider implements SearchProvider {
  readonly name = 'bocha';
  constructor(private key: string) {}
  async search(query: string, count: number): Promise<SearchResult[]> {
    consume('search');
    const r = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count, summary: true, freshness: 'noLimit' }),
    });
    if (!r.ok) throw new Error(`bocha ${r.status}`);
    const j: any = await r.json();
    return (j.data?.webPages?.value ?? []).map((v: any) => ({ title: v.name, url: v.url, snippet: v.snippet ?? '', content: v.summary }));
  }
}
