import { useEffect, useRef, useState } from 'react';
import { NEED_DESTINATION, NO_PLAN_WITHOUT_CITY, messageFromParams } from '../../shared/askFromParams';
import type { Attraction, PlanEvent, Trip, TripState, TripView } from '../../shared/types';
import { api, ApiError } from './api';
import { AppHeader, HEADER_H, type HeaderView } from './components/AppHeader';
import { ChatPanel } from './components/ChatPanel';
import { HistorySidebar } from './components/HistorySidebar';
import { Icon } from './components/Icon';
import { RoutePanel } from './components/RoutePanel';
import { StatusBar } from './components/StatusBar';

export default function App() {
  const [catalog, setCatalog] = useState<Record<string, Attraction>>({});
  const [sample, setSample] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trip, setTripRaw] = useState<Trip>();
  const tripRef = useRef<Trip | undefined>(undefined);
  const setTrip = (t: Trip | TripView) => {
    if ('catalog' in t && t.catalog) setCatalog(c => ({ ...c, ...t.catalog }));
    tripRef.current = t;
    setTripRaw(t);
  };
  // 规划参数的保存队列。聊天和生成必须等它结束，否则服务端还是空目的地，只会追问城市。
  const saveChain = useRef(Promise.resolve());
  const destDraft = useRef<string | null>(null);
  const [pendingCity, setPendingCity] = useState<string | null>(null);
  const sending = useRef(false);
  const planning = useRef(false);
  const navigation = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [drawer, setDrawer] = useState(false);       // 手机端左抽屉
  const [sheet, setSheet] = useState(false);         // 手机端底部抽屉展开
  const [collapsed, setCollapsed] = useState(false); // 桌面左栏收起
  const [view, setView] = useState<HeaderView>('plan'); // 顶栏：智能规划 / 我的行程
  const [shareUrl, setShareUrl] = useState('');
  // 限流：本地提示消息（不入库）+ 输入冷却倒计时
  const [notices, setNotices] = useState<{ id: string; role: 'assistant'; text: string }[]>([]);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const notify = (text: string) => setNotices(n => [...n, { id: 'n' + Date.now(), role: 'assistant', text }]);
  /** 统一处理 429：每分钟超限 → 倒计时；每日额度 → 提示明天再来 */
  const handleLimit = (e: unknown) => {
    if (e instanceof ApiError && e.status === 429) {
      if (e.code === 'daily') notify('今天的规划次数已用完，明天再来');
      else { notify('规划得有点快，稍等几秒再试'); setCooldown(e.retryAfter ?? 10); }
      return true;
    }
    return false;
  };
  // 手机底部抽屉：高度跟手拖动，松手吸附到 收起 / 半屏 / 全屏
  const PEEK = 64;
  const [sheetH, setSheetH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  // 全屏 = 视口减去顶部导航（盖住状态标签栏）
  const snaps = () => [PEEK, Math.round(window.innerHeight * 0.5), window.innerHeight - HEADER_H];
  const byId = catalog;

  const refreshList = () => api.trips().then(setTrips).catch(() => notify('行程列表更新失败，请稍后重试'));
  const apply = (t: TripView) => { setTrip(t); refreshList(); };

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    api.health().then(h => { if (!cancelled) setSample(h.sample); }).catch(() => {});
    api.trips().then(async ts => {
      const want = new URLSearchParams(location.search).get('trip');
      const pick = ts.find(x => x.id === want) ?? ts[0];
      const t = pick ? await api.getTrip(pick.id) : await api.createTrip();
      if (cancelled) return;
      if (want) history.replaceState(null, '', '/');
      setTrip(t); setTrips(ts.length ? ts : [t]);
    }).catch(() => { if (!cancelled) setLoadError('行程加载失败，请检查网络连接后重试。'); });
    return () => { cancelled = true; };
  }, [loadAttempt]);
  useEffect(() => {
    const last = [...(trip?.messages ?? [])].reverse().find(m => m.recommendations);
    setSelected(new Set(last?.recommendations ?? []));
  }, [trip?.id, trip?.messages.length]);

  const rememberDraft = (destination: string | null) => {
    destDraft.current = destination;
    setPendingCity(destination);
  };
  /** 立刻改本地行程，再按顺序把最新参数 PATCH 落库。后一次编辑不会被前一次响应盖掉。 */
  const patchState = (p: Partial<TripState>) => {
    const current = tripRef.current;
    if (!current) return Promise.resolve();
    const state: TripState = { ...current.state, ...p };
    if (p.preferences) delete state.categoryPreference;
    if (typeof p.destination === 'string') state.destination = p.destination.trim();
    if (p.days != null) state.days = Math.max(1, Math.min(7, Number(p.days) || current.state.days));
    const city = state.destination.trim();
    const optimistic: Trip = { ...current, state, title: city ? `${city}旅行` : '新的旅行' };
    setTrip(optimistic);
    const id = current.id;
    const run = saveChain.current.then(async () => {
      const local = tripRef.current;
      if (!local || local.id !== id) return;
      const body = local.state;
      try {
        const view = await api.patchState(id, body);
        const now = tripRef.current;
        if (!now || now.id !== id) return;
        const kept = now.state !== body;
        setTrip({ ...view, state: kept ? now.state : view.state, messages: now.messages, title: kept ? now.title : view.title });
      } catch (e) {
        if (!handleLimit(e)) notify('规划参数没有保存，请再选一次');
        try {
          const fresh = await api.getTrip(id);
          if (tripRef.current?.id === id) setTrip(fresh);
        } catch { /* 保留屏幕上的选择 */ }
        throw e;
      }
    });
    saveChain.current = run.then(() => undefined, () => undefined);
    return run;
  };
  const flushState = async () => {
    const current = tripRef.current;
    if (!current) return undefined;
    const draft = destDraft.current;
    if (draft !== null && draft.trim() !== current.state.destination.trim()) {
      rememberDraft(null);
      await patchState({ destination: draft.trim() });
    }
    for (let i = 0; i < 8; i++) {
      const pending = saveChain.current;
      await pending;
      if (saveChain.current === pending) break;
    }
    return tripRef.current;
  };
  const send = async (text: string) => {
    if (sending.current || planning.current || !tripRef.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const latest = await flushState();
      if (!latest) return;
      const typed = text.trim();
      const city = latest.state.destination.trim();
      if (!typed && !city) { notify(NEED_DESTINATION); return; }
      const message = typed || messageFromParams(latest.state);
      setNotices([]);
      const snapshot = tripRef.current ?? latest;
      setTrip({ ...snapshot, messages: [...snapshot.messages, { id: 'tmp', role: 'user', text: message }] });
      try {
        const view = await api.chat(snapshot.id, message);
        if (tripRef.current?.id === snapshot.id) apply(view);
      } catch (e) {
        if (tripRef.current?.id !== snapshot.id) return;
        setTrip(snapshot);
        if (!handleLimit(e)) notify('出了点问题，请稍后再试');
      }
    } catch { /* 参数没保存时 patchState 已经提示过 */ }
    finally { sending.current = false; setBusy(false); }
  };
  const generate = async () => {
    if (planning.current || sending.current || !tripRef.current) return;
    planning.current = true;
    setStreaming(true);
    const requestedId = tripRef.current.id;
    try {
      const current = await flushState();
      if (!current || current.id !== requestedId) return;
      if (!current.state.destination.trim()) { notify(NO_PLAN_WITHOUT_CITY); return; }
      setSheet(true); setSheetH(null);
      const onEvent = (e: PlanEvent) => {
        const t = tripRef.current;
        if (!t || t.id !== requestedId) return;
        if (e.type === 'assign') setTrip({ ...t, activeVersion: e.version, versions: [...t.versions.filter(v => v.version !== e.version), { version: e.version, createdAt: new Date().toISOString(), note: '生成中', days: e.days, complete: false }] });
        if (e.type === 'day') setTrip({ ...t, versions: t.versions.map(v => v.version === e.version ? { ...v, days: v.days.map(d => d.day === e.day.day ? e.day : d) } : v) });
        if (e.type === 'done' && e.trip.id === requestedId) apply(e.trip);
        if (e.type === 'error') {
          notify(e.code === 'daily' ? '今天的规划次数已用完，明天再来' : e.message);
          api.getTrip(requestedId).then(view => { if (tripRef.current?.id === requestedId) apply(view); }).catch(() => {});
        }
      };
      await api.plan(requestedId, [...selected], onEvent);
    } catch (e) { if (!handleLimit(e)) notify('生成失败，请稍后再试'); }
    finally { planning.current = false; setStreaming(false); }
  };
  const activate = async (v: number) => { if (trip) apply(await api.activate(trip.id, v)); };
  const edit = async (day: number, ids: string[], note: string) => { if (!trip) return; try { apply(await api.edit(trip.id, day, ids, note)); } catch (e) { if (!handleLimit(e)) notify('调整失败，请稍后再试'); } };
  const share = async () => {
    if (!trip) return;
    const snap = await api.share(trip.id);
    const url = `${location.origin}/s/${snap.id}`;
    setShareUrl(url);
    navigator.clipboard?.writeText(url).catch(() => {});
  };
  const exportPdf = () => { if (trip && draft) window.open(`/print/${trip.id}?v=${draft.version}`, '_blank'); };
  const openPlan = () => { setView('plan'); setDrawer(false); };
  /** 桌面展开左栏；窄屏打开同一份行程列表抽屉。聚焦放在提交后的 effect，避免栏还没收起时找不到输入框。 */
  const openTrips = () => {
    setView('trips');
    if (window.innerWidth >= 1024) setCollapsed(false);
    else setDrawer(true);
  };
  useEffect(() => {
    if (view !== 'trips' || window.innerWidth < 1024) return;
    const inputs = [...document.querySelectorAll<HTMLInputElement>('[data-testid="trip-search"]')];
    inputs.find(el => el.getClientRects().length > 0)?.focus();
  }, [view, collapsed]);
  const canNavigate = () => {
    if (!planning.current && !sending.current) return true;
    notify('正在处理当前行程，请完成后再切换或新建');
    return false;
  };
  const newTrip = async () => {
    if (!canNavigate()) return;
    const request = ++navigation.current;
    try {
      const view = await api.createTrip();
      if (request !== navigation.current || planning.current || sending.current) return;
      rememberDraft(null); setNotices([]); apply(view); openPlan();
    } catch { notify('新建失败，请稍后再试'); }
  };
  const select = async (id: string) => {
    if (!canNavigate()) return;
    const request = ++navigation.current;
    try {
      const view = await api.getTrip(id);
      if (request !== navigation.current || planning.current || sending.current) return;
      rememberDraft(null); setNotices([]); setTrip(view); openPlan();
    } catch { notify('加载行程失败，请稍后再试'); }
  };
  const removeTrip = async (id: string) => {
    if (planning.current || sending.current) { notify('正在处理当前行程，完成后再删除'); return; }
    try { await api.deleteTrip(id); }
    catch { notify('删除失败，请稍后再试'); return; }
    const rest = trips.filter(t => t.id !== id);
    if (trip?.id !== id) { setTrips(rest); return; }
    if (rest.length) { setNotices([]); setTrip(await api.getTrip(rest[0].id)); setTrips(rest); }
    else {
      const created = await api.createTrip();
      setTrip(created);
      setTrips([created]);
      setNotices([{ id: 'n' + Date.now(), role: 'assistant', text: '上一条行程已删除。下面是一条新的空白行程。' }]);
    }
  };

  const draft = trip?.versions.find(v => v.version === trip.activeVersion);
  const dragY = useRef<number | null>(null);

  const sheetStyle = typeof window !== 'undefined' && window.innerWidth < 1024
    ? { height: sheetH ?? (sheet ? `calc(100dvh - ${HEADER_H}px)` : PEEK) } : undefined;

  if (!trip) return <div className="h-screen flex flex-col gap-4 items-center justify-center text-outline" role="status">
    {loadError || '加载中…'}
    {loadError && <button className="px-4 py-2 rounded-pill bg-primary text-on-primary" onClick={() => { setLoadError(''); setLoadAttempt(n => n + 1); }}>重新加载</button>}
  </div>;
  return (
    <div className="bg-background font-body-md text-on-surface h-dvh overflow-hidden">
      <AppHeader onMenu={() => drawer ? openPlan() : openTrips()} view={view} onView={v => v === 'trips' ? openTrips() : openPlan()} />
      <main className="w-full bg-background" style={{ paddingTop: HEADER_H }}>
        <div className="flex w-full min-h-0 overflow-hidden lg:p-4 lg:gap-4" style={{ height: `calc(100dvh - ${HEADER_H}px)` }}>
          {/* 左栏：桌面常驻白卡片，手机为抽屉 */}
          <div className="hidden lg:flex h-full min-h-0 overflow-hidden"><HistorySidebar trips={trips} activeId={trip.id} onSelect={select} onNew={newTrip} onDelete={removeTrip} collapsed={collapsed} onToggle={() => setCollapsed(c => { const next = !c; setView(next ? 'plan' : 'trips'); return next; })} highlighted={view === 'trips'} /></div>
          {drawer && <div className="lg:hidden fixed inset-x-0 bottom-0 z-[60] flex" style={{ top: HEADER_H }} data-testid="drawer">
            <div className="h-full min-h-0 overflow-hidden"><HistorySidebar trips={trips} activeId={trip.id} onSelect={select} onNew={newTrip} onDelete={removeTrip} highlighted /></div>
            <div className="flex-1 bg-surface-dim" onClick={openPlan} />
          </div>}

          {/* 中栏：参数标签 + 聊天 */}
          <section className="w-full lg:w-[380px] xl:w-[440px] lg:max-w-[480px] min-h-0 flex-shrink-0 flex flex-col bg-surface-container-lowest overflow-hidden lg:rounded-panel lg:border lg:border-outline-variant pb-16 lg:pb-0">
            <StatusBar state={trip.state} onChange={patchState} onDestinationDraft={rememberDraft} disabled={streaming || busy} />
            <ChatPanel messages={[...trip.messages, ...notices]} cooldown={cooldown} byId={byId} selected={selected} busy={busy} streaming={streaming} state={trip.state} pendingDestination={pendingCity}
              onToggle={id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onSend={send} onGenerate={generate} sample={sample} />
          </section>

          {/* 右栏：桌面常驻，手机为可上拉底部抽屉 */}
          <div data-testid="route-sheet" style={sheetStyle}
            className={`fixed inset-x-0 bottom-0 z-[45] flex min-h-0 flex-col bg-surface-container-lowest rounded-t-panel border-t border-outline-variant ${drag.current ? '' : 'transition-[height] duration-300'}
              lg:static lg:!h-auto lg:flex-1 lg:rounded-panel lg:border overflow-hidden`}>
            <div role="button" tabIndex={0} className="lg:hidden w-full flex flex-col items-center pt-2 pb-2 shrink-0 touch-none select-none cursor-grab" aria-label="展开/收起规划结果"
              onKeyDown={e => { if (e.key === 'Enter') setSheet(s => !s); }}
              onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, h: sheetH ?? (sheet ? snaps()[2] : PEEK), moved: false }; }}
              onPointerMove={e => { const d = drag.current; if (!d) return; const dy = d.y - e.clientY; if (Math.abs(dy) > 4) d.moved = true; setSheetH(Math.max(PEEK, Math.min(window.innerHeight - HEADER_H, d.h + dy))); }}
              onPointerUp={() => {
                const d = drag.current; drag.current = null; if (!d) return;
                if (!d.moved) { setSheetH(null); setSheet(s => !s); return; }
                const h = sheetH ?? d.h; const target = snaps().reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
                setSheetH(target === PEEK || target === snaps()[2] ? null : target); setSheet(target !== PEEK);
              }}>
              <span className="w-10 h-1 rounded-pill bg-outline-variant" />
              <span className="mt-1.5 font-label-md text-label-md text-on-surface flex items-center gap-1">
                <Icon name="map" className="text-[16px] text-primary" />
                {draft && streaming ? '规划结果（生成中）' : '规划结果'}
                <Icon name={sheet ? 'expand_more' : 'expand_less'} className="text-[16px]" />
              </span>
            </div>
            <div className={`flex-1 min-h-0 flex flex-col ${sheet || sheetH ? '' : 'hidden'} lg:flex`}>
              <RoutePanel draft={draft} versions={trip.versions} streaming={streaming} byId={byId} state={trip.state} onActivate={activate} onEdit={edit} onShare={share} onExport={exportPdf} />
            </div>
          </div>
        </div>
      </main>
      {shareUrl && <div className="fixed left-1/2 -translate-x-1/2 bottom-20 lg:bottom-6 z-[70] max-w-[92vw] px-4 py-3 rounded-card bg-surface-container-lowest text-on-surface border border-outline-variant flex items-center gap-3 font-body-sm text-body-sm" data-testid="share-toast">
        <Icon name="link" className="text-[18px]" />
        <span className="truncate">只读链接已复制：<a className="underline" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></span>
        <button onClick={() => setShareUrl('')} aria-label="关闭"><Icon name="close" className="text-[18px]" /></button>
      </div>}
    </div>
  );
}
