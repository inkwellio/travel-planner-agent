import { Avatar, BrandMark, Icon } from './Icon';

/** 与 theme.css --app-header-h 一致。64 为偶数，36px 头像上下各 14px。 */
export const HEADER_H = 64;

const navLink = 'px-2.5 sm:px-4 py-2 rounded-pill font-title-md text-[12px] sm:text-[13px] leading-5 whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export type HeaderView = 'plan' | 'trips';

/** 白底顶栏。智能规划 = 当前对话；我的行程 = 行程历史。 */
export function AppHeader({ onMenu, view, onView }: {
  onMenu: () => void;
  view: HeaderView;
  onView: (view: HeaderView) => void;
}) {
  const tab = (on: boolean) => `${navLink} ${on ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`;
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest" style={{ height: HEADER_H }}>
      <div className="h-full w-full px-4 md:px-6 grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button className="lg:hidden p-2 -ml-2 rounded-pill text-on-surface-variant hover:bg-surface-container shrink-0" onClick={onMenu} aria-label="历史行程"><Icon name="menu" className="text-[20px]" /></button>
          <span className="shrink-0"><BrandMark /></span>
          <div className="min-w-0">
            <div className="font-headline-sm text-[18px] leading-6 text-on-surface truncate">行程助手</div>
            <div className="hidden sm:block font-label-sm text-[10px] leading-4 tracking-widest text-outline">PLAN AI</div>
          </div>
        </div>
        <div className="flex justify-center">
          <nav className="flex items-center gap-1" aria-label="主导航">
            <button type="button" data-testid="nav-plan" aria-current={view === 'plan' ? 'page' : undefined} className={tab(view === 'plan')} onClick={() => onView('plan')}>智能规划</button>
            <button type="button" data-testid="nav-trips" aria-current={view === 'trips' ? 'page' : undefined} aria-expanded={view === 'trips'} className={tab(view === 'trips')} onClick={() => onView('trips')}>我的行程</button>
          </nav>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Avatar variant="user" size={36} />
        </div>
      </div>
    </header>
  );
}
