import type { Attraction, Field } from '../../../shared/types';
import { Icon } from './Icon';
import { RefTag } from './RefTag';
import { Thumb } from './AttractionSelectCard';

function Line({ label, f, strong }: { label: string; f?: Field; strong?: boolean }) {
  if (!f?.value) return null; // 无数据的行隐藏
  return <div className={strong ? 'text-on-surface' : 'text-on-surface-variant text-[12px]'}>{label}: <span className={strong ? 'font-semibold' : ''}>{f.value}</span><RefTag field={f} /></div>;
}
function Box({ icon, title, color, children, show }: { icon: string; title: string; color: string; children: React.ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <div className="p-2.5 rounded-card bg-surface-container-low flex flex-col gap-1">
      <div className={`flex items-center gap-1.5 font-label-md text-label-md font-semibold ${color}`}><Icon name={icon} className="text-[16px]" /><span>{title}</span></div>
      {children}
    </div>
  );
}

/** 路线时间轴中的景点节点卡（含详情 bento） */
export function StopCard({ a, index, time, expanded, actions, showThumb = false, detailColumns }: {
  a: Attraction; index: number; time: string; expanded: boolean; actions?: React.ReactNode;
  /** 导出卡片固定露出缩略图（不跟视口 sm 断点） */
  showThumb?: boolean;
  /** 导出卡片固定双列；不传则随视口 */
  detailColumns?: 1 | 2;
}) {
  return (
    <div className="relative z-10 flex items-start gap-space-md" data-testid="stop">
      <div className={`w-8 h-8 rounded-pill font-headline-sm text-[13px] font-bold flex items-center justify-center shrink-0 ${index === 0 ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'}`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0 bg-surface-container-lowest rounded-card border border-outline-variant p-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 h-6 inline-flex items-center rounded-pill font-label-sm text-label-sm font-semibold ${index === 0 ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-on-surface'}`}>{time}</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">{a.name}</h3>
              {a.tags[0] && <span className="px-2 h-6 inline-flex items-center rounded-pill bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm">{a.tags[0]}</span>}
              {a.sample && <span className="font-label-sm text-label-sm text-outline">· 示例数据</span>}
            </div>
            {(a.rating || a.address) && <div className="mt-1 flex items-center gap-2 font-label-sm text-label-sm text-outline">
              {a.rating && <span className="text-tertiary font-semibold flex items-center gap-0.5"><Icon name="star" className="text-[14px]" />{a.rating.toFixed(1)}</span>}
              {a.address && <span className="truncate">{a.address}</span>}{a.phone && <span className="inline-flex items-center gap-0.5"><Icon name="phone" className="text-[13px]" />{a.phone}</span>}</div>}
            {a.highlights && <p className="font-body-md text-body-md text-on-surface-variant mt-1.5 leading-relaxed">{a.highlights.value}<RefTag field={a.highlights} /></p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Thumb a={a} className={`${expanded ? 'w-20 h-20' : 'w-16 h-16'} ${showThumb ? 'flex' : 'hidden sm:flex'}`} />
            {actions}
          </div>
        </div>
        {expanded && <>
          <div className={`grid ${detailColumns === 2 ? 'grid-cols-2' : detailColumns === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-2.5 pt-1 font-body-sm text-body-sm`}>
            <Box icon="timer" title="游玩与最佳时段" color="text-primary" show={!!(a.duration || a.bestTime)}>
              <Line label="建议游玩" f={a.duration} strong /><Line label="最佳时段" f={a.bestTime} />
            </Box>
            <Box icon="confirmation_number" title="门票与开放" color="text-tertiary" show={!!(a.ticket || a.openHours || a.closedDays)}>
              <Line label="门票预约" f={a.ticket} strong /><Line label="开放时间" f={a.openHours} /><Line label="闭馆日" f={a.closedDays} />
            </Box>
            <Box icon="accessible_forward" title="适合人群与体力" color="text-secondary" show={!!a.audience}>
              <Line label="适合" f={a.audience} strong />
            </Box>
            <Box icon="restaurant" title="周边美食推荐" color="text-on-surface-variant" show={!!a.food}>
              <Line label="推荐" f={a.food} strong />
            </Box>
          </div>
          {a.tips && <div className="p-2.5 rounded-card bg-surface-container flex items-start gap-2 text-[12px] text-on-surface">
            <Icon name="tips_and_updates" className="text-[16px] text-primary shrink-0 mt-0.5" />
            <div><span className="font-semibold text-on-surface">实用贴士：</span>{a.tips.value}<RefTag field={a.tips} /></div>
          </div>}
          <div className="font-label-sm text-[11px] text-outline">出行前请以景区官方信息为准</div>
        </>}
      </div>
    </div>
  );
}
