export interface SearchResult { title: string; url: string; snippet: string; content?: string }

/** 网页搜索适配层：换供应商只需新增实现 */
export interface SearchProvider {
  readonly name: string;
  search(query: string, count: number): Promise<SearchResult[]>;
}
