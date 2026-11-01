import { useEffect, useState } from 'react';
import type { TripView } from '../../../shared/types';
import { api } from '../api';
import { DayReadonly, ItineraryHeader } from '../components/ItineraryView';

/** 导出 PDF：按天分页（每页地图 + 时间线），保留来源与“仅供参考”标记；加载后调起浏览器打印/另存为 PDF */
export function PrintPage({ tripId, version, auto }: { tripId: string; version?: number; auto: boolean }) {
  const [trip, setTrip] = useState<TripView>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(''); setTrip(undefined);
    api.getTrip(tripId).then(view => { if (!cancelled) setTrip(view); })
      .catch(() => { if (!cancelled) setError('行程加载失败，请重试或返回首页查看行程。'); });
    return () => { cancelled = true; };
  }, [tripId, attempt]);
  const draft = trip?.versions.find(v => v.version === (version ?? trip.activeVersion));
  useEffect(() => {
    if (!draft) return;
    document.title = `${trip!.title} 行程单`;
    if (auto) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [tripId, draft, auto]);
  if (error) return <div className="p-8 text-outline" role="alert">{error} <button className="text-primary underline" onClick={() => setAttempt(n => n + 1)}>重新加载</button> <a href="/" className="text-primary underline">返回首页</a></div>;
  if (!trip) return <div className="p-8 text-outline">加载中…</div>;
  if (!draft) return <div className="p-8">版本不存在</div>;
  return (
    <div className="bg-surface-container-lowest text-on-surface" data-testid="print-root">
      <div className="print-page max-w-3xl mx-auto p-8 flex flex-col gap-4">
        <ItineraryHeader title={`${trip.title} 行程单`} state={trip.state} draft={draft} />
        <ol className="list-decimal pl-5 font-body-md text-body-md">
          {draft.days.map(d => <li key={d.day}>Day {d.day}：{d.names.join(' → ')}</li>)}
        </ol>
        <p className="no-print font-label-md text-label-md text-primary">已调起打印，可在打印对话框中选择“另存为 PDF”。</p>
      </div>
      {draft.days.map(d => <div key={d.day} className="max-w-3xl mx-auto p-8"><DayReadonly day={d} byId={trip.catalog} print /></div>)}
    </div>
  );
}
