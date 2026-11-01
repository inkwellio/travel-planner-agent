import type { TransitLineMode, TransitOption, TransitRoute } from './types.js';

/** 老路线没有线路类型时仅用于展示兼容；新路线优先使用地图类型。 */
export function transitLineMode(route: TransitRoute, index: number): TransitLineMode {
  return route.lineModes?.[index]
    ?? (/地铁|轻轨|轨道交通|\bmetro\b|\bsubway\b/i.test(route.lines[index] || '') ? 'subway' : 'bus');
}

export function transitChoices(transit?: TransitOption): { subway?: TransitRoute; bus?: TransitRoute } {
  if (!transit) return {};
  if (transit.alternatives) return transit.alternatives;
  return transit.lines.some((_, i) => transitLineMode(transit, i) === 'subway')
    ? { subway: transit } : { bus: transit };
}
