import { useEffect, useState } from 'react';
import type { ShareSnapshot } from '../../../shared/types';
import { api } from '../api';
import { BrandMark, Icon } from '../components/Icon';
import { DayReadonly, ItineraryHeader } from '../components/ItineraryView';

/** 只读分享页：免登录；可“复制一份到我的行程”（归到当前匿名 ID） */
export function SharePage({ sid }: { sid: string }) {
  const [snap, setSnap] = useState<ShareSnapshot>();
  const [err, setErr] = useState('');
  const [copying, setCopying] = useState(false);
  useEffect(() => { api.getShare(sid).then(setSnap).catch(e => setErr(e.message)); }, [sid]);
  const [copyError, setCopyError] = useState('');
  const copy = async () => {
    if (copying) return;
    setCopying(true); setCopyError('');
    try { const t = await api.copyShare(sid); location.href = `/?trip=${t.id}`; }
    catch { setCopyError('复制失败，请稍后重试'); }
    finally { setCopying(false); }
  };
  if (err) return <div className="min-h-screen flex items-center justify-center text-on-surface-variant">{err}</div>;
  if (!snap) return <div className="min-h-screen flex items-center justify-center text-outline">加载中…</div>;
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-surface-container-lowest">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between" style={{ height: 'var(--app-header-h)' }}>
          <a href="/" className="flex items-center gap-3"><BrandMark /><span className="font-headline-sm text-headline-sm">行程助手</span></a>
          <button data-testid="copy-share" disabled={copying} onClick={copy} className="px-4 h-10 rounded-pill bg-primary hover:bg-primary-container text-on-primary font-title-md text-[13px] inline-flex items-center gap-1.5 disabled:opacity-60">
            <Icon name="content_copy" className="text-[18px]" />复制一份到我的行程</button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-space-md py-space-lg flex flex-col gap-space-xl">
        <div className="flex items-center gap-2 font-label-md text-label-md text-outline"><Icon name="visibility" className="text-[16px]" />只读分享 · 内容为分享时的版本快照</div>
        {copyError && <p role="alert" className="text-error">{copyError}</p>}
        <ItineraryHeader title={snap.title} state={snap.state} draft={snap.draft} />
        {snap.draft.days.map(d => <DayReadonly key={d.day} day={d} byId={snap.catalog} />)}
      </main>
    </div>
  );
}
