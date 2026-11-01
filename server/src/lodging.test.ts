import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TripState } from '../../shared/types.js';
import type { GeocodeHit, MapProvider, PoiResult } from './map/MapProvider.js';
import type { LodgingIntent } from './semantic.js';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-lodging-')), 'test.db');
process.env.DEEPSEEK_API_KEY = 'test-semantic-key';
process.env.DEEPSEEK_BASE_URL = 'https://semantic.test.invalid/v1';
process.env.DAILY_LIMIT_DEEPSEEK = '0';
process.env.DAILY_LIMIT_AMAP = '0';

const state: TripState = { destination: '上海', days: 2, preferences: [], pace: '轻松', companions: '独自' };
const hotel = (adcode = '310117'): PoiResult => ({ name: '示例酒店', address: '示例路1号', adcode, location: { lng: 121.23, lat: 31.02 } });
const region = (name = '上海市松江区', adcode = '310117'): GeocodeHit => ({
  level: '区县', province: '上海市', city: '上海市', district: name, township: '', formattedAddress: name, adcode,
});
const request = (lodging: LodgingIntent, query = '上海松江附近的住宿') => ({
  scope: 'travel', action: 'lodging', query, clarification: '', patch: {},
  criteria: { include: [], exclude: [], mode: 'strict' }, preferenceUpdate: 'none',
  searchKeywords: [], foodKeyword: '', lodging, specialtyNamesOnly: false,
});

function provider(overrides: Partial<MapProvider> = {}): MapProvider {
  return {
    name: 'amap',
    async searchPoi() { assert.fail('不应搜索全市或未经确认的地点'); },
    async searchAround() { assert.fail('区域查询不应使用中心点周边搜索'); },
    async geocodeCandidates() { assert.fail('具体地标不应按行政区域定位'); },
    ...overrides,
  } as MapProvider;
}

test('住宿地点按语义分类、由地图候选确认后检索', async t => {
  const replies: unknown[] = [];
  const modelInputs: { system: string; data: any }[] = [];
  const mapReplies: unknown[] = [];
  const mapUrls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'semantic.test.invalid') {
      assert.ok(replies.length, '存在预期的模型响应');
      const body = JSON.parse(String(init?.body));
      modelInputs.push({ system: body.messages[0].content, data: JSON.parse(body.messages[1].content) });
      return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(replies.shift()) } }] });
    }
    assert.equal(url.hostname, 'restapi.amap.com');
    assert.ok(mapReplies.length, '存在预期的地图响应');
    mapUrls.push(url);
    return Response.json(mapReplies.shift());
  });
  const { recommendLodging } = await import('./lodging.js');
  const { understandTravelRequest, SemanticError } = await import('./semantic.js');
  const { QuotaError } = await import('./limits.js');
  const { AmapProvider } = await import('./map/AmapProvider.js');
  const regionIntent: LodgingIntent = { nearby: true, anchor: '上海松江', locationType: 'region' };
  const poiIntent: LodgingIntent = { nearby: true, anchor: '上海松江南站', locationType: 'poi' };

  await t.test('上海松江按松江区检索酒店，不要求同名地标且不混入其他区', async () => {
    replies.push(request(regionIntent), { places: [{ id: '0', memberIds: ['0'] }] });
    const parsed = await understandTravelRequest('上海松江附近的住宿', state, []);
    const map = provider({
      async geocodeCandidates(anchor, city) {
        assert.equal(anchor, '上海松江'); assert.equal(city, '上海'); return [region()];
      },
      async searchPoi(keyword, area, opts) {
        assert.equal(keyword, '酒店'); assert.equal(area, '310117'); assert.deepEqual(opts, { types: '100000' });
        return [hotel(), { ...hotel('310101'), name: '其他区酒店' }, { ...hotel(), name: '未知区域酒店', adcode: undefined }];
      },
    });
    const reply = await recommendLodging('上海', parsed.query, map, parsed.lodging);
    assert.match(reply ?? '', /上海市松江区区域内/);
    assert.match(reply ?? '', /示例酒店：示例路1号/);
    assert.doesNotMatch(reply ?? '', /其他区酒店|未知区域酒店|3 公里|无法确定/);
    const input = modelInputs.at(-1)!.data;
    assert.equal(input.intent.locationType, 'region');
    assert.equal(input.candidates[0].name, '上海市松江区');
  });

  await t.test('任意区域和改写沿用语义结果，不根据问句字词判断住宿或地标', async () => {
    for (const [city, anchor, name, adcode] of [
      ['杭州', '西湖', '杭州市西湖区', '330106'], ['苏州', '姑苏', '苏州市姑苏区', '320508'],
    ]) {
      const intent: LodgingIntent = { nearby: false, anchor, locationType: 'region' };
      const query = `在${city}${anchor}找个落脚的地方`;
      replies.push(request(intent, query), { places: [{ id: '0', memberIds: ['0'] }] });
      const parsed = await understandTravelRequest(query, { ...state, destination: city }, []);
      const map = provider({
        async geocodeCandidates() { return [{ ...region(name, adcode), province: '', city, district: anchor }]; },
        async searchPoi(_keyword, area) { assert.equal(area, adcode); return [hotel(adcode)]; },
      });
      assert.match(await recommendLodging(city, query, map, parsed.lodging) ?? '', new RegExp(`${name}区域内`));
    }
  });

  await t.test('具体地标由语义选择非首项和别名，使用地图坐标查询周边', async () => {
    replies.push(request(poiIntent, '上海松江南站附近能住哪'), { places: [{ id: '1', memberIds: ['1'] }] });
    const parsed = await understandTravelRequest('上海松江南站附近能住哪', state, []);
    const location = { lng: 121.23, lat: 30.98 };
    const map = provider({
      async searchPoi(keyword, city) {
        assert.equal(keyword, '上海松江南站'); assert.equal(city, '上海');
        return [{ name: '松江南站停车场', location: { lng: 121.2, lat: 31 } }, { name: '松江南站(铁路客运站)', location }];
      },
      async searchAround(at, opts) {
        assert.deepEqual(at, location); assert.deepEqual(opts, { types: '100000', radius: 3000 }); return [hotel()];
      },
    });
    assert.match(await recommendLodging('上海', parsed.query, map, parsed.lodging) ?? '', /松江南站\(铁路客运站\)附近 3 公里内/);
  });

  await t.test('同名候选歧义时追问，不任取一个位置或退回全市结果', async () => {
    replies.push({ places: [{ id: '0', memberIds: ['0'] }, { id: '1', memberIds: ['1'] }] });
    const map = provider({ async searchPoi() { return [
      { name: '同名地标', location: { lng: 121, lat: 31 } }, { name: '同名地标', location: { lng: 122, lat: 31 } },
    ]; } });
    assert.match(await recommendLodging('上海', '同名地标附近住哪', map, { ...poiIntent, anchor: '同名地标' }) ?? '', /多个不同地点/);
  });

  await t.test('单个不相关地图候选也必须经过语义确认', async () => {
    replies.push({ places: [] });
    const map = provider({ async searchPoi() { return [{ name: '无关位置', location: { lng: 121, lat: 31 } }]; } });
    assert.match(await recommendLodging('上海', '松江南站附近住哪', map, poiIntent) ?? '', /暂未找到.*相符的位置/);
  });

  await t.test('模型伪造候选ID、缺少分类或不可用时不使用规则兜底', async () => {
    const map = provider({ async searchPoi() { return [{ name: '松江南站', location: { lng: 121, lat: 31 } }]; } });
    replies.push({ places: [{ id: 'not-in-map', memberIds: ['not-in-map'] }] });
    await assert.rejects(recommendLodging('上海', '松江南站附近住哪', map, poiIntent), SemanticError);
    replies.push(null);
    await assert.rejects(recommendLodging('上海', '松江南站附近住哪', map, poiIntent), SemanticError);
    const missingType = { nearby: true, anchor: '松江' };
    replies.push(request(missingType as LodgingIntent));
    await assert.rejects(understandTravelRequest('松江附近住哪', state, []), SemanticError);
  });

  await t.test('未知地点类型和未指定参照地点继续澄清，城市范围可直接检索', async () => {
    assert.match(await recommendLodging('上海', '附近住哪', provider(), { nearby: true, anchor: null, locationType: 'unknown' }) ?? '', /哪个区域或地点/);
    assert.match(await recommendLodging('上海', '那边住哪', provider(), { nearby: true, anchor: '那边', locationType: 'unknown' }) ?? '', /请确认/);
    const map = provider({ async searchPoi(keyword, city) { assert.equal(keyword, '酒店'); assert.equal(city, '上海'); return [hotel()]; } });
    assert.match(await recommendLodging('上海', '找住宿', map, { nearby: false, anchor: null, locationType: 'unknown' }) ?? '', /示例酒店/);
    assert.equal(await recommendLodging('上海', '找住宿', { name: 'mock' } as MapProvider, regionIntent), null);
  });

  await t.test('目的地已有时，全市住宿的空锚点不再被判为语义失败，也不按问句补地名', async () => {
    const nanjing: TripState = { ...state, destination: '南京' };
    const body = (query: string, lodging: Record<string, unknown>) => ({
      scope: 'travel', action: 'lodging', query, clarification: '', patch: {},
      criteria: { include: [], exclude: [], mode: 'strict' }, preferenceUpdate: 'none',
      searchKeywords: ['酒店'], sightseeingArea: { anchor: null, locationType: 'unknown', city: null },
      foodKeyword: '', lodging, specialtyNamesOnly: false,
    });
    const citywide = [
      { query: '推荐南京的酒店住宿', lodging: { nearby: false, anchor: null, locationType: 'region', city: '南京' }, city: '南京' },
      { query: '南京附近有什么靠谱的住宿推荐', lodging: { nearby: true, anchor: '', locationType: 'poi', city: '' } },
      { query: '推荐南京的酒店住宿', lodging: { nearby: false, anchor: '  ', locationType: 'region', city: null } },
    ];
    for (const item of citywide) {
      replies.push(body(item.query, item.lodging));
      const parsed = await understandTravelRequest(item.query, nanjing, []);
      assert.equal(parsed.action, 'lodging');
      assert.deepEqual(parsed.lodging, { nearby: false, anchor: null, locationType: 'unknown', ...(item.city ? { city: item.city } : {}) });
      const map = provider({
        async searchPoi(keyword, city) {
          assert.equal(keyword, '酒店');
          assert.equal(city, parsed.lodging.city || '南京');
          return [hotel('320106')];
        },
      });
      const reply = await recommendLodging(nanjing.destination, parsed.query, map, parsed.lodging);
      assert.match(reply ?? '', /示例酒店/);
      assert.doesNotMatch(reply ?? '', /语义理解服务暂时不可用|哪个区域或地点/);
    }

    replies.push(body('松江附近住哪', { nearby: true, anchor: null, locationType: 'region', city: null }));
    const notFromKeywords = await understandTravelRequest('松江附近住哪', nanjing, []);
    assert.deepEqual(notFromKeywords.lodging, { nearby: false, anchor: null, locationType: 'unknown' });

    replies.push(body('附近住哪', { nearby: true, anchor: '', locationType: 'unknown', city: null }));
    const clarify = await understandTravelRequest('附近住哪', nanjing, []);
    assert.deepEqual(clarify.lodging, { nearby: true, anchor: null, locationType: 'unknown' });
    assert.match(await recommendLodging('南京', clarify.query, provider(), clarify.lodging) ?? '', /哪个区域或地点/);

    replies.push(body('推荐南京的酒店住宿', { nearby: true, anchor: '松江', locationType: 'region', city: '南京' }));
    const kept = await understandTravelRequest('推荐南京的酒店住宿', nanjing, []);
    assert.equal(kept.lodging.anchor, '松江');
    assert.equal(kept.lodging.locationType, 'region');
    assert.equal(kept.lodging.nearby, true);
    assert.equal(kept.lodging.city, '南京');

    replies.push(body('找住宿', { nearby: false, anchor: null, locationType: 'region', city: null }));
    await assert.rejects(understandTravelRequest('找住宿', { ...state, destination: '' }, []), SemanticError);
    replies.push(body('松江附近住哪', { nearby: true, anchor: '松江' }));
    await assert.rejects(understandTravelRequest('松江附近住哪', nanjing, []), SemanticError);
  });

  await t.test('地图无结果、地图故障和额度不足分别处理', async () => {
    const empty = provider({ async geocodeCandidates() { return []; } });
    assert.match(await recommendLodging('上海', '松江附近住哪', empty, regionIntent) ?? '', /暂未找到/);
    const failed = provider({ async geocodeCandidates() { throw new Error('map unavailable'); } });
    assert.match(await recommendLodging('上海', '松江附近住哪', failed, regionIntent) ?? '', /暂时无法查询住宿地点/);
    const quota = new QuotaError('amap');
    const limited = provider({ async geocodeCandidates() { throw quota; } });
    await assert.rejects(recommendLodging('上海', '松江附近住哪', limited, regionIntent), e => e === quota);
  });

  await t.test('高德适配层保留全部行政区候选和POI行政区信息', async () => {
    const map = new AmapProvider('test-map-key');
    mapReplies.push({ status: '1', geocodes: [
      { level: '区县', formatted_address: '上海市松江区', adcode: '310117', province: '上海市', city: [], district: '松江区', township: [] },
      { level: '区县', formatted_address: '另一候选区域', adcode: '330106', province: '浙江省', city: '杭州市', district: '西湖区' },
    ] });
    const found = await map.geocodeCandidates('上海松江', '上海');
    assert.equal(found.length, 2);
    assert.equal(found[0].adcode, '310117');
    assert.equal(found[0].formattedAddress, '上海市松江区');
    assert.equal(found[0].city, '');
    assert.equal(mapUrls.at(-1)!.searchParams.get('city'), '上海');
    mapReplies.push({ status: '1', pois: [{ name: '示例酒店', location: '121.23,31.02', pname: '上海市', cityname: '上海市', adname: '松江区', adcode: '310117' }] });
    const pois = await map.searchPoi('酒店', '310117', { types: '100000' });
    assert.equal(pois[0].adcode, '310117');
    assert.equal(pois[0].district, '松江区');
    assert.equal(mapUrls.at(-1)!.searchParams.get('city'), '310117');
    assert.equal(mapUrls.at(-1)!.searchParams.get('citylimit'), 'true');
    mapReplies.push({ status: '0', info: 'SERVICE_NOT_AVAILABLE' });
    await assert.rejects(map.geocodeCandidates('上海松江'), /failed/);
    mapReplies.push({ status: '0', info: 'SERVICE_NOT_AVAILABLE' });
    assert.equal(await map.geocode('上海松江'), null);
  });
  assert.equal(replies.length, 0);
  assert.equal(mapReplies.length, 0);
});
