import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { Attraction, DayPlan, Leg, PlanEvent, TripState } from '../../../shared/types.js';
import { getMany, indoorAlternatives } from '../attractions/repo.js';
import { nearestNeighborOrder } from '../geo.js';
import { isQuotaError } from '../limits.js';
import { assignDays, daySummary } from '../llm.js';
import { fallback, getMapProvider } from '../map/index.js';
import { getTransitLeg } from '../map/transit.js';

const PlanState = Annotation.Root({
  trip: Annotation<TripState>(),
  attractionIds: Annotation<string[]>(),
  version: Annotation<number>(),
  days: Annotation<DayPlan[]>({ reducer: (_a, b) => b, default: () => [] }),
});
type S = typeof PlanState.State;
type Emit = (e: PlanEvent) => void;
const emitOf = (cfg: LangGraphRunnableConfig) => (cfg.configurable?.emit as Emit | undefined) ?? (() => {});

/** 节点 1：分配景点（立即推给前端做骨架屏） */
async function assignNode(s: S, cfg: LangGraphRunnableConfig): Promise<Partial<S>> {
  const atts = await getMany(s.attractionIds);
  const byId = new Map(atts.map(a => [a.id, a]));
  const groups = await assignDays(s.trip, atts);
  const days: DayPlan[] = groups.map((ids, i) => ({
    day: i + 1, status: 'skeleton', attractionIds: ids, names: ids.map(id => byId.get(id)?.name ?? id),
  }));
  emitOf(cfg)({ type: 'assign', version: s.version, days });
  return { days };
}

async function safe<T>(f: () => Promise<T>, g: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) { if (isQuotaError(e)) throw e; console.warn('[map] fallback:', (e as Error).message); return g(); }
}

export async function refineDay(trip: TripState, d: DayPlan, weather?: DayPlan['weather'], keepOrder = false): Promise<DayPlan> {
  const map = getMapProvider();
  const atts = await getMany(d.attractionIds);
  // 天内顺序：手动编辑保留用户顺序，否则最近邻
  const order: Attraction[] = keepOrder ? atts : nearestNeighborOrder(atts);
  const legs: Leg[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i], b = order[i + 1];
    const [transitResult, driving, parking] = await Promise.all([
      getTransitLeg(map, a.location, b.location, a.city || trip.destination, b.city || trip.destination),
      safe(() => map.drivingRoute(a.location, b.location), () => fallback.drivingRoute(a.location, b.location)),
      safe(() => map.nearbyParking(b.location), () => fallback.nearbyParking()),
    ]);
    legs.push({ fromId: a.id, toId: b.id, ...transitResult, driving: driving && { ...driving, parking: parking ?? '暂无停车信息' } });
  }
  const stayBase = trip.pace === '轻松' ? 120 : trip.pace === '适中' ? 90 : 70;
  let t = 9 * 60;
  const stops = order.map((a, i) => {
    const arrive = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const stay = a.id === 'xixi' || a.id === 'lingyin' ? stayBase + 60 : stayBase;
    t += stay + (legs[i]?.transit?.durationMin ?? legs[i]?.driving?.durationMin ?? 0);
    return { attractionId: a.id, arrive, stayMin: stay };
  });
  const rainy = !!weather?.rainy;
  const alt = rainy ? (await indoorAlternatives(trip.destination, d.attractionIds)).map(a => a.id) : undefined;
  const ids = order.map(a => a.id);
  return {
    ...d, status: 'ready', attractionIds: ids, names: order.map(a => a.name), stops, legs, weather, indoorAlternatives: alt,
    summary: await daySummary(trip, d.day, order.map(a => a.name), rainy),
  };
}

/** 节点 2：逐天细化（按天流式推送） */
async function refineNode(s: S, cfg: LangGraphRunnableConfig): Promise<Partial<S>> {
  const emit = emitOf(cfg);
  const weather = await safe(() => getMapProvider().weather(s.trip.destination, s.days.length), () => fallback.weather(s.trip.destination, s.days.length));
  const out: DayPlan[] = [];
  for (const d of s.days) {
    const ready = await refineDay(s.trip, d, weather[d.day - 1]);
    if (process.env.MOCK_DELAY !== '0') await new Promise(r => setTimeout(r, 900)); // 让流式效果可见
    out.push(ready);
    emit({ type: 'day', version: s.version, day: ready });
  }
  return { days: out };
}

export const planGraph = new StateGraph(PlanState)
  .addNode('assign_attractions', assignNode)
  .addNode('refine_days', refineNode)
  .addEdge(START, 'assign_attractions')
  .addEdge('assign_attractions', 'refine_days')
  .addEdge('refine_days', END)
  .compile();
