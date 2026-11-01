import { useState } from 'react';
import type { Attraction } from '../../../shared/types';
import { Icon } from './Icon';

// 标签统一用 accent（secondary）
const TAG_STYLES = ['bg-secondary-fixed text-on-secondary-fixed-variant'];

/** 缩略图：有高德照片用照片（叠评分），否则纯色底。
 *  store.is.autonavi.com/showpic 对已下线图片返回 400，失败则试下一张，都没有就退回色块。 */
export function Thumb({ a, className }: { a: Attraction; className: string }) {
  const photos = (a.photos ?? []).filter(u => /^https?:\/\//i.test(u));
  const [i, setI] = useState(0);
  const photo = photos[i];
  return (
    <div className={`${className} relative rounded-card overflow-hidden flex-shrink-0 border border-outline-variant flex items-center justify-center ${a.indoor ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-primary-fixed text-primary'}`}>
      {photo ? <img src={photo} alt={a.name} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" onError={() => setI(n => n + 1)} />
        : <Icon name={a.indoor ? 'museum' : 'landscape'} className="text-[24px]" />}
      {a.rating && <span className="absolute bottom-0.5 right-0.5 px-1 rounded-pill bg-inverse-surface text-[10px] font-semibold text-inverse-on-surface flex items-center gap-px"><Icon name="star" className="text-[10px]" />{a.rating.toFixed(1)}</span>}
    </div>
  );
}

/** 聊天中的景点推荐卡（可勾选）。右上角最多一个“仅供参考”，逐字段出处在路线详情里展开 */
export function AttractionSelectCard({ a, checked, onToggle }: { a: Attraction; checked: boolean; onToggle: () => void }) {
  const shown = [a.highlights, a.duration, a.audience].filter(Boolean);
  const needRef = shown.some(f => f!.source === 'llm' || f!.source === 'sample');
  const hasWeb = shown.some(f => f!.source === 'web');
  return (
    <label className="relative flex items-start gap-3 p-3.5 rounded-card bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low cursor-pointer" data-testid="rec-card">
      {(needRef || hasWeb) && <span className="absolute top-2 right-2 px-1.5 h-5 inline-flex items-center rounded-pill bg-surface-container-high text-outline text-[10px] font-medium" data-testid="card-ref">{needRef ? '仅供参考' : '含网页出处'}</span>}
      <div className="pt-0.5"><input checked={checked} onChange={onToggle} className="w-4 h-4 rounded text-primary accent-primary cursor-pointer" type="checkbox" /></div>
      <Thumb a={a} className="w-16 h-16" />
      <div className="flex-1 min-w-0 pr-12">
        <h4 className="font-title-md text-[14px] text-on-surface font-semibold">{a.name}</h4>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {a.tags[0] && <span className={`px-1.5 h-5 inline-flex items-center rounded-pill font-label-sm text-[11px] font-medium ${TAG_STYLES[0]}`} data-testid="main-tag">{a.tags[0]}</span>}
          {a.sample && <span className="font-label-sm text-[11px] text-outline">· 示例数据</span>}
        </div>
        {a.highlights && <p className="font-body-sm text-[12px] text-on-surface-variant mt-1 leading-normal">{a.highlights.value}</p>}
        <div className="flex items-center gap-3 mt-1.5 font-label-sm text-[11px] text-outline flex-wrap">
          {a.duration && <span className="flex items-center gap-0.5"><Icon name="schedule" className="text-[13px]" /> 建议 {a.duration.value}</span>}
          {a.audience && <span className="flex items-center gap-0.5 text-tertiary font-medium"><Icon name="directions_walk" className="text-[13px]" /> {a.audience.value.split('｜')[1] ?? a.audience.value}</span>}
        </div>
      </div>
    </label>
  );
}
