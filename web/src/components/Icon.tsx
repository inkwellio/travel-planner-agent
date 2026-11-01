import type { ReactNode } from 'react';

/** 24×24 线性图标：只描边，无填充、无渐变。尺寸跟随 font-size（1em）。 */
const ICONS: Record<string, ReactNode> = {
  add: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M6 6 18 18" /><path d="M18 6 6 18" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  north_east: <><path d="M7 17 17 7" /><path d="M9 7h8v8" /></>,
  explore: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m14.6 9.4-1.3 3.9-3.9 1.3 1.3-3.9 3.9-1.3z" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M6.2 19.2c.7-2.9 2.9-4.4 5.8-4.4s5.1 1.5 5.8 4.4" />
    </>
  ),
  arrow_upward: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  arrow_forward: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
  expand_more: <path d="m6 9 6 6 6-6" />,
  expand_less: <path d="m6 15 6-6 6 6" />,
  arrow_drop_down: <path d="m7 10 5 5 5-5" />,
  keyboard_double_arrow_left: <><path d="m12 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></>,
  keyboard_double_arrow_right: <><path d="m6 17 5-5-5-5" /><path d="m12 17 5-5-5-5" /></>,
  auto_awesome: (
    <>
      <path d="M12 3.5 13.4 8.6 18.5 10 13.4 11.4 12 16.5 10.6 11.4 5.5 10 10.6 8.6 12 3.5z" />
      <path d="M18 15.2 18.7 17.3 20.8 18 18.7 18.7 18 20.8 17.3 18.7 15.2 18 17.3 17.3 18 15.2z" />
    </>
  ),
  cloud_done: (
    <>
      <path d="M7 18h9a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 7.4 9.2 3.4 3.4 0 0 0 7 18z" />
      <path d="m9 13.2 2 1.8 3.2-3.4" />
    </>
  ),
  attach_file: <path d="M8.2 12.6V7.4a3.8 3.8 0 0 1 7.6 0v8.2a2.5 2.5 0 0 1-5 0V8.2" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3" />
      <path d="M9 20h6" />
    </>
  ),
  landscape: <path d="m3 18 6-9 3.2 4.2L16 9l5 9H3z" />,
  museum: (
    <>
      <path d="M4 20h16" />
      <path d="M6 20V10M10 20V10M14 20V10M18 20V10" />
      <path d="M4 10 12 4l8 6" />
    </>
  ),
  map: (
    <>
      <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  location_on: (
    <>
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="1.7" />
    </>
  ),
  calendar_today: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" />
    </>
  ),
  calendar_month: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" />
      <path d="M8 13h2v2H8zM12 13h2v2h-2zM16 13h2v2h-2z" />
    </>
  ),
  calendar_view_day: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 9h16M9 5v14M15 5v14" />
    </>
  ),
  favorite: <path d="M12 19.4s-6.2-3.8-6.2-8A3.6 3.6 0 0 1 12 8.8a3.6 3.6 0 0 1 6.2 2.6c0 4.2-6.2 8-6.2 8z" />,
  directions_walk: (
    <>
      <circle cx="13.5" cy="4.6" r="1.5" />
      <path d="M9.2 20.5 11.2 14" />
      <path d="m13.2 20.5.4-6.2" />
      <path d="M11 14.2 13.2 9.8l3.2 1.4" />
      <path d="M8.6 11.2 13 9.8l.8 3.2" />
    </>
  ),
  group: (
    <>
      <circle cx="9" cy="8" r="2.2" />
      <circle cx="16.2" cy="9" r="1.7" />
      <path d="M4.2 19c.5-2.6 2.3-4 4.8-4s4.3 1.4 4.8 4" />
      <path d="M14.2 19c.3-1.8 1.5-3 3.1-3 1.4 0 2.5.9 2.9 2.7" />
    </>
  ),
  elderly: (
    <>
      <circle cx="9" cy="5" r="1.5" />
      <path d="M9 8.2 7.8 13 6 19" />
      <path d="M7.8 13 10.2 13.4 12 19" />
      <path d="M6.2 11.4h4.2" />
      <path d="M14.5 7.5v11" />
      <path d="M13 18.5h3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L18.6 9.4a2 2 0 0 0-2.8-2.8L5.2 17.2 4 20z" />
      <path d="m13.6 6.8 2.8 2.8" />
    </>
  ),
  star: <path d="m12 3.8 2 4.7 5.1.5-3.8 3.3 1.1 5L12 15 7.6 17.3l1.1-5L4.9 9l5.1-.5 2-4.7z" />,
  schedule: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="6.5" />
      <path d="M12 10.5v3.5l2 1.4" />
      <path d="M10 3.5h4M12 3.5V6" />
    </>
  ),
  undo: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2-5.2" />
      <path d="M4.5 4.5v5h5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 0 1-13.6 5.7L4 16" />
      <path d="M4 12a8 8 0 0 1 13.6-5.7L20 8" />
      <path d="M20 4v4h-4M4 20v-4h4" />
    </>
  ),
  ios_share: (
    <>
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />
    </>
  ),
  picture_as_pdf: (
    <>
      <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z" />
      <path d="M14 3v4h4M8.5 13h7M8.5 16.5h4.5" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="m6.5 16 3.2-3 2.2 2 2.4-2.2L17.5 16" />
    </>
  ),
  content_copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M6 16H5.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.2a3.8 3.8 0 0 0 5.6.5l1.6-1.6a3.8 3.8 0 0 0-5.4-5.4L10.6 8" />
      <path d="M14 10.8a3.8 3.8 0 0 0-5.6-.5l-1.6 1.6a3.8 3.8 0 0 0 5.4 5.4l1.2-1.3" />
    </>
  ),
  visibility: (
    <>
      <path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="m7 7 1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  drag_indicator: (
    <>
      <path d="M9 4.5v3M9 10.5v3M9 16.5v3" />
      <path d="M15 4.5v3M15 10.5v3M15 16.5v3" />
    </>
  ),
  progress_activity: <path d="M12 3.2a8.8 8.8 0 1 1-7.4 3.6" />,
  thunderstorm: (
    <>
      <path d="M7 15h9.2A3.4 3.4 0 0 0 16.2 8.4 4.6 4.6 0 0 0 7.6 9.5 3 3 0 0 0 7 15z" />
      <path d="m11.2 15.2-1.6 3.4h2.8l-1.3 3.2 3.6-4.4h-2.6l.8-2.2" />
    </>
  ),
  confirmation_number: (
    <>
      <path d="M4 8.5A2 2 0 0 0 6 7h12a2 2 0 0 0 2 1.5V11a2 2 0 0 1 0 3.5v1.5a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2V14.5a2 2 0 0 1 0-3.5V8.5z" />
      <path d="M12 7.5v9" />
    </>
  ),
  accessible_forward: (
    <>
      <circle cx="15" cy="5" r="1.4" />
      <path d="M5.5 8.5h6.2l1.6 3" />
      <path d="m11.5 11.5-2 4.8" />
      <circle cx="8.2" cy="18.2" r="2" />
      <path d="M14.5 13H19" />
      <path d="m17 11 2 2-2 2" />
    </>
  ),
  restaurant: (
    <>
      <path d="M6 3.5v7.2A2 2 0 0 0 8 12.7h0a2 2 0 0 0 2-2V3.5" />
      <path d="M8 3.5v17" />
      <path d="M6 7.5h4" />
      <path d="M16.2 3.5c1.6 1.8 2 4 1.4 6-.5 1.5-1.6 2.3-1.6 4V20.5" />
    </>
  ),
  tips_and_updates: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M8.2 14.2a4.8 4.8 0 1 1 7.6 0c-.6.7-1.2 1.4-1.4 2.3H9.6c-.2-.9-.8-1.6-1.4-2.3z" />
    </>
  ),
  directions_bus: (
    <>
      <rect x="5" y="4" width="14" height="12" rx="2" />
      <path d="M5 11h14" />
      <path d="M8 20v-2M16 20v-2" />
      <circle cx="8.2" cy="14.2" r="0.9" />
      <circle cx="15.8" cy="14.2" r="0.9" />
    </>
  ),
  directions_car: (
    <>
      <path d="M5 15.2 6.6 9.6A2 2 0 0 1 8.5 8h7a2 2 0 0 1 1.9 1.6l1.6 5.6" />
      <path d="M4 15.2h16v2.6a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.8v-2.6z" />
      <circle cx="7.5" cy="16.6" r="0.9" />
      <circle cx="16.5" cy="16.6" r="0.9" />
    </>
  ),
  subway: (
    <>
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 11h12" />
      <path d="m8.2 21 2.2-3h3.2l2.2 3" />
      <circle cx="9.2" cy="14.2" r="0.8" />
      <circle cx="14.8" cy="14.2" r="0.8" />
    </>
  ),
  route: (
    <>
      <circle cx="6.5" cy="6.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
      <path d="M8.5 6.5h5a4 4 0 0 1 0 8h-5a4 4 0 0 0 0 8h5" />
    </>
  ),
  toll: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10.2h5M9.5 13.8h5" />
    </>
  ),
  local_parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 17V7h3.8a3 3 0 0 1 0 6H9" />
    </>
  ),
  phone: <path d="M8 3.8h2.4l1.2 3.1-1.8 1a10.5 10.5 0 0 0 4.8 4.8l1-1.8 3.1 1.2V14a1.6 1.6 0 0 1-1.6 1.6A13.2 13.2 0 0 1 6.4 5.4 1.6 1.6 0 0 1 8 3.8z" />,
  check: <path d="m5 12.5 4.2 4.2L19 7.2" />,
  shield: <path d="M12 3.2 5.2 6v5.6c0 3.8 2.8 6.2 6.8 7.6 4-1.4 6.8-3.8 6.8-7.6V6L12 3.2z" />,
  chat: (
    <>
      <path d="M5.2 16.2 4 20l3.6-1.6h8.2A3.6 3.6 0 0 0 19.4 14.8V8.2A3.6 3.6 0 0 0 15.8 4.6H8.2A3.6 3.6 0 0 0 4.6 8.2v5.4a2.6 2.6 0 0 0 .6 2.6z" />
    </>
  ),
  logout: (
    <>
      <path d="M10 7V5.8A1.8 1.8 0 0 1 11.8 4h6.4A1.8 1.8 0 0 1 20 5.8v12.4a1.8 1.8 0 0 1-1.8 1.8h-6.4A1.8 1.8 0 0 1 10 18.2V17" />
      <path d="M4 12h10" />
      <path d="m11 8 4 4-4 4" />
    </>
  ),
};

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon ${className}`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] ?? <rect x="6" y="6" width="12" height="12" rx="2" />}
    </svg>
  );
}

/** 偶数边圆盘。填充圆比外框内收 1px，避免裁切出双层锯齿。 */
function Disc({ size, fill, stroke }: { size: number; fill: string; stroke?: string }) {
  const c = size / 2;
  const r = stroke ? c - 1 : c - 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle cx={c} cy={c} r={r} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />
    </svg>
  );
}

/** 对话 28、顶栏 36。两种都是主色圆盘 + 白色线性图标。 */
export function Avatar({ variant = 'assistant', size = 28 }: { variant?: 'assistant' | 'user'; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, color: 'rgb(var(--c-on-primary))' }} aria-hidden="true">
      <Disc size={size} fill="rgb(var(--c-primary))" />
      <Icon name={variant === 'user' ? 'person' : 'auto_awesome'} />
    </span>
  );
}

/** 顶栏品牌：定稿细线指南针（方案 A）。静态资源 /brand/xingcheng-icon.svg，默认 32px。 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/brand/xingcheng-icon.svg"
      alt=""
      width={size}
      height={size}
      draggable={false}
      aria-hidden="true"
      className="block max-w-none shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
