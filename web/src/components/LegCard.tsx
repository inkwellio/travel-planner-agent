import { useEffect, useState } from 'react';
import type { Leg, TransitRoute } from '../../../shared/types';
import { transitChoices, transitLineMode } from '../../../shared/transit';
import { Icon } from './Icon';
import { RefTag } from './RefTag';

type Mode = 'subway' | 'bus' | 'driving';
const labelOf = { subway: '地铁', bus: '公交', driving: '自驾' };
const iconOf = { subway: 'subway', bus: 'directions_bus', driving: 'directions_car' };

function TransitBlock({ option, label, toName }: { option: TransitRoute; label: string; toName: string }) {
  return <div className="p-3 bg-surface-container-lowest rounded-card border border-outline-variant flex flex-col gap-2">
    <div className="font-label-md text-label-md font-semibold text-primary">{label}</div>
    <div className="flex items-center gap-2 text-[12px] flex-wrap">
      {!!option.walkMeters && <div className="flex items-center gap-1 text-on-surface"><Icon name="directions_walk" className="text-[15px] text-outline" /><span>步行约 {option.walkMeters} 米</span></div>}
      {option.lines.map((line, i) => {
        const kind = transitLineMode(option, i);
        return <span key={i} className="contents">
          <Icon name="arrow_forward" className="text-[14px] text-outline" />
          <div className="flex items-center gap-1 px-2 h-6 rounded-pill bg-tertiary-fixed text-tertiary font-medium"><Icon name={kind === 'subway' ? 'subway' : kind === 'bus' ? 'directions_bus' : 'route'} className="text-[14px]" /><span>{line}</span></div>
          {option.transfers[i] && <span className="text-on-surface-variant text-[11px]">在「{option.transfers[i]}」换乘</span>}
        </span>;
      })}
      <Icon name="arrow_forward" className="text-[14px] text-outline" />
      <div className="text-on-surface font-medium">「{toName.split('·')[0]}」</div>
    </div>
    <div className="flex items-center justify-between pt-1 border-t border-surface-container font-label-sm text-label-sm text-outline flex-wrap gap-1">
      <span>总耗时约 <strong className="text-primary font-semibold">{option.durationMin}分钟</strong> | 换乘 {option.transfers.length} 次<RefTag field={option} text="示例估算·仅供参考" /></span>
      <span className="text-tertiary font-semibold">{option.fare == null ? '票价待确认' : `票价: ¥${option.fare.toFixed(2)}/人`}</span>
    </div>
  </div>;
}

/** 默认地铁优先，没有地铁时展示公交；showBoth 用于打印/导出全部可用方案。 */
export function LegCard({ leg, fromName, toName, showBoth }: { leg: Leg; fromName: string; toName: string; showBoth?: boolean }) {
  const options = transitChoices(leg.transit);
  const preferred: Mode = options.subway ? 'subway' : 'bus';
  const [mode, setMode] = useState<Mode>(preferred);
  useEffect(() => setMode(preferred), [leg, preferred]);
  const d = leg.driving;
  const publicModes = ['subway', 'bus'] as const;
  const missing = (kind: 'subway' | 'bus') => leg.transitStatus === 'unavailable' || leg.transit?.availability?.[kind] === 'unavailable'
    ? `${labelOf[kind]}方案暂时无法查询，请稍后重试。` : `未查询到可用${labelOf[kind]}方案。`;
  return (
    <div className="relative z-10 flex items-start gap-space-md my-1" data-testid="leg">
      <div className="w-8 flex justify-center shrink-0 pt-4">
        <div className="w-4 h-4 rounded-pill bg-secondary text-on-secondary flex items-center justify-center"><Icon name={iconOf[showBoth ? preferred : mode]} className="text-[11px]" /></div>
      </div>
      <div className="flex-1 min-w-0 rounded-card bg-surface-container-low border border-outline-variant p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-label-md text-label-md font-semibold text-on-surface truncate">从 {fromName.split('·')[0]} 到 {toName.split('·')[0]}</span>
            {d && <span className="font-label-sm text-label-sm text-outline">路程 {d.distanceKm} km</span>}
          </div>
          {!showBoth && <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-field border border-outline-variant text-label-sm font-label-sm">
            {(['subway', 'bus', 'driving'] as const).map(kind => <button key={kind} aria-pressed={mode === kind} onClick={() => setMode(kind)} className={`px-2.5 h-7 rounded-pill flex items-center gap-1 ${mode === kind ? 'bg-primary text-on-primary font-medium' : 'text-on-surface-variant hover:text-on-surface'}`}>
              <Icon name={iconOf[kind]} className="text-[14px]" /><span>{labelOf[kind]}</span>
            </button>)}
          </div>}
        </div>
        {!options.subway && options.bus && <p className="text-label-sm text-outline">{leg.transit?.availability?.subway === 'unavailable' ? '地铁方案暂时无法查询，当前先展示公交。' : '未查询到可用地铁方案，当前优先展示公交。'}</p>}
        {publicModes.map(kind => {
          const option = options[kind];
          if (!showBoth && mode !== kind) return null;
          if (!option) return !showBoth ? <p key={kind} className="text-body-sm text-outline">{missing(kind)}</p> : null;
          const label = kind === 'subway' ? `地铁优先${option.lineModes?.includes('bus') ? '（含公交接驳）' : ''}` : '公交方案';
          return <TransitBlock key={kind} option={option} label={label} toName={toName} />;
        })}
        {showBoth && !leg.transit && <p className="text-body-sm text-outline">{leg.transitStatus === 'unavailable' ? '公共交通方案暂时无法查询。' : '未查询到可用公共交通方案。'}</p>}
        {(showBoth || mode === 'driving') && (d ? (
          <div className="p-3 bg-surface-container-lowest rounded-card border border-outline-variant flex flex-col gap-2 text-[12px]">
            <div className="font-label-md text-label-md font-semibold text-primary">自驾方案</div>
            <div className="flex items-center gap-4 flex-wrap text-on-surface">
              <span className="flex items-center gap-1"><Icon name="schedule" className="text-[15px] text-outline" />用时 <strong className="text-primary">{d.durationMin} 分钟</strong></span>
              <span className="flex items-center gap-1"><Icon name="route" className="text-[15px] text-outline" />里程 {d.distanceKm} km</span>
              <span className="flex items-center gap-1"><Icon name="toll" className="text-[15px] text-outline" />过路费 ¥{d.tolls}</span>
              <RefTag field={d} text="示例估算·仅供参考" />
            </div>
            <div className="flex items-center gap-1 text-outline pt-1 border-t border-surface-container"><Icon name="local_parking" className="text-[14px] text-error" /><span>{d.parking}</span></div>
          </div>
        ) : !showBoth && <p className="text-body-sm text-outline">未查询到可用自驾方案。</p>)}
      </div>
    </div>
  );
}
