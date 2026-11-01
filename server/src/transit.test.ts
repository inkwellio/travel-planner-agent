import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TransitOption } from '../../shared/types.js';
import { transitChoices, transitLineMode } from '../../shared/transit.js';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-transit-')), 'test.db');
process.env.DAILY_LIMIT_AMAP = '0';
const require = createRequire(import.meta.url);
const mini = require('../../miniprogram/utils/transit.js') as { transitChoices: typeof transitChoices; transitLineMode: typeof transitLineMode };
const from = { lng: 120.3, lat: 31.5 }, to = { lng: 120.4, lat: 31.6 };
const line = (name = '1号线', type = '地铁线路', departure = '起点站') => ({ bus: { buslines: [{ name, type, departure_stop: { name: departure } }] } });
const route = (segments = [line()], duration = '1800', fee: unknown = '4') => ({
  cost: { duration, transit_fee: fee }, walking_distance: '350', segments,
});
const ok = (...transits: unknown[]) => ({ status: '1', count: String(transits.length), route: { transits } });

test('公共交通查询优先地铁、保留公交并区分空结果和服务故障', async t => {
  let metroResponse: unknown = ok(), busResponse: unknown = ok();
  let cityResponse = [{ citycode: '0510' }];
  let cityCodes: Record<string, string> | undefined;
  const urls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, 'restapi.amap.com');
    urls.push(url);
    if (url.pathname === '/v3/config/district') return Response.json({ status: '1', districts: cityCodes ? [{ citycode: cityCodes[url.searchParams.get('keywords')!] }] : cityResponse });
    assert.equal(url.pathname, '/v5/direction/transit/integrated');
    assert.equal(url.searchParams.get('show_fields'), 'cost');
    const response = url.searchParams.get('strategy') === '7' ? metroResponse : busResponse;
    if (response instanceof Error) throw response;
    return Response.json(response);
  });
  const { AmapProvider } = await import('./map/AmapProvider.js');
  const { MockProvider } = await import('./map/MockProvider.js');
  const { getTransitLeg, parseTransitRoute } = await import('./map/transit.js');
  const { QuotaError } = await import('./limits.js');

  await t.test('遍历多条结果选择地铁，即使公交更快，识别不含“地铁”字样的线路', async () => {
    const bus = route([line('5路(地铁站--终点)', '普通公交线路')], '600', '2');
    const metro = route([line('接驳8路', '普通公交线路'), line('1号线', '地铁线路', '换乘站')]);
    metroResponse = ok(bus, metro); busResponse = ok(bus);
    const provider = new AmapProvider('test-key');
    const result = await provider.transitRoute(from, to, '无锡');
    assert.ok(result);
    assert.deepEqual(result.lines, ['接驳8路', '1号线']);
    assert.deepEqual(result.lineModes, ['bus', 'subway']);
    assert.deepEqual(result.transfers, ['换乘站']);
    assert.equal(result.durationMin, 30);
    assert.equal(result.alternatives?.bus?.durationMin, 10);
    assert.equal(result.availability?.subway, 'available');
    assert.equal(transitLineMode(result, 1), 'subway');
    assert.equal(mini.transitLineMode(result, 1), 'subway');
    const calls = urls.filter(u => u.pathname.includes('/v5/'));
    assert.deepEqual(calls.slice(-2).map(u => u.searchParams.get('strategy')).sort(), ['5', '7']);
    assert.ok(calls.every(u => u.searchParams.get('city1') === '0510' && u.searchParams.get('city2') === '0510'));
    const before = urls.filter(u => u.pathname.includes('district')).length;
    await provider.transitRoute(from, to, '无锡');
    assert.equal(urls.filter(u => u.pathname.includes('district')).length, before);
  });

  await t.test('没有地铁时选纯公交，不把公交目的地里的地铁站当成地铁线路', async () => {
    metroResponse = ok(route([line('5路(地铁2号线站)', '普通公交线路')], '1200', '2'));
    busResponse = ok(route([line('12路', '普通公交线路')], '900', '2'));
    const result = await new AmapProvider('test-key').transitRoute(from, to, '无锡');
    assert.ok(result);
    assert.equal(result.alternatives?.subway, undefined);
    assert.deepEqual(result.lines, ['12路']);
    assert.equal(result.availability?.subway, 'not_found');
    assert.deepEqual(transitChoices(result), mini.transitChoices(result));
  });

  await t.test('一侧服务故障仍可使用另一侧真实方案，不能把错误说成无地铁', async () => {
    metroResponse = new Error('network'); busResponse = ok(route([line('12路', '普通公交线路')]));
    const bus = await new AmapProvider('test-key').transitRoute(from, to, '无锡');
    assert.equal(bus?.availability?.subway, 'unavailable');
    assert.equal(bus?.availability?.bus, 'available');
    metroResponse = ok(route()); busResponse = new Error('network');
    const subway = await new AmapProvider('test-key').transitRoute(from, to, '无锡');
    assert.equal(subway?.availability?.subway, 'available');
    assert.equal(subway?.availability?.bus, 'unavailable');
  });

  await t.test('成功空结果返回空，服务失败抛错，额度不足保持原错误', async () => {
    metroResponse = ok(); busResponse = ok();
    assert.equal(await new AmapProvider('test-key').transitRoute(from, to, '无锡'), undefined);
    metroResponse = { status: '0', info: 'SERVICE_NOT_AVAILABLE' };
    await assert.rejects(new AmapProvider('test-key').transitRoute(from, to, '无锡'), /暂时不可用/);
    const quota = new QuotaError('amap');
    metroResponse = quota; busResponse = ok(route([line('12路', '普通公交线路')]));
    await assert.rejects(new AmapProvider('test-key').transitRoute(from, to, '无锡'), e => e === quota);
  });

  await t.test('未返回票价时保持未知，明确免费时保留零元，铁路不能当公交', () => {
    assert.equal(parseTransitRoute(route([line()], '1800', []))?.fare, undefined);
    assert.equal(parseTransitRoute(route([line()], '1800', '0'))?.fare, 0);
    assert.equal(parseTransitRoute(route([line()], 'bad', '4')), undefined);
    const rail = parseTransitRoute(route([{ railway: { name: 'G123', departure_stop: { name: '火车站' } } } as any]));
    assert.deepEqual(rail?.lineModes, ['railway']);
    assert.equal(rail?.lineModes?.every(mode => mode === 'bus'), false);
    const raw = route([line(), line('8路', '普通公交线路')], '1800', undefined);
    raw.cost.transit_fee = undefined;
    (raw.segments[0] as any).cost = { transit_fee: '4' };
    (raw.segments[1] as any).cost = { transit_fee: '2' };
    assert.equal(parseTransitRoute(raw)?.fare, 6);
    assert.equal(parseTransitRoute({ ...route(), segments: [line(), { taxi: { distance: '800' } }] }), undefined);
  });

  await t.test('城市编码从地图确认，跨城分别查询，多个不同编码不能任取一个', async () => {
    const provider = new AmapProvider('test-key');
    cityResponse = [{ citycode: '0510' }, { citycode: '0512' }];
    await assert.rejects(provider.transitRoute(from, to, '同名城市'), /无法确认/);
    cityResponse = [{ citycode: '0510' }];
    cityCodes = { 起点城市: '0510', 终点城市: '0512' };
    metroResponse = ok(route()); busResponse = ok();
    await provider.transitRoute(from, to, '起点城市', { destinationCity: '终点城市' });
    assert.ok(urls.some(u => u.pathname.includes('district') && u.searchParams.get('keywords') === '终点城市'));
    const request = urls.filter(u => u.pathname.includes('/v5/')).at(-1)!;
    assert.equal(request.searchParams.get('city1'), '0510');
    assert.equal(request.searchParams.get('city2'), '0512');
    cityCodes = undefined;
  });

  await t.test('生成路线时查询失败保留不可用标记，不替换成示例；空结果和额度错误分别处理', async () => {
    assert.deepEqual(await getTransitLeg({ async transitRoute() { throw new Error('network'); } }, from, to, '无锡'), { transitStatus: 'unavailable' });
    assert.deepEqual(await getTransitLeg({ async transitRoute() { return undefined; } }, from, to, '无锡'), { transitStatus: 'not_found' });
    const quota = new QuotaError('amap');
    await assert.rejects(getTransitLeg({ async transitRoute() { throw quota; } }, from, to, '无锡'), e => e === quota);
  });

  await t.test('旧路线继续展示，地图类型优先于线路名称，示例数据明确标注来源', async () => {
    const legacy: TransitOption = { lines: ['地铁1号线'], transfers: [], durationMin: 20, fare: 4, source: 'sample' };
    assert.equal(transitChoices(legacy).subway, legacy);
    assert.deepEqual(mini.transitChoices(legacy), transitChoices(legacy));
    const bus: TransitOption = { ...legacy, lines: ['公交(地铁站接驳)'], lineModes: ['bus'] };
    assert.equal(transitChoices(bus).bus, bus);
    assert.deepEqual(mini.transitChoices(bus), transitChoices(bus));
    const sample = await new MockProvider().transitRoute(from, to);
    assert.equal(sample.source, 'sample');
    assert.equal(sample.alternatives.subway.source, 'sample');
    assert.equal(sample.alternatives.bus.source, 'sample');
    assert.ok(sample.lineModes.includes('subway'));
  });
});
