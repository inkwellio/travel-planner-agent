import { useEffect, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import type { Attraction, DayPlan, RouteDraft, TripState } from '../../../shared/types';
import { captureResultCard, cardFilename, downloadBlob } from '../exportResultCard';
import { Icon } from './Icon';
import { fmtRange } from './ItineraryView';
import { LegCard } from './LegCard';
import { MapView } from './MapView';
import { RefTag } from './RefTag';
import { StopCard } from './StopCard';

const CARD_W = 720;

/** 规划结果卡片：复用右栏同一套标题、天气条、路线图、站点卡和交通段，按天纵向排开，供导出 PNG。 */
export function ResultCard({ draft, byId, state, cardRef }: {
  draft: RouteDraft; byId: Record<string, Attraction>; state: TripState; cardRef: Ref<HTMLDivElement>;
}) {
  const dayAtts = draft.days.map(d => (d.stops?.map(s => s.attractionId) ?? d.attractionIds).map(id => byId[id]).filter(Boolean));
  const totalKm = draft.days.flatMap(d => d.legs ?? []).reduce((s, l) => s + (l.driving?.distanceKm ?? 0), 0);
  return (
    <div ref={cardRef} data-testid="result-card" className="bg-background text-on-surface p-4" style={{ width: CARD_W }}>
      <div className="bg-surface-container-lowest rounded-panel border border-outline-variant overflow-hidden">
        <header className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-space-sm min-w-0 flex-wrap">
            <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">{state.destination}·{draft.days.length}天路线</h2>
          </div>
        </header>
        <div className="px-6 py-5 flex flex-col gap-5">
          {draft.days.filter(d => d.weather?.rainy).map(d => (
            <div key={d.day} className="flex items-start gap-3 p-4 rounded-card bg-secondary-fixed text-on-surface border border-outline-variant relative overflow-hidden">
              <div className="w-1.5 h-full bg-secondary-container absolute left-0 top-0" />
              <Icon name="thunderstorm" className="text-[22px] text-secondary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-title-md text-[14px] text-secondary font-semibold">天气提醒与室内备选<RefTag field={d.weather!} text="示例天气" /></span>
                  <span className="font-label-sm text-label-sm text-outline px-2 h-6 inline-flex items-center rounded-pill border border-outline-variant">{d.weather!.date} · {d.weather!.tempMin}–{d.weather!.tempMax}℃</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-relaxed">
                  第 {d.day} 天预报「{d.weather!.text}」，室外景点可替换为室内备选：
                  {(d.indoorAlternatives ?? []).map((id, i) => <span key={id}>{i > 0 && '、'}<span className="text-primary font-medium">「{byId[id]?.name}」</span></span>)}
                </p>
              </div>
            </div>
          ))}
          <div className="w-full rounded-card bg-surface-container-lowest border border-outline-variant p-5 flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-2"><Icon name="map" className="text-[18px] text-primary" /><span className="font-title-md text-[14px] text-on-surface font-semibold">{state.destination}全景路线示意</span></div>
              <div className="flex items-center gap-3 font-label-sm text-label-sm text-outline">
                {totalKm > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-pill bg-primary" /> 路线总长约 {totalKm.toFixed(1)} km</span>}
              </div>
            </div>
            <MapView days={dayAtts} activeDay={0} forceStatic />
          </div>
          {draft.days.map(day => <DayBlock key={day.day} day={day} byId={byId} />)}
        </div>
      </div>
    </div>
  );
}

function DayBlock({ day, byId }: { day: DayPlan; byId: Record<string, Attraction> }) {
  const ids = day.stops?.map(s => s.attractionId) ?? day.attractionIds;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-4 h-9 rounded-pill font-title-md text-[13px] border bg-primary text-on-primary border-primary w-fit">
        <Icon name="calendar_view_day" className="text-[16px]" />
        <span>Day {day.day}{day.weather ? ` · ${day.weather.text}` : ''} ({day.attractionIds.length}个地点)</span>
      </div>
      <div className="flex flex-col gap-space-md relative pl-4 mt-2">
        {day.summary && <p className="font-body-sm text-body-sm text-on-surface-variant">{day.summary}</p>}
        <div className="absolute left-8 top-16 bottom-6 w-px bg-outline-variant z-0" />
        {day.stops?.map((s, i) => {
          const a = byId[s.attractionId];
          const leg = day.legs?.[i];
          if (!a) return null;
          return (
            <div key={s.attractionId} className="flex flex-col gap-space-md">
              <StopCard a={a} index={i} time={fmtRange(s.arrive, s.stayMin)} expanded showThumb detailColumns={2} />
              {leg && <LegCard leg={leg} fromName={byId[leg.fromId]?.name ?? ''} toName={byId[leg.toId]?.name ?? ''} showBoth />}
            </div>
          );
        })}
        {!day.stops && ids.map((id, i) => {
          const a = byId[id];
          if (!a) return null;
          return <StopCard key={id} a={a} index={i} time="" expanded showThumb detailColumns={2} />;
        })}
      </div>
    </section>
  );
}

const LABEL = { idle: '导出卡片', busy: '导出中…', done: '已下载', error: '导出失败' } as const;

/** 规划结果工具条上的导出按钮。卡片画在视口内的裁剪层里，不撑开页面滚动。 */
export function ExportCardButton({ draft, byId, state, disabled }: {
  draft?: RouteDraft; byId: Record<string, Attraction>; state: TripState; disabled?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef({ draft, state });
  dataRef.current = { draft, state };
  const [phase, setPhase] = useState<keyof typeof LABEL>('idle');

  useEffect(() => {
    if (phase !== 'done' && phase !== 'error') return;
    const t = window.setTimeout(() => setPhase('idle'), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'busy') return;
    let cancelled = false;
    (async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const node = cardRef.current;
      const { draft: d, state: s } = dataRef.current;
      if (!node || !d || cancelled) { if (!cancelled) setPhase('error'); return; }
      try {
        const blob = await captureResultCard(node);
        if (cancelled) return;
        if (!blob.size) throw new Error('空图片');
        downloadBlob(blob, cardFilename(s.destination, d.days.length, d.version));
        setPhase('done');
      } catch (err) {
        console.error('[export-card]', err);
        if (!cancelled) setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [phase]);

  return (
    <>
      <button
        type="button"
        data-testid="export-card"
        data-export-state={phase}
        disabled={disabled || phase === 'busy'}
        onClick={() => setPhase('busy')}
        className="px-3.5 h-10 rounded-field bg-surface-container-lowest border border-outline-variant hover:bg-surface-container text-on-surface font-title-md text-[13px] flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
      >
        <Icon name={phase === 'busy' ? 'progress_activity' : 'image'} className={`text-[18px] ${phase === 'busy' ? 'animate-spin' : ''}`} />
        <span>{LABEL[phase]}</span>
      </button>
      {phase === 'busy' && draft && createPortal(
        <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: -1 }}>
          <ResultCard draft={draft} byId={byId} state={state} cardRef={cardRef} />
        </div>,
        document.body,
      )}
    </>
  );
}
