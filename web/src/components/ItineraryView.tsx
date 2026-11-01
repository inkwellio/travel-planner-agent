import type { Attraction, DayPlan, RouteDraft, TripState } from '../../../shared/types';
import { Icon } from './Icon';
import { LegCard } from './LegCard';
import { MapView } from './MapView';
import { RefTag } from './RefTag';
import { StopCard } from './StopCard';

export const fmtRange = (arrive: string, stay: number) => { const [h, m] = arrive.split(':').map(Number); const e = h * 60 + m + stay; return `${arrive} - ${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`; };

/** 单天只读视图：地图 + 天气 + 时间线 + 交通段（分享页 / 导出 PDF 共用） */
export function DayReadonly({ day, byId, print }: { day: DayPlan; byId: Record<string, Attraction>; print?: boolean }) {
  const pts = (day.stops?.map(s => s.attractionId) ?? day.attractionIds).map(id => byId[id]).filter(Boolean);
  return (
    <section className={`flex flex-col gap-space-md ${print ? 'print-page' : ''}`} data-testid="day-readonly">
      <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2 flex-wrap">
        <span className="px-2.5 h-7 inline-flex items-center rounded-pill bg-primary text-on-primary font-title-md text-[14px]">Day {day.day}</span>
        {day.weather && <span className="font-body-md text-body-md text-on-surface-variant">{day.weather.date} · {day.weather.text} {day.weather.tempMin}–{day.weather.tempMax}℃<RefTag field={day.weather} text="示例天气" /></span>}
      </h2>
      {day.weather?.rainy && day.indoorAlternatives?.length ? (
        <div className="p-3 rounded-card bg-secondary-fixed border border-outline-variant text-on-surface-variant font-body-sm text-body-sm flex gap-2"><Icon name="thunderstorm" className="text-secondary" />
          预报有雨，室内备选：{day.indoorAlternatives.map(id => byId[id]?.name).filter(Boolean).join('、')}</div>) : null}
      <div className="rounded-card bg-surface-container-lowest border border-outline-variant p-3"><MapView days={[pts]} activeDay={0} /></div>
      {day.summary && <p className="font-body-sm text-body-sm text-on-surface-variant">{day.summary}</p>}
      <div className="flex flex-col gap-space-md">
        {day.stops?.map((s, i) => {
          const a = byId[s.attractionId]; const leg = day.legs?.[i];
          if (!a) return null;
          return (
            <div key={s.attractionId} className="flex flex-col gap-space-md avoid-break">
              <StopCard a={a} index={i} time={fmtRange(s.arrive, s.stayMin)} expanded />
              {leg && <LegCard leg={leg} fromName={byId[leg.fromId]?.name ?? ''} toName={byId[leg.toId]?.name ?? ''} showBoth={print} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ItineraryHeader({ title, state, draft }: { title: string; state: TripState; draft: RouteDraft }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        {state.destination.trim() || '未定目的地'} · {draft.days.length} 天 · {state.preferences.join('、')} · 生成于 {new Date(draft.createdAt).toLocaleString('zh-CN', { hour12: false })}
      </p>
      <p className="font-label-sm text-label-sm text-outline">“仅供参考”为模型生成或示例数据；带“来源”的字段可查看原网页。出行前请以景区官方信息为准。</p>
    </div>
  );
}
