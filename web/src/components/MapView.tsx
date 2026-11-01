import { useEffect, useRef, useState } from 'react';
import type { Attraction } from '../../../shared/types';

declare global { interface Window { AMap?: any; _AMapSecurityConfig?: { serviceHost?: string; securityJsCode?: string } } }
const KEY = import.meta.env.VITE_AMAP_JS_KEY as string | undefined;
let loader: Promise<any> | null = null;
function loadAmap() {
  if (!loader) loader = new Promise((res, rej) => {
    // 安全密钥不进前端：走后端代理 /_AMapService
    window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
    const s = document.createElement('script');
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${KEY}`;
    s.onload = () => (window.AMap ? res(window.AMap) : rej(new Error('AMap missing'))); s.onerror = rej;
    document.head.appendChild(s);
  });
  return loader;
}
/** 颜色取自 theme.css 变量（SVG 直接用 var，高德 JS API 需要解析成具体色值） */
const cssColor = (name: string) => {
  const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return '#' + [r, g, b].map(x => (x || 0).toString(16).padStart(2, '0')).join('');
};

/** 无路线点位时的落点（杭州）。传入 city 后由 map.setCity 再校正到目的地行政区中心。 */
const CITY_FALLBACK: [number, number] = [120.15, 30.25];
const CITY_ZOOM = 11;

/** 地图：有 VITE_AMAP_JS_KEY 用高德 JS API（仅渲染）。无点位且传入 city 时是目的地城市概览；有点位时按天标注路线。未配置 key 时静态占位 SVG。 */
export function MapView({ days, activeDay, city, className, forceStatic }: { days: Attraction[][]; activeDay: number; city?: string; className?: string; forceStatic?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // 导出卡片强制走 SVG：高德 WebGL 画布无法栅格化进 PNG，静态图与未配 key 时的规划结果同一套点位样式
  const [failed, setFailed] = useState(!KEY || !!forceStatic);
  const hasPoints = days.some(pts => pts.length > 0);
  const overview = !hasPoints && Boolean(city?.trim());
  useEffect(() => {
    if (!KEY || failed || !ref.current) return;
    const el = ref.current;
    let map: any;
    let ro: ResizeObserver | undefined;
    let cancelled = false;
    loadAmap().then(AMap => {
      if (cancelled || !ref.current) return;
      // 有路线点位时保持原视口（随后 setFitView）。城市概览先落到杭州，再 setCity 到行程目的地。
      map = new AMap.Map(el, hasPoints
        ? { zoom: 12, center: CITY_FALLBACK }
        : { zoom: CITY_ZOOM, center: CITY_FALLBACK, animateEnable: false, resizeEnable: true });
      ro = new ResizeObserver(() => { try { map?.resize(); } catch { /* 容器已销毁 */ } });
      ro.observe(el);
      if (!hasPoints) {
        const name = city?.trim();
        if (name) { try { map.setCity(name); } catch { /* 行政区查询失败时仍停在默认中心 */ } }
        return;
      }
      days.forEach((pts, di) => {
        const on = di === activeDay;
        const bg = cssColor(on ? '--c-primary' : '--c-outline');
        const fg = cssColor('--c-on-primary');
        pts.forEach((a, i) => {
          // 默认 Marker 会去拉 theme/v1.3/markers/b/mark_bs.png，该图在部分网络下 400。用页面内编号圆点，不再请求这张雪碧图。
          const pin = document.createElement('div');
          pin.textContent = String(i + 1);
          pin.style.cssText = `width:22px;height:22px;border-radius:999px;background:${bg};color:${fg};font:700 12px/22px sans-serif;text-align:center;box-shadow:0 0 0 2px #fff`;
          map.add(new AMap.Marker({
            position: [a.location.lng, a.location.lat], title: a.name, content: pin, anchor: 'center',
            label: { content: `D${di + 1}-${i + 1}`, direction: 'right' },
          }));
        });
        if (pts.length > 1) map.add(new AMap.Polyline({ path: pts.map(a => [a.location.lng, a.location.lat]), strokeColor: bg, strokeWeight: on ? 5 : 3, strokeOpacity: 1 }));
      });
      map.setFitView();
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; ro?.disconnect(); map?.destroy(); };
  }, [days, activeDay, city, failed, hasPoints]);
  const frame = className ?? 'w-full h-44 rounded-card overflow-hidden';
  const mode = overview ? 'city' : 'route';
  if (!failed) return <div ref={ref} className={frame} data-testid="amap-map" data-map-mode={mode} aria-label={overview ? `${city}地图` : '路线地图'} />;

  const all = days.flat();
  const lngs = all.map(a => a.location.lng), lats = all.map(a => a.location.lat);
  const [x0, x1, y0, y1] = all.length ? [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)] : [120.05, 120.2, 30.18, 30.33];
  const W = 600, H = 220, P = 30;
  const px = (lng: number, lat: number) => [P + ((lng - x0) / (x1 - x0 || 1)) * (W - 2 * P), H - P - ((lat - y0) / (y1 - y0 || 1)) * (H - 2 * P)];
  const [lx, ly] = px(120.145, 30.245);
  return (
    <div className={`${frame} relative bg-surface-container-low overflow-hidden flex items-center justify-center border border-outline-variant`} data-testid="static-map" data-map-mode={mode}>
      <svg className="w-full h-full" viewBox={`0 0 ${W} ${H}`} fill="none">
        <ellipse cx={lx} cy={ly} rx={70} ry={50} style={{ fill: 'rgb(var(--c-surface-container))' }} />
        {overview
          ? <text x={lx} y={ly} textAnchor="middle" style={{ fill: 'rgb(var(--c-primary))' }} fontSize={14} fontWeight={600}>{city}</text>
          : <text x={lx - 30} y={ly} style={{ fill: 'rgb(var(--c-primary))' }} fontSize={11} fontWeight={600}>西湖水域</text>}
        {days.map((pts, di) => {
          const on = di === activeDay;
          return (
            <g key={di}>
              <polyline points={pts.map(a => px(a.location.lng, a.location.lat).join(',')).join(' ')} style={{ stroke: on ? 'rgb(var(--c-primary))' : 'rgb(var(--c-outline))' }} strokeDasharray="6 4" strokeLinecap="round" strokeWidth={on ? 3 : 2} />
              {pts.map((a, i) => { const [x, y] = px(a.location.lng, a.location.lat); const nm = a.name.split(/[·（]/)[0];
                return (<g key={a.id} transform={`translate(${x},${y})`}>
                  <circle r={10} style={{ fill: on ? 'rgb(var(--c-primary))' : 'rgb(var(--c-outline))' }} /><text style={{ fill: 'rgb(var(--c-on-primary))' }} fontSize={10} fontWeight="bold" textAnchor="middle" y={4}>{i + 1}</text>
                  {on && <><rect style={{ fill: 'rgb(var(--c-inverse-surface))' }} height={18} rx={6} width={nm.length * 10 + 12} x={13} y={-9} /><text style={{ fill: 'rgb(var(--c-inverse-on-surface))' }} fontSize={9} x={19} y={3}>{nm}</text></>}
                </g>); })}
            </g>
          );
        })}
      </svg>
      {!KEY && <div className="absolute bottom-2 left-2 px-2 h-6 inline-flex items-center rounded-pill bg-surface-container-lowest border border-outline-variant text-[11px] font-label-sm text-on-surface-variant">静态占位地图 · 未配置 VITE_AMAP_JS_KEY</div>}
    </div>
  );
}
