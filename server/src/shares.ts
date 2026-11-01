import { nanoid } from 'nanoid';
import type { ShareSnapshot, TripView } from '../../shared/types.js';
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)`);
const ins = db.prepare(`INSERT INTO shares (id, trip_id, data, created_at) VALUES (?, ?, ?, ?)`);
const sel = db.prepare(`SELECT data FROM shares WHERE id = ?`);

/** 创建只读分享：nanoid(21) 不可猜；快照当前版本 + 用到的景点 */
export function createShare(t: TripView): ShareSnapshot {
  const draft = t.versions.find(v => v.version === t.activeVersion);
  if (!draft?.complete) throw new Error('请在路线生成完成后再分享');
  const ids = new Set(draft.days.flatMap(d => [...d.attractionIds, ...(d.indoorAlternatives ?? [])]));
  const snap: ShareSnapshot = {
    id: nanoid(21), createdAt: new Date().toISOString(), title: t.title, state: t.state,
    draft: structuredClone(draft), catalog: Object.fromEntries([...ids].filter(id => t.catalog[id]).map(id => [id, t.catalog[id]])),
  };
  ins.run(snap.id, t.id, JSON.stringify(snap), snap.createdAt);
  return snap;
}
export function getShare(id: string): ShareSnapshot | undefined {
  const r = sel.get(id) as { data: string } | undefined;
  if (!r) return undefined;
  const snapshot = JSON.parse(r.data) as ShareSnapshot;
  return { ...snapshot, title: snapshot.title.replace(/\s*·\s*草稿\s*v\d+\s*$/, '') };
}
