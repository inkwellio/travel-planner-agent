import type { SearchProvider, SearchResult } from './SearchProvider.js';
/** 无 key：不发网络请求，返回空结果。 */
export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock';
  async search(): Promise<SearchResult[]> { return []; }
}
