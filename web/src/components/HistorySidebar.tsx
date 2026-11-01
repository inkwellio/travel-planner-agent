import { useState } from 'react';
import type { Trip } from '../../../shared/types';
import { Icon } from './Icon';

type Bucket = '今天' | '本周' | '更早';

function bucketOf(iso: string): Bucket {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return '今天';
  const week = new Date(start);
  week.setDate(week.getDate() - 7);
  return d >= week ? '本周' : '更早';
}

function stamp(t: Trip) {
  const d = new Date(t.updatedAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const days = t.versions.find(v => v.version === t.activeVersion)?.days.length;
  return `${mm}.${dd}${days ? ` · ${days}天` : ''}`;
}

/** 我的行程：真实行程按更新日期分组。桌面默认 230px，顶栏打开时加宽到 300px；手机为顶栏下方的抽屉。 */
export function HistorySidebar({ trips, activeId, onSelect, onNew, onDelete, collapsed, onToggle, highlighted }: {
  trips: Trip[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => Promise<void> | void;
  collapsed?: boolean;
  onToggle?: () => void;
  /** 顶栏「我的行程」打开时描边强调，表示当前在看行程列表 */
  highlighted?: boolean;
}) {
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const kw = q.trim().toLowerCase();
  const shown = kw ? trips.filter(t => [t.title, t.state.destination, t.state.companions, ...t.state.preferences, ...t.versions.flatMap(v => v.days.flatMap(d => d.names))].join(' ').toLowerCase().includes(kw)) : trips;
  const buckets: Bucket[] = ['今天', '本周', '更早'];
  const confirmDelete = async (id: string) => {
    if (!onDelete || busyId) return;
    setBusyId(id);
    try { await onDelete(id); setPending(null); }
    finally { setBusyId(null); }
  };
  return (
    <aside aria-label="我的行程" data-testid="trip-history" data-highlighted={highlighted ? 'true' : 'false'} className={`${collapsed ? 'w-16' : highlighted ? 'w-[300px]' : 'w-[230px]'} h-full min-h-0 overflow-hidden flex-shrink-0 flex flex-col bg-surface-container-lowest border-r lg:border lg:rounded-panel z-20 transition-[width] duration-300 relative ${highlighted ? 'border-primary' : 'border-outline-variant'}`}>
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        {!collapsed && <div className="px-1">
          <div className="font-headline-sm text-[16px] leading-6 text-on-surface">我的行程</div>
          <div className="font-label-sm text-[11px] leading-4 text-outline">{trips.length ? `共 ${trips.length} 条 · 一次对话一条` : '一次对话就是一条行程'}</div>
        </div>}
        <button onClick={onNew} className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-primary hover:bg-primary-container text-on-primary font-title-md text-[14px] rounded-pill">
          <Icon name="add" className="text-[18px]" />{!collapsed && <span>新建行程</span>}
        </button>
        {!collapsed && <div className="relative flex items-center">
          <Icon name="search" className="absolute left-3 text-[16px] text-on-surface-variant" />
          <input className="w-full h-10 pl-9 pr-3 bg-surface-container-low border border-outline-variant text-on-surface font-body-sm text-body-sm rounded-pill focus:outline-none focus:border-primary placeholder:text-outline" placeholder="搜索我的行程" type="search" value={q} onChange={e => setQ(e.target.value)} data-testid="trip-search" />
        </div>}
      </div>
      <div className="pane-scroll flex-1" data-testid="history-scroll">
      <div className="px-3 py-1 flex flex-col gap-4">
        {!shown.length && <div className="px-2 py-4 flex flex-col gap-1">
          <div className="font-body-sm text-body-sm text-on-surface-variant">{kw ? '没有匹配的行程' : '还没有行程'}</div>
          <div className="font-label-sm text-[11px] leading-4 text-outline">{kw ? '换个词，或新建一条行程' : '点上方「新建行程」开始规划'}</div>
        </div>}
        {buckets.map(name => {
          const rows = shown.filter(t => bucketOf(t.updatedAt) === name);
          if (!rows.length) return null;
          return (
            <div key={name} className="flex flex-col gap-1.5">
              {!collapsed && <div className="px-2 font-label-sm text-label-sm text-outline tracking-wider font-semibold">{name}</div>}
              {rows.map(t => {
                const on = t.id === activeId;
                const asking = pending === t.id;
                return (
                  <div key={t.id} onClick={() => { if (!asking) onSelect(t.id); }} className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-card text-on-surface cursor-pointer ${on ? 'bg-surface-container' : 'hover:bg-surface-container-low'}`}>
                    {collapsed ? <span className="w-8 h-8 rounded-card bg-surface-container text-primary font-headline-sm text-[14px] flex items-center justify-center">{t.title.slice(0, 1) || '行'}</span> : <>
                      <div className="flex-1 min-w-0">
                        <div className="font-headline-sm text-[15px] leading-5 text-on-surface truncate">{t.title}</div>
                        {asking ? (
                          <div className="mt-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button type="button" disabled={busyId === t.id} data-testid="confirm-delete-trip" className="h-6 px-2 rounded-pill bg-error text-on-error font-label-sm text-[11px] leading-4 disabled:opacity-50" onClick={() => confirmDelete(t.id)}>删除</button>
                            <button type="button" className="h-6 px-2 rounded-pill border border-outline-variant text-on-surface-variant font-label-sm text-[11px] leading-4 hover:bg-surface-container" onClick={() => setPending(null)}>取消</button>
                          </div>
                        ) : <div className="font-label-sm text-[11px] leading-4 text-on-surface-variant mt-0.5">{stamp(t)}</div>}
                      </div>
                      {!asking && <div className="flex items-center gap-1 shrink-0">
                        {on && <span className="w-1.5 h-1.5 rounded-pill bg-secondary" />}
                        {onDelete && <button type="button" aria-label={`删除${t.title}`} data-testid="delete-trip" className="w-7 h-7 rounded-pill inline-flex items-center justify-center text-outline hover:text-error hover:bg-error-container" onClick={e => { e.stopPropagation(); setPending(t.id); }}>
                          <Icon name="delete" className="text-[15px]" />
                        </button>}
                      </div>}
                    </>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
      {onToggle && <div className="px-3 py-3 border-t border-outline-variant flex items-center">
        <button onClick={onToggle} className="flex items-center gap-2 px-2.5 h-9 rounded-pill text-on-surface-variant hover:bg-surface-container font-label-md text-label-md w-full">
          <Icon name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} className="text-[18px]" />
          {!collapsed && <span className="truncate">收起行程</span>}
        </button>
      </div>}
    </aside>
  );
}
