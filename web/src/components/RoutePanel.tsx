import { useEffect, useState } from 'react';
import type { Attraction, DayPlan, RouteDraft, TripState } from '../../../shared/types';
import { Icon } from './Icon';
import { LegCard } from './LegCard';
import { MapView } from './MapView';
import { RefTag } from './RefTag';
import { StopCard } from './StopCard';
import { fmtRange } from './ItineraryView';
import { ExportCardButton } from './ResultCard';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  draft?: RouteDraft; versions: RouteDraft[]; streaming: boolean; byId: Record<string, Attraction>; state: TripState;
  onActivate: (v: number) => void; onEdit: (day: number, ids: string[], note: string) => void;
  onShare: () => void; onExport: () => void;
}

/** 稳定空数组，避免城市概览地图因每次渲染的新引用被拆掉重建 */
const EMPTY_DAYS: Attraction[][] = [];

/** 右栏：规划结果面板 */
export function RoutePanel({ draft, versions, streaming, byId, state, onActivate, onEdit, onShare, onExport }: Props) {
  const [dayIdx, setDayIdx] = useState(0);
  const city = state.destination.trim();
  useEffect(() => { setDayIdx(0); }, [draft?.version]);
  if (!draft) return (
    <div className="result-scroll overflow-y-auto flex-1 px-5 md:px-6 pt-5" data-testid="city-overview">
      <div className="flex min-h-full flex-col gap-3 rounded-card border border-outline-variant bg-surface-container-lowest p-4 md:p-5">
        <div className="flex items-center gap-2 shrink-0">
          <Icon name="map" className="text-[18px] text-primary" />
          <span className="font-title-md text-[14px] text-on-surface font-semibold">{city ? `${city}概览` : '先选择目的地'}</span>
        </div>
        {city
          ? <MapView city={city} days={EMPTY_DAYS} activeDay={0} className="w-full flex-1 min-h-[240px] rounded-card overflow-hidden" />
          : <div data-testid="need-destination" className="w-full flex-1 min-h-[240px] rounded-card bg-surface-container flex items-center justify-center text-center px-6 font-body-md text-body-md text-on-surface-variant">告诉我要去哪座城市，地图会显示在这里</div>}
        <p className="font-body-md text-body-md text-on-surface-variant text-center shrink-0">在聊天里勾选景点，点「生成路线」</p>
      </div>
    </div>
  );
  const editable = draft.complete && !streaming;
  const day = draft.days[Math.min(dayIdx, draft.days.length - 1)];
  // 地图编号与时间线一致：已细化的天按 stops 顺序
  const dayAtts = draft.days.map(d => (d.stops?.map(s => s.attractionId) ?? d.attractionIds).map(id => byId[id]).filter(Boolean));
  const totalKm = draft.days.flatMap(d => d.legs ?? []).reduce((s, l) => s + (l.driving?.distanceKm ?? 0), 0);
  return (
    <>
      <header className="px-4 md:px-5 py-4 bg-surface-container-lowest flex items-center justify-between gap-4 z-10 flex-wrap shrink-0">
        <div className="flex items-center gap-space-sm min-w-0 flex-wrap">
          <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight truncate">{city ? `${city}·` : ''}{draft.days.length}天路线</h2>
          <label className="relative flex items-center gap-1 px-2.5 h-8 rounded-pill bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-label-sm text-label-sm cursor-pointer hover:bg-surface-container">
            <span className="font-semibold text-primary">历史方案</span><Icon name="arrow_drop_down" className="text-[14px]" />
            <select data-testid="version-select" aria-label="切换版本" className="absolute inset-0 opacity-0 cursor-pointer" value={draft.version} disabled={streaming} onChange={e => onActivate(Number(e.target.value))}>
              {versions.map(v => <option key={v.version} value={v.version}>{v.note || '行程方案'} · {new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })}{v.complete ? '' : '（未完成）'}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-w-full min-w-0">
          <button data-testid="rollback" disabled={streaming || draft.version <= 1} onClick={() => onActivate(draft.version - 1)} className="px-3.5 h-10 rounded-field bg-surface-container-lowest border border-outline-variant hover:bg-surface-container text-on-surface font-title-md text-[13px] flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
            <Icon name="undo" className="text-[18px]" /><span>回退</span>
          </button>
          <button data-testid="share" disabled={!editable} onClick={onShare} className="px-4 h-10 rounded-pill bg-primary hover:bg-primary-container text-on-primary font-title-md text-[13px] flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
            <Icon name="ios_share" className="text-[18px]" /><span>分享</span>
          </button>
          <ExportCardButton draft={draft} byId={byId} state={state} disabled={!editable} />
          <button data-testid="export" disabled={!editable} onClick={onExport} className="px-3.5 h-10 rounded-field bg-surface-container-lowest border border-outline-variant hover:bg-surface-container text-on-surface font-title-md text-[13px] flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
            <Icon name="picture_as_pdf" className="text-[18px]" /><span>导出 PDF</span>
          </button>
        </div>
      </header>
      <div className="result-scroll overflow-y-auto flex-1">
        <div className="flex flex-col gap-5 px-5 pt-5 md:px-6 [&>*]:shrink-0">
        {streaming && <div className="px-4 py-2.5 rounded-card bg-primary-fixed text-on-primary-fixed border border-outline-variant font-label-md text-label-md flex items-center gap-2" data-testid="stream-banner">
          <Icon name="progress_activity" className="text-[16px] animate-spin" />正在逐天细化路线…已完成的天可先查看，全部完成后才能编辑
        </div>}
        {draft.days.filter(d => d.weather?.rainy).map(d => (
          <div key={d.day} className="flex items-start gap-3 p-4 rounded-card bg-secondary-fixed text-on-surface border border-outline-variant relative overflow-hidden" data-testid="weather-alert">
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
        <div className="w-full rounded-card bg-surface-container-lowest border border-outline-variant p-4 md:p-5 flex flex-col gap-3 relative overflow-hidden">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-2"><Icon name="map" className="text-[18px] text-primary" /><span className="font-title-md text-[14px] text-on-surface font-semibold">{city ? `${city}全景路线示意` : '全景路线示意'}</span></div>
            <div className="flex items-center gap-3 font-label-sm text-label-sm text-outline">
              {totalKm > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-pill bg-primary" /> 路线总长约 {totalKm.toFixed(1)} km</span>}
            </div>
          </div>
          <MapView days={dayAtts} activeDay={dayIdx} />
        </div>
        <div className="flex items-center gap-2 pt-1 overflow-x-auto overflow-y-hidden no-scrollbar">
          {draft.days.map((d, i) => (
            <button key={d.day} data-testid="day-tab" onClick={() => setDayIdx(i)}
              className={`flex items-center gap-2 px-4 h-9 rounded-pill font-title-md text-[13px] shrink-0 border ${i === dayIdx ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant hover:bg-surface-container text-on-surface-variant'}`}>
              {i === dayIdx && <Icon name="calendar_view_day" className="text-[16px]" />}
              <span>Day {d.day}{d.weather ? ` · ${d.weather.text}` : ''} ({d.attractionIds.length}个地点){d.status === 'skeleton' ? ' …' : ''}</span>
            </button>
          ))}
        </div>
        {day && (day.status === 'skeleton' ? <DaySkeleton day={day} /> : <DayTimeline day={day} byId={byId} editable={editable} onEdit={onEdit} />)}
        </div>
      </div>
    </>
  );
}

function DaySkeleton({ day }: { day: DayPlan }) {
  return (
    <div className="flex flex-col gap-space-md relative pl-4 mt-2" data-testid="skeleton">
      <p className="font-label-md text-label-md text-primary flex items-center gap-1"><Icon name="progress_activity" className="text-[16px] animate-spin" />正在规划第 {day.day} 天…</p>
      {day.names.map((n, i) => (
        <div key={n} className="flex items-start gap-space-md">
          <div className="w-8 h-8 rounded-pill bg-surface-container text-on-surface font-bold text-[13px] flex items-center justify-center shrink-0">{i + 1}</div>
          <div className="flex-1 bg-surface-container-lowest rounded-card border border-outline-variant p-4 flex flex-col gap-2">
            <div className="font-headline-sm text-headline-sm text-on-surface">{n}</div>
            <div className="h-3 w-3/4 rounded skeleton-bar" /><div className="h-3 w-1/2 rounded skeleton-bar" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 逐天时间线：完成后可拖拽排序（鼠标/触控/键盘，dnd-kit），松手生成新版本 */
function DayTimeline({ day, byId, editable, onEdit }: { day: DayPlan; byId: Record<string, Attraction>; editable: boolean; onEdit: Props['onEdit'] }) {
  const ids = day.stops?.map(s => s.attractionId) ?? day.attractionIds;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const n = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    onEdit(day.day, n, `拖拽调整第 ${day.day} 天顺序`);
  };
  const remove = (i: number) => onEdit(day.day, ids.filter((_, k) => k !== i), `删除${byId[ids[i]]?.name.split('·')[0]}`);
  return (
    <div className="flex flex-col gap-space-md relative pl-0 md:pl-4 mt-2" data-testid="timeline">
      {day.summary && <p className="font-body-sm text-body-sm text-on-surface-variant">{day.summary}</p>}
      {editable && <p className="font-label-sm text-label-sm text-outline flex items-center gap-1"><Icon name="drag_indicator" className="text-[14px]" />按住拖动手柄可调整顺序（手机长按）</p>}
      <div className="absolute left-4 md:left-8 top-16 bottom-6 w-px bg-outline-variant z-0" />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {day.stops?.map((s, i) => {
            const a = byId[s.attractionId]; const leg = day.legs?.[i];
            if (!a) return null;
            return (
              <SortableStop key={s.attractionId} id={s.attractionId} disabled={!editable}>
                {handle => (<>
                  <StopCard a={a} index={i} time={fmtRange(s.arrive, s.stayMin)} expanded
                    actions={editable ? <div className="flex gap-1" data-testid="edit-actions">
                      <button {...handle} className="w-6 h-6 rounded-pill bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing touch-none" title="拖动排序" data-testid="drag-handle"><Icon name="drag_indicator" className="text-[14px]" /></button>
                      <button className="w-6 h-6 rounded-pill bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center disabled:opacity-40" title="删除" disabled={ids.length <= 1} onClick={() => remove(i)}><Icon name="delete" className="text-[14px]" /></button>
                    </div> : undefined} />
                  {leg && <LegCard leg={leg} fromName={byId[leg.fromId]?.name ?? ''} toName={byId[leg.toId]?.name ?? ''} />}
                </>)}
              </SortableStop>
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableStop({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex flex-col gap-space-md ${isDragging ? 'z-30 opacity-80' : ''}`}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
