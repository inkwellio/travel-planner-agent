import type { Attraction } from '../../shared/types.js';

type P = { lng: number; lat: number };
/** 近似平面距离（km），城市尺度足够 */
export function distKm(a: P, b: P) {
  const kx = 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110.57);
}
const centroid = (xs: Attraction[]): P => ({ lng: xs.reduce((s, a) => s + a.location.lng, 0) / xs.length, lat: xs.reduce((s, a) => s + a.location.lat, 0) / xs.length });

/** 最近邻排序：从离质心最远的端点出发，减少折返 */
export function nearestNeighborOrder(xs: Attraction[]): Attraction[] {
  if (xs.length <= 2) return [...xs];
  const c = centroid(xs);
  const rest = [...xs].sort((a, b) => distKm(b.location, c) - distKm(a.location, c));
  const order = [rest.shift()!];
  while (rest.length) {
    const last = order[order.length - 1].location;
    rest.sort((a, b) => distKm(a.location, last) - distKm(b.location, last));
    order.push(rest.shift()!);
  }
  return order;
}

/**
 * 按距离聚类分天（容量均衡的 k-means）：最远点初始化 → 迭代按距离分配（每天上限 ceil(n/k)）→ 天内最近邻排序。
 * 天与天之间再按质心最近邻排序，让相邻两天在地理上也连贯。
 */
export function clusterByDistance(xs: Attraction[], k: number): string[][] {
  k = Math.max(1, Math.min(k, xs.length || 1));
  if (!xs.length) return Array.from({ length: k }, () => []);
  const cap = Math.ceil(xs.length / k);
  const seeds: P[] = [xs[0].location];
  while (seeds.length < k) {
    const far = xs.reduce((best, a) => { const d = Math.min(...seeds.map(s => distKm(s, a.location))); return d > best.d ? { a, d } : best; }, { a: xs[0], d: -1 });
    seeds.push(far.a.location);
  }
  let groups: Attraction[][] = [];
  for (let iter = 0; iter < 10; iter++) {
    groups = Array.from({ length: k }, () => []);
    // 先分配“最确定”的点：最近与次近中心差距大的优先
    const pref = xs.map(a => { const ds = seeds.map((s, i) => ({ i, d: distKm(s, a.location) })).sort((x, y) => x.d - y.d); return { a, ds, gap: (ds[1]?.d ?? 0) - ds[0].d }; })
      .sort((x, y) => y.gap - x.gap);
    for (const { a, ds } of pref) groups[ds.find(x => groups[x.i].length < cap)!.i].push(a);
    const next = groups.map((g, i) => (g.length ? centroid(g) : seeds[i]));
    if (next.every((n, i) => distKm(n, seeds[i]) < 0.01)) break;
    seeds.splice(0, k, ...next);
  }
  const nonEmpty = groups.filter(g => g.length);
  const dayOrder = nearestNeighborOrder(nonEmpty.map((g, i) => ({ id: String(i), location: centroid(g) } as Attraction))).map(x => nonEmpty[Number(x.id)]);
  const out = dayOrder.map(g => nearestNeighborOrder(g).map(a => a.id));
  while (out.length < k) out.push([]);
  return out;
}
