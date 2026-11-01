import './env.js';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import type { Attraction, PlanEvent, RouteDraft, Trip, TripView } from '../../shared/types.js';
import { createTrip, deleteTrip, getTrip, listTrips, loadTrips, newId, touch } from './store.js';
import { llmMode, recommend, specialtyNames } from './llm.js';
import { planGraph, refineDay } from './graph/planGraph.js';
import { getMapProvider } from './map/index.js';
import { candidateSearch, enrichMany, getAttraction, getMany, isSampleMode } from './attractions/repo.js';
import { getSearchProvider } from './search/index.js';
import { mountAmapProxy } from './amapProxy.js';
import { DB_PATH } from './db.js';
import { createShare, getShare } from './shares.js';
import { isQuotaError, planLimiter, usage, type ExternalKind } from './limits.js';
import { llmEnabled } from './llm.js';
import { interpretGeocode, isBroadProvince, needCityInProvince, spoken, NEED_CITY } from './destinationIntent.js';
import { recommendFood } from './food.js';
import { lookupTravelInformation } from './travelIntent.js';
import { recommendLodging } from './lodging.js';
import { createSession, requireSession } from './sessions.js';
import { publicLimiter } from './limits.js';
import { accessGuard, rememberVisitor } from './adminStore.js';
import { mountAdmin } from './adminRoutes.js';
import { attractionIds, InputError, objectBody, statePatch } from './validation.js';
import { recommendationPolicy } from './recommendationPolicy.js';
import { routeState } from './routePolicy.js';
import { SemanticError, understandTravelRequest } from './semantic.js';
import { AreaResolutionError, AttractionSearchError, resolveAttractionArea } from './attractions/search.js';

/** 当前请求会用到的外部服务（用于每日额度预检） */
const neededKinds = (): ExternalKind[] => [
  ...(llmEnabled() ? ['deepseek' as const] : []),
  ...(process.env.AMAP_WEB_KEY ? ['amap' as const] : []),
  ...(process.env.SEARCH_API_KEY ? ['search' as const] : []),
];
const limiter = planLimiter(neededKinds);

export const app = express();
app.set('trust proxy', process.env.TRUST_PROXY?.trim() || 'loopback');
app.use(cors({ exposedHeaders: ['Retry-After'] }));
// 解析 IP → 查 banned_ips → 再进业务。/admin 不在此拦截，否则无法解禁。
app.use(accessGuard);
app.use(['/api', '/_AMapService'], publicLimiter);
mountAmapProxy(app);
app.use(express.json());
mountAdmin(app);
app.post('/api/session', (_q, r) => { r.set('Cache-Control', 'no-store').json({ token: createSession() }); });

/** 行程 + 引用到的景点快照（推荐卡、各版本路线、室内备选） */
async function view(t: Trip): Promise<TripView> {
  const ids = new Set<string>();
  t.messages.forEach(m => m.recommendations?.forEach(id => ids.add(id)));
  t.versions.forEach(v => v.days.forEach(d => { d.attractionIds.forEach(id => ids.add(id)); d.indoorAlternatives?.forEach(id => ids.add(id)); }));
  const atts = await getMany([...ids]);
  return { ...t, catalog: Object.fromEntries(atts.map((a: Attraction) => [a.id, a])) };
}
/** 服务端签发的匿名会话标识行程所有者。 */
const uid = (q: express.Request) => String(q.res!.locals.uid);
app.use('/api/trips', requireSession, rememberVisitor);
const need = (id: string, r: express.Response) => {
  const t = getTrip(id);
  if (!t || t.ownerId !== r.locals.uid) { r.status(404).json({ error: 'not found' }); return undefined; }
  return t;
};

app.get('/api/usage', (_q, r) => { r.json(usage()); });
app.get('/api/health', (_q, r) => { r.json({ ok: true, llm: llmMode, map: getMapProvider().name, search: getSearchProvider().name, sample: isSampleMode() }); });
app.get('/api/attractions/:id', async (q, r) => { const a = await getAttraction(q.params.id); a ? r.json(a) : r.status(404).end(); });
/** 按高德 POI ID 手动覆盖补充字段（source=manual）；body: { ticket: '...', closedDays: '' }，空串表示删除该字段 */
app.get('/api/trips', (_q, r) => { r.json(listTrips(uid(_q)).map(t => ({ ...t, catalog: {} }))); });
app.post('/api/trips', async (q, r) => { r.json(await view(await createTrip(uid(q), objectBody(q.body ?? {}).state))); });
app.get('/api/trips/:id', async (q, r) => { const t = need(String(q.params.id), r); if (t) r.json(await view(t)); });
app.delete('/api/trips/:id', async (q, r) => { if (need(String(q.params.id), r)) { await deleteTrip(q.params.id); r.json({ ok: true }); } });

/** 分享：只读快照（免登录访问） */
app.post('/api/trips/:id/share', async (q, r) => {
  const t = need(String(q.params.id), r); if (!t) return;
  try { r.json(createShare(await view(t))); } catch (e) { r.status(409).json({ error: (e as Error).message }); }
});
app.get('/api/shares/:sid', (q, r) => { const s = getShare(q.params.sid); s ? r.json(s) : r.status(404).json({ error: '分享不存在' }); });
/** 复制到我的行程：归到当前匿名 ID，快照版本作为 v1 */
app.post('/api/shares/:sid/copy', requireSession, rememberVisitor, async (q, r) => {
  const owner = uid(q);
  const s = getShare(String(q.params.sid)); if (!s) return void r.status(404).json({ error: '分享不存在' });
  const draft = { ...structuredClone(s.draft), version: 1, note: '复制自分享', createdAt: new Date().toISOString() };
  const t = await createTrip(owner, s.state, { versions: [draft], activeVersion: 1 });
  t.messages.push({ id: newId(), role: 'assistant', text: `已从分享「${s.title}」复制路线，你可以继续调整。`, at: new Date().toISOString() });
  await touch(t);
  r.json(await view(t));
});

app.patch('/api/trips/:id/state', async (q, r) => {
  const t = need(String(q.params.id), r); if (!t) return;
  const patch = statePatch(q.body);
  const updated = { ...t, state: { ...t.state, ...patch } };
  if (patch.preferences && JSON.stringify(patch.preferences) !== JSON.stringify(t.state.preferences)) delete updated.state.categoryPreference;
  await touch(updated); r.json(await view(updated));
});

app.post('/api/trips/:id/chat', limiter, async (q, r) => {
  const t = need(String(q.params.id), r); if (!t) return;
  const body = objectBody(q.body);
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) throw new InputError('请输入 1 到 2000 字的旅行问题');
  const text = body.message.trim();
  const history = t.messages.slice();
  t.messages.push({ id: newId(), role: 'user', text, at: new Date().toISOString() });
  const reply = async (message: string, recommendations?: string[], context?: NonNullable<Trip['messages'][number]['recommendationContext']>, locationClarification?: Trip['messages'][number]['locationClarification']) => {
    t.messages.push({ id: newId(), role: 'assistant', text: message, at: new Date().toISOString(), ...(recommendations ? { recommendations } : {}), ...(context ? { recommendationContext: context } : {}), ...(locationClarification ? { locationClarification } : {}) });
    await touch(t); r.json(await view(t));
  };
  let pendingLocation: Trip['messages'][number]['locationClarification'];
  try {
    const request = await understandTravelRequest(text, t.state, history);
    if (request.scope === 'unrelated') {
      await reply('我只能协助解答旅行相关问题，请告诉我你的旅行需求。'); return;
    }
    if (request.scope === 'clarify') { await reply(request.clarification); return; }
    // 模型只提议字段修改；后端验证地理事实，并在业务成功后才提交状态。
    const state = { ...t.state, ...request.patch };
    const notes: string[] = [];
    if (request.patch.days !== undefined || request.patch.pace !== undefined) {
      state.routeConstraints = { ...t.state.routeConstraints,
        ...(request.patch.days !== undefined ? { days: request.patch.days } : {}),
        ...(request.patch.pace !== undefined ? { pace: request.patch.pace } : {}),
      };
    }
    if (request.patch.destination !== undefined && request.patch.destination !== t.state.destination) {
      const hit = await getMapProvider().geocode(request.patch.destination);
      if (interpretGeocode(request.patch.destination, hit) !== 'region') {
        await reply('无法确认你想设置的目的地城市，请提供明确的城市名称。'); return;
      }
      state.destination = spoken(request.patch.destination);
      notes.push(`已按 ${state.destination} 更新目的地。`);
    }
    if (request.patch.days !== undefined && state.days !== t.state.days) notes.push(`已按 ${state.days} 天更新行程。`);
    if (request.preferenceUpdate === 'save') {
      state.categoryPreference = request.criteria;
      notes.push('已更新后续行程偏好。');
    } else if (request.preferenceUpdate === 'clear') {
      delete state.categoryPreference;
      notes.push('已清除此前保存的类别限制。');
    }
    if (!state.destination.trim()) {
      t.state = state;
      await reply(notes.join('') + NEED_CITY); return;
    }
    // 省可以写进规划参数，但检索与推荐需要具体城市；避免模型对省级目的地给出无法校验的结构后误报「服务不可用」。
    const destHit = await getMapProvider().geocode(state.destination);
    if (isBroadProvince(state.destination, destHit)) {
      t.state = state;
      await reply(notes.join('') + needCityInProvince(state.destination)); return;
    }
    let message: string;
    let ids: string[] | undefined;
    let context: Trip['messages'][number]['recommendationContext'];
    if (request.action === 'sightseeing') {
      const map = getMapProvider();
      if (map.name !== 'amap') {
        await reply('当前未配置真实地图服务，暂时无法检索目的地区域的真实景点。'); return;
      }
      pendingLocation = { action: 'sightseeing', query: request.query, place: request.sightseeingArea, criteria: request.criteria, searchKeywords: request.searchKeywords };
      const policy = recommendationPolicy();
      const area = await resolveAttractionArea(state.destination, request.query, request.sightseeingArea, map);
      const result = await candidateSearch(state.destination, state.preferences, {
        limit: policy.candidateLimit, enrich: false, keywords: request.searchKeywords, area,
      });
      const rec = await recommend(state, result.items, request, async ids => {
        await enrichMany(ids);
        return getMany(ids);
      }, { areaLabel: area.label, searchPartial: result.partial });
      await enrichMany(rec.ids);
      message = rec.text; ids = rec.ids;
      context = { query: request.query, criteria: request.criteria, searchKeywords: request.searchKeywords };
    } else if (request.action === 'food') {
      message = await recommendFood(state.destination, request.query, getMapProvider(), request.foodKeyword);
    } else if (request.action === 'lodging') {
      message = await recommendLodging(state.destination, request.query, getMapProvider(), request.lodging)
        ?? '目前没有可用的住宿地图资料，请稍后再试。';
    } else {
      const info = await lookupTravelInformation(state.destination, request.query, getSearchProvider());
      message = info.text;
      if (!info.available && request.specialtyNamesOnly) {
        const names = await specialtyNames(state.destination);
        if (names.length) message = `${state.destination}常见的特产或伴手礼可以参考：${names.join('、')}。这些是模型提供的参考，尚未核实具体来源；购买前请确认产地和商家信息。`;
      }
    }
    t.state = state;
    await reply(notes.join('') + message, ids, context);
  } catch (error) {
    if (error instanceof AreaResolutionError) { await reply(error.message, undefined, undefined, pendingLocation); return; }
    if (error instanceof AttractionSearchError) { await reply(error.message); return; }
    if (!(error instanceof SemanticError)) throw error;
    const dest = t.state.destination.trim();
    if (dest) {
      const hit = await getMapProvider().geocode(dest).catch(() => null);
      if (isBroadProvince(dest, hit)) {
        await reply(needCityInProvince(dest)); return;
      }
    }
    await reply(error.message);
  }
});

/** 生成路线：SSE。assign（骨架）→ day × N → done */
app.post('/api/trips/:id/plan', limiter, async (q, r) => {
  const t = need(String(q.params.id), r); if (!t) return;
  const ids = (await getMany(attractionIds(objectBody(q.body).attractionIds))).map(a => a.id);
  r.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (e: PlanEvent) => r.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  if (!ids.length) { send({ type: 'error', message: '请先勾选景点' }); return void r.end(); }
  const version = (t.versions.at(-1)?.version ?? 0) + 1;
  const draft: RouteDraft = { version, createdAt: new Date().toISOString(), note: `生成：${ids.length} 个景点`, days: [], complete: false };
  t.versions.push(draft); t.activeVersion = version;
  const planningState = routeState(t.state, ids.length);
  try {
    await planGraph.invoke({ trip: planningState, attractionIds: ids, version }, {
      configurable: {
        emit: (e: PlanEvent) => {
          if (e.type === 'assign') draft.days = e.days;
          if (e.type === 'day') draft.days = draft.days.map(d => d.day === e.day.day ? e.day : d);
          send(e);
        },
      },
    });
    draft.complete = true;
    t.state = { ...t.state, days: planningState.days, pace: planningState.pace };
    await touch(t);
    send({ type: 'done', version, trip: await view(t) });
  } catch (e) {
    // 失败的未完成版本回收，避免留下空草稿
    t.versions = t.versions.filter(v => v !== draft);
    t.activeVersion = t.versions.at(-1)?.version ?? null;
    await touch(t);
    send({ type: 'error', message: (e as Error).message, code: isQuotaError(e) ? 'daily' : undefined });
  }
  r.end();
});

/** 编辑（仅完整版本可编辑）：生成新版本 */
app.post('/api/trips/:id/edit', limiter, async (q, r) => {
  const t = need(String(q.params.id), r); if (!t) return;
  const base = t.versions.find(v => v.version === t.activeVersion);
  if (!base?.complete) return void r.status(409).json({ error: '路线生成完成后才能编辑' });
  const body = objectBody(q.body);
  const day = body.day;
  if (typeof day !== 'number' || !Number.isInteger(day) || !base.days.some(d => d.day === day)) throw new InputError('编辑的天数无效');
  const ids = attractionIds(body.attractionIds);
  if ((await getMany(ids)).length !== ids.length) throw new InputError('包含不存在的景点');
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 200)) throw new InputError('备注格式无效');
  const note = body.note as string | undefined;
  const days = await Promise.all(base.days.map(d => d.day !== day ? d
    : refineDay(t.state, { ...d, attractionIds: ids, names: [], status: 'skeleton' }, d.weather, true)));
  const version = (t.versions.at(-1)?.version ?? 0) + 1;
  t.versions.push({ version, createdAt: new Date().toISOString(), note: note ?? `编辑第 ${day} 天`, days, complete: true });
  t.activeVersion = version; await touch(t); r.json(await view(t));
});

app.post('/api/trips/:id/versions/:v/activate', async (q, r) => {
  const t = need(String(q.params.id), r); if (!t) return;
  const v = Number(q.params.v);
  if (!t.versions.some(x => x.version === v)) return void r.status(404).end();
  t.activeVersion = v; await touch(t); r.json(await view(t));
});

/** 统一错误：每日额度 → 429 */
app.use((err: unknown, _q: express.Request, r: express.Response, _n: express.NextFunction) => {
  if (err instanceof InputError) return void r.status(400).json({ error: err.message });
  if (isQuotaError(err)) return void r.status(429).json({ error: err.message, code: 'daily', kind: err.kind });
  console.error(err); r.status(500).json({ error: '服务暂时不可用' });
});

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  const start = async () => {
    const port = Number(process.env.PORT || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1 到 65535 的整数');
    console.log(`[server] 正在恢复行程，db=${DB_PATH}`);
    const n = await loadTrips();
    await new Promise<void>((resolve, reject) => {
      app.listen(port, err => err ? reject(err) : resolve());
    });
    console.log(`[server] http://localhost:${port}  llm=${llmMode} map=${getMapProvider().name} db=${DB_PATH} trips=${n}`);
  };
  start().catch(err => {
    console.error('[server] 启动失败:', err);
    process.exit(1);
  });
}
