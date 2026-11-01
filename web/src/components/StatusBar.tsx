import { useEffect, useRef, useState } from 'react';
import type { TripState } from '../../../shared/types';
import { Icon } from './Icon';

const PREFS = ['自然风光', '人文历史', '美食', '茶文化', '亲子', '小众', '夜景'];
type Key = 'destination' | 'preferences';

const chipBase = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-pill font-label-sm text-label-sm shrink-0 border';
const optCls = (on: boolean) => `px-3 h-8 rounded-pill font-label-md text-label-md border ${on ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant hover:bg-surface-container text-on-surface'}`;

/** 顶部参数标签栏：目的地 / 偏好（对应后端 TripState） */
export function StatusBar({ state, onChange, onDestinationDraft, disabled }: {
  state: TripState;
  onChange: (p: Partial<TripState>) => void;
  /** 城市还在输入框里、尚未写入行程时，把当前文字同步出去，发送前会先落库。 */
  onDestinationDraft?: (destination: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<Key | null>(null);
  const [dest, setDest] = useState(state.destination);
  const committed = useRef(state.destination.trim());
  useEffect(() => { committed.current = state.destination.trim(); }, [state.destination]);
  useEffect(() => { if (open !== 'destination') setDest(state.destination); }, [state.destination, open]);

  const commitDest = (raw: string) => {
    const destination = raw.trim();
    onDestinationDraft?.(null);
    if (destination === committed.current) return;
    committed.current = destination;
    onChange({ destination });
  };
  const chip = (k: Key, icon: string, label: string, primary = false) => {
    const tone = primary
      ? 'bg-surface-container text-primary border-primary font-semibold'
      : 'bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container';
    return (
      <button key={k} data-key={k} disabled={disabled} onClick={() => setOpen(open === k ? null : k)}
        className={`${chipBase} ${tone} ${open === k ? 'border-primary' : ''} disabled:opacity-60`}>
        <Icon name={icon} className="text-[15px] text-outline" /><span>{label}</span><Icon name={primary ? 'edit' : 'expand_more'} className="text-[14px] text-outline" />
      </button>
    );
  };
  return (
    <div className="relative bg-surface-container-low border-b border-outline-variant z-10">
      <div className="px-4 md:px-5 py-3 flex items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar lg:flex-wrap lg:overflow-visible">
        <span className="font-label-sm text-label-sm text-outline shrink-0">规划参数:</span>
        {chip('destination', 'location_on', (open === 'destination' ? dest : state.destination).trim() || '目的地', true)}
        {chip('preferences', 'favorite', state.preferences.join('·') || '偏好')}
      </div>
      {open && (
        <div role="dialog" className="absolute left-4 right-4 md:left-5 md:right-5 top-full mt-1 p-4 rounded-card bg-surface-container-lowest border border-outline-variant flex flex-wrap items-center gap-2 z-30">
          {open === 'destination' && <>
            <input data-testid="destination-input" placeholder="输入城市" value={dest} disabled={disabled}
              className="px-2.5 h-8 rounded-field bg-background border border-outline-variant font-body-sm text-body-sm focus:outline-none focus:border-primary"
              onChange={e => { setDest(e.target.value); onDestinationDraft?.(e.target.value); }}
              onBlur={e => commitDest(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitDest(dest); setOpen(null); } }} />
          </>}
          {open === 'preferences' && PREFS.map(p => {
            const on = state.preferences.includes(p);
            return <button key={p} className={optCls(on)} onClick={() => onChange({ preferences: on ? state.preferences.filter(x => x !== p) : [...state.preferences, p] })}>{p}</button>;
          })}
          <button className="ml-auto text-primary font-label-md text-label-md px-2 py-1" onMouseDown={e => e.preventDefault()} onClick={() => { if (open === 'destination') commitDest(dest); setOpen(null); }}>完成</button>
        </div>
      )}
    </div>
  );
}
