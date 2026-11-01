import type { Leg, TransitLineMode, TransitOption, TransitRoute } from '../../../shared/types.js';
import { isQuotaError } from '../limits.js';
import type { LngLat, MapProvider } from './MapProvider.js';

const str = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown): number | undefined => {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !value.trim())) return;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** 使用地图的线路类型，不把公交终点名中的“地铁站”误当成地铁。 */
function lineMode(type: unknown, segment: any): TransitLineMode {
  const value = str(type);
  if (/地铁|轻轨|轨道交通/.test(value)) return 'subway';
  if (/公交|巴士|专线|大巴|BRT/i.test(value)) return 'bus';
  if (!value && (str(segment.entrance?.name) || str(segment.exit?.name))) return 'subway';
  return 'other';
}

export function parseTransitRoute(raw: any): TransitRoute | undefined {
  if (!raw || typeof raw !== 'object') return;
  const duration = number(raw.cost?.duration ?? raw.duration);
  if (duration === undefined || duration <= 0) return;
  const lines: string[] = [], lineModes: TransitLineMode[] = [], departures: string[] = [];
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const segmentFares: Array<number | undefined> = [];
  for (const segment of segments) {
    // 只展示可完整表达的公共交通，不静默隐藏出租车接驳。
    if ((number(segment?.taxi?.distance) ?? 0) > 0) return;
    const options = segment?.bus?.buslines ?? segment?.bus?.steps;
    const bus = Array.isArray(options) ? options.find(b => str(b?.name)) : undefined;
    const railway = segment?.railway;
    const name = str(bus?.name) || str(railway?.name);
    if (!name) continue;
    lines.push(name.replace(/[（(].*[）)]/, '').trim());
    lineModes.push(bus ? lineMode(bus.type, segment) : 'railway');
    departures.push(str((bus || railway).departure_stop?.name));
    segmentFares.push(number(segment.cost?.transit_fee));
  }
  if (!lines.length) return;
  const totalFare = number(raw.cost?.transit_fee ?? raw.transit_fee ?? raw.fare);
  const fare = totalFare ?? (segmentFares.every(f => f !== undefined) ? segmentFares.reduce<number>((sum, f) => sum + f!, 0) : undefined);
  return {
    lines, lineModes, transfers: departures.slice(1).filter(Boolean),
    durationMin: Math.ceil(duration / 60), fare,
    walkMeters: number(raw.walking_distance), source: 'amap',
  };
}

function readResult(result: PromiseSettledResult<any>): { routes: TransitRoute[]; failed: boolean } {
  if (result.status === 'rejected') {
    if (isQuotaError(result.reason)) throw result.reason;
    return { routes: [], failed: true };
  }
  const transits = result.value?.route?.transits;
  if (!Array.isArray(transits)) return { routes: [], failed: String(result.value?.count) !== '0' };
  return { routes: transits.map(parseTransitRoute).filter((r): r is TransitRoute => !!r), failed: false };
}

/** 同时保留地铁优先与纯公交方案；默认公共交通时间、费用跟随优先方案。 */
export function selectTransitOptions(metroResult: PromiseSettledResult<any>, busResult: PromiseSettledResult<any>): TransitOption | undefined {
  const metro = readResult(metroResult), busOnly = readResult(busResult);
  const routes = [...metro.routes, ...busOnly.routes]
    .sort((a, b) => a.durationMin - b.durationMin || (a.walkMeters ?? Infinity) - (b.walkMeters ?? Infinity));
  const subway = routes.find(r => r.lineModes?.includes('subway'));
  const bus = routes.find(r => r.lineModes?.length && r.lineModes.every(mode => mode === 'bus'));
  const preferred = subway || bus;
  if (!preferred) {
    if (metro.failed || busOnly.failed) throw new Error('公共交通查询暂时不可用');
    return;
  }
  return {
    ...preferred, alternatives: { subway, bus },
    availability: {
      subway: subway ? 'available' : metro.failed ? 'unavailable' : 'not_found',
      bus: bus ? 'available' : busOnly.failed ? 'unavailable' : 'not_found',
    },
  };
}

/** 查询失败不生成示例路线，空结果与故障分别传给结果卡片。 */
export async function getTransitLeg(provider: Pick<MapProvider, 'transitRoute'>, from: LngLat, to: LngLat, city: string, destinationCity = city): Promise<Pick<Leg, 'transit' | 'transitStatus'>> {
  try {
    const transit = await provider.transitRoute(from, to, city, { destinationCity });
    return transit ? { transit } : { transitStatus: 'not_found' };
  } catch (error) {
    if (isQuotaError(error)) throw error;
    console.warn('[map] transit unavailable:', (error as Error).message);
    return { transitStatus: 'unavailable' };
  }
}
