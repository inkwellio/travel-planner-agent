import { randomUUID } from 'node:crypto';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { Trip, TripState } from '../../shared/types.js';
import { checkpointer } from './db.js';
import { isSampleMode } from './attractions/repo.js';
import { statePatch } from './validation.js';

/**
 * 会话持久化：每个行程 = 一个 LangGraph thread（thread_id = trip.id），
 * 完整 Trip（对话、状态、路线各版本）作为 checkpoint 存 SQLite，重启后从 checkpointer 恢复。
 */
const TripAnno = Annotation.Root({ trip: Annotation<Trip>() });
const tripGraph = new StateGraph(TripAnno)
  .addNode('save', (s: typeof TripAnno.State) => s)
  .addEdge(START, 'save').addEdge('save', END)
  .compile({ checkpointer });

const trips = new Map<string, Trip>();
const cfg = (id: string) => ({ configurable: { thread_id: id } });

export async function loadTrips() {
  const latest = new Map<string, { ts: string; trip: Trip }>();
  for await (const c of checkpointer.list({})) {
    const id = c.config.configurable?.thread_id as string;
    const trip = (c.checkpoint.channel_values as { trip?: Trip }).trip;
    if (!trip) continue;
    const prev = latest.get(id);
    if (!prev || c.checkpoint.ts > prev.ts) latest.set(id, { ts: c.checkpoint.ts, trip });
  }
  for (const [id, { trip }] of latest) trips.set(id, trip);
  return trips.size;
}

export async function persist(t: Trip) {
  await tripGraph.updateState(cfg(t.id), { trip: structuredClone(t) }, 'save');
  trips.set(t.id, t);
}

export const defaultState = (): TripState => ({ destination: '', days: 2, preferences: [], pace: '轻松', companions: '独自' });

export function tripTitle(s: Pick<TripState, 'destination' | 'days'>) {
  const city = s.destination.trim();
  return city ? `${city}旅行` : '新的旅行';
}

export async function createTrip(ownerId: string, state: unknown = {}, init?: Partial<Trip>): Promise<Trip> {
  const s = { ...defaultState(), ...statePatch(state) };
  const city = s.destination;
  const hello = city
    ? `你好，我是行程助手。告诉我想怎么玩${city}，我先推荐景点。`
    : '你好，我是行程助手。先告诉我要去哪座城市，我再推荐景点。';
  const now = new Date().toISOString();
  const t: Trip = { id: randomUUID(), ownerId, title: tripTitle(s), updatedAt: now, state: s,
    messages: [{ id: randomUUID(), role: 'assistant', text: `${hello}${isSampleMode() ? '（当前为示例数据）' : ''}`, at: now }],
    versions: [], activeVersion: null, ...init };
  await persist(t);
  return t;
}
export const getTrip = (id: string) => trips.get(id);
export const allTrips = () => [...trips.values()];
export const listTrips = (ownerId: string) => allTrips().filter(t => t.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export async function deleteTrip(id: string) { trips.delete(id); await checkpointer.deleteThread(id); }
export async function touch(t: Trip) { t.updatedAt = new Date().toISOString(); t.title = tripTitle(t.state); await persist(t); }
export const newId = () => randomUUID();
