import type { Attraction, Field, Source } from '../../../shared/types.js';
import { db } from '../db.js';
import { getMapProvider } from '../map/index.js';
import type { PoiResult } from '../map/MapProvider.js';
import { extractFromPages, llmEnabled } from '../llm.js';
import { ENRICH_KEYS, safeSourceUrl, safeText } from '../modelSafety.js';
import { searchWithContent } from '../search/index.js';
import { isQuotaError } from '../limits.js';
import { HANGZHOU } from './sampleHangzhou.js';
import { searchAttractionPois, type AttractionArea } from './search.js';

/** 补充层字段（只存这些；基础信息一律实时查高德） */
export { ENRICH_KEYS };
export type EnrichKey = typeof ENRICH_KEYS[number];
export type Enrichment = Partial<Record<EnrichKey, string>>;

export const isSampleMode = () => !process.env.AMAP_WEB_KEY;

/** 每字段存值与出处 */
type StoredField = { value: string; sourceUrl?: string; sourceTitle?: string };
type StoredData = Partial<Record<EnrichKey, StoredField>> & { _validated?: boolean };
const TTL_MS = 30 * 86400_000;

db.exec(`
  DROP TABLE IF EXISTS attraction_enrichment;
  CREATE TABLE IF NOT EXISTS enrichment (
    poi_id TEXT NOT NULL, source TEXT NOT NULL CHECK (source IN ('web','llm','manual')),
    name TEXT, data TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (poi_id, source));
  CREATE TABLE IF NOT EXISTS poi_cache (poi_id TEXT PRIMARY KEY, city TEXT, data TEXT NOT NULL, fetched_at TEXT NOT NULL);
`);
const upsertEnrich = db.prepare(`INSERT INTO enrichment (poi_id, source, name, data, fetched_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(poi_id, source) DO UPDATE SET name=excluded.name, data=excluded.data, fetched_at=excluded.fetched_at`);
const selEnrich = db.prepare(`SELECT source, data, fetched_at FROM enrichment WHERE poi_id = ?`);
const upsertPoi = db.prepare(`INSERT INTO poi_cache (poi_id, city, data, fetched_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(poi_id) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at`);
const selPoi = db.prepare(`SELECT city, data FROM poi_cache WHERE poi_id = ?`);

type Row = { source: 'web' | 'llm' | 'manual'; data: string; fetched_at: string };
const rowsOf = (poiId: string) => selEnrich.all(poiId) as Row[];
const fresh = (r: Row) => r.source === 'manual' || Date.now() - Date.parse(r.fetched_at) < TTL_MS;

/** 合并优先级：llm < web < manual（按字段覆盖） */
function readEnrichment(poiId: string): Partial<Record<EnrichKey, Field>> {
  const rows = rowsOf(poiId); const out: Partial<Record<EnrichKey, Field>> = {};
  for (const src of ['web', 'manual'] as const) {
    const r = rows.find(x => x.source === src); if (!r || !fresh(r)) continue;
    const d = JSON.parse(r.data) as StoredData;
    if (src === 'web' && d._validated !== true) continue;
    for (const k of ENRICH_KEYS) {
      const f = d[k]; if (!f?.value) continue;
      if (src === 'web' && (!safeText(f.value) || !safeSourceUrl(f.sourceUrl))) continue;
      out[k] = { value: f.value, source: src, sourceUrl: f.sourceUrl, sourceTitle: f.sourceTitle, fetchedAt: r.fetched_at };
    }
  }
  return out;
}

/** 内部手动覆盖工具（source=manual，不过期），不公开为 HTTP 接口。 */
export function setManual(poiId: string, data: Enrichment) {
  const prev = rowsOf(poiId).find(r => r.source === 'manual');
  const merged: StoredData = prev ? JSON.parse(prev.data) : {};
  for (const k of ENRICH_KEYS) if (k in data) { const v = data[k]; if (v) merged[k] = { value: v }; else delete merged[k]; }
  upsertEnrich.run(poiId, 'manual', null, JSON.stringify(merged), new Date().toISOString());
  return readEnrichment(poiId);
}

const inflight = new Map<string, Promise<void>>();
/**
 * 补充层获取：缺失或过期（30 天）时
 * 1) 网页搜索（官网/攻略）→ 使用搜索服务返回的内容 → DeepSeek 提取（source=web，记出处）
 * 没有可核验的摘录时不写入补充资料。
 */
async function ensureEnrichment(poi: PoiResult, city: string) {
  const id = poi.amapId!;
  if (rowsOf(id).some(r => r.source === 'web' && fresh(r) && (JSON.parse(r.data) as StoredData)._validated === true)) return;
  if (!llmEnabled()) return; // 抽取/生成都依赖 DeepSeek
  if (!inflight.has(id)) inflight.set(id, (async () => {
    const now = new Date().toISOString();
    const pages = (await searchWithContent(`${city} ${poi.name} 官网 开放时间 门票 攻略`, 4)).filter(p => p.text.length > 50);
    const extracted = await extractFromPages(poi.name, city, pages);
    if (extracted && Object.keys(extracted).length) {
      const data: StoredData = { _validated: true };
      for (const [k, v] of Object.entries(extracted)) if ((ENRICH_KEYS as readonly string[]).includes(k))
        data[k as EnrichKey] = { value: v.value, sourceUrl: pages[v.ref].url, sourceTitle: pages[v.ref].title };
      upsertEnrich.run(id, 'web', poi.name, JSON.stringify(data), now);
      return;
    }
  })().catch(e => { if (isQuotaError(e)) throw e; console.warn('[enrich]', (e as Error).message); }).finally(() => inflight.delete(id)));
  await inflight.get(id);
}

function toAttraction(poi: PoiResult, city: string): Attraction {
  const e = readEnrichment(poi.amapId!);
  const amap = (v?: string): Field | undefined => (v ? { value: v, source: 'amap' } : undefined);
  return {
    id: poi.amapId!, amapId: poi.amapId, name: poi.name, city: poi.city || city, location: poi.location, sample: false,
    indoor: /博物馆|美术馆|展览|纪念馆|科技馆/.test(`${poi.type ?? ''}${poi.name}`),
    tags: (poi.type ?? '').split(';').filter(Boolean),
    address: poi.address, district: poi.district, adcode: poi.adcode, poiType: poi.type, rating: poi.rating, photos: poi.photos, phone: poi.phone,
    openHours: amap(poi.openHours), ...e,
  };
}

export interface CandidateOptions {
  limit?: number;
  enrich?: boolean;
  keywords?: string[];
  area?: AttractionArea;
}

/** 候选景点和检索状态一起返回，地图故障不能伪装成空结果。 */
export async function candidateSearch(city: string, preferences: string[], opts: CandidateOptions = {}): Promise<{ items: Attraction[]; partial: boolean }> {
  if (!city.trim()) return { items: [], partial: false };
  if (isSampleMode()) return { items: HANGZHOU, partial: false };
  const map = getMapProvider();
  const limit = Math.max(1, Math.min(60, Math.trunc(opts.limit ?? 15) || 15));
  const keywords = opts.keywords?.length ? opts.keywords : [...new Set(['景点', ...preferences.slice(0, 2)])];
  const area = opts.area ?? { kind: 'city', label: city, city };
  const result = await searchAttractionPois(map, area, keywords, limit);
  for (const p of result.pois) upsertPoi.run(p.amapId, p.city || city, JSON.stringify(p), new Date().toISOString());
  if (opts.enrich !== false) await enrichMany(result.pois.map(p => p.amapId!));
  return { items: result.pois.map(p => toAttraction(p, city)), partial: result.partial };
}

/** 原有数组接口供路线备选查询使用。 */
export async function candidates(city: string, preferences: string[], opts: CandidateOptions = {}): Promise<Attraction[]> {
  return (await candidateSearch(city, preferences, opts)).items;
}

/** 只给最终推荐的景点补充资料，扩大候选池不会把每个候选都送去搜索和模型抽取。 */
export async function enrichMany(ids: string[]) {
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 4) {
    await Promise.all(unique.slice(i, i + 4).map(async id => {
      const row = selPoi.get(id) as { city: string; data: string } | undefined;
      if (row) await ensureEnrichment(JSON.parse(row.data) as PoiResult, row.city);
    }));
  }
}

export async function getAttraction(id: string): Promise<Attraction | undefined> {
  const s = HANGZHOU.find(a => a.id === id);
  if (s) return s;
  const row = selPoi.get(id) as { city: string; data: string } | undefined;
  if (!row) return undefined;
  return toAttraction(JSON.parse(row.data) as PoiResult, row.city);
}
export async function getMany(ids: string[]) {
  return (await Promise.all(ids.map(getAttraction))).filter(Boolean) as Attraction[];
}
export async function indoorAlternatives(city: string, exclude: string[]): Promise<Attraction[]> {
  const pool = isSampleMode() ? HANGZHOU : (await candidates(city, ['博物馆']));
  return pool.filter(a => a.indoor && !exclude.includes(a.id)).slice(0, 3);
}
