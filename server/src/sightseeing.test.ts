import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Attraction, ChatMessage, TripState } from '../../shared/types.js';
import type { GeocodeHit, MapProvider, PoiResult } from './map/MapProvider.js';
import type { SemanticRequest } from './semantic.js';
import type { AttractionArea } from './attractions/search.js';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-sightseeing-')), 'test.db');
process.env.DEEPSEEK_API_KEY = 'test-semantic-key';
process.env.DEEPSEEK_BASE_URL = 'https://semantic.test.invalid/v1';
process.env.DAILY_LIMIT_DEEPSEEK = '0';
process.env.DAILY_LIMIT_AMAP = '0';

const state: TripState = { destination: '上海', days: 2, preferences: ['自然', '人文'], pace: '轻松', companions: '独自' };
const request = (): SemanticRequest => ({
  scope: 'travel', action: 'sightseeing', query: '松江有什么好玩的地方', clarification: '', patch: {},
  criteria: { include: [], exclude: [], mode: 'strict' }, preferenceUpdate: 'none', searchKeywords: ['景点', '博物馆'],
  sightseeingArea: { anchor: '松江', locationType: 'region' }, foodKeyword: '',
  lodging: { nearby: false, anchor: null, locationType: 'unknown' }, specialtyNamesOnly: false,
});
const region = (name = '上海市松江区', adcode = '310117'): GeocodeHit => ({
  level: '区县', province: '上海市', city: '上海市', district: name, township: '', formattedAddress: name, adcode,
});
const poi = (id = 'park', adcode = '310117'): PoiResult => ({
  amapId: id, name: '示例公园', type: '风景名胜;公园广场', adcode, district: '松江区', location: { lng: 121.23, lat: 31.02 },
});
const attraction = (id = 'park'): Attraction => ({
  id, name: '示例公园', city: '上海市', location: poi().location, indoor: false, sample: false,
  tags: ['风景名胜', '公园广场'], poiType: poi().type,
});
const judgment = (id = 'park', overrides: Record<string, unknown> = {}) => ({
  id, visitability: 'yes', inclusion: 'match', exclusion: 'clear', score: 90,
  evidence: [{ field: 'poiType', quote: '风景名胜' }], ...overrides,
});
const provider = (overrides: Partial<MapProvider> = {}): MapProvider => ({
  name: 'amap',
  async searchPoi() { assert.fail('不应扩大到未经确认的区域检索'); },
  async searchAround() { assert.fail('行政区域不应使用周边检索'); },
  async geocodeCandidates() { assert.fail('不应额外解析行政区域'); },
  ...overrides,
} as MapProvider);

test('景点查询按语义确定范围，并区分检索故障与证据不足', async t => {
  const replies: unknown[] = [];
  const modelInputs: { system: string; data: any }[] = [];
  const mapReplies: unknown[] = [];
  const mapUrls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'semantic.test.invalid') {
      assert.ok(replies.length, '模型调用必须有预期响应');
      const body = JSON.parse(String(init?.body));
      modelInputs.push({ system: body.messages[0].content, data: JSON.parse(body.messages[1].content) });
      return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(replies.shift()) } }] });
    }
    assert.equal(url.hostname, 'restapi.amap.com');
    assert.ok(mapReplies.length, '地图调用必须有预期响应');
    mapUrls.push(url);
    return Response.json(mapReplies.shift());
  });
  const { understandTravelRequest, assessAttractions, resolveLocation, SemanticError } = await import('./semantic.js');
  const { resolveAttractionArea, searchAttractionPois, AttractionSearchError, AreaResolutionError } = await import('./attractions/search.js');
  const { recommend, assignDays } = await import('./llm.js');
  const { routeState } = await import('./routePolicy.js');
  const { QuotaError } = await import('./limits.js');
  const { AmapProvider } = await import('./map/AmapProvider.js');
  const area: AttractionArea = { kind: 'region', label: '上海市松江区', city: '上海', adcode: '310117' };

  await t.test('一两天轻松游也能展示更多匹配景点，旧天数和节奏不影响推荐数量', async () => {
    const pool = Array.from({ length: 12 }, (_, i) => attraction(`spot${i}`));
    const judgments = pool.map(a => judgment(a.id));
    replies.push({ judgments }, { judgments });
    const short = await recommend({ ...state, days: 1, pace: '轻松' }, pool, request());
    const long = await recommend({ ...state, days: 7, pace: '紧凑' }, pool, request());
    assert.equal(short.ids.length, 12);
    assert.deepEqual(short.ids, long.ids);
    assert.doesNotMatch(short.text, /每天|参考节奏|轻松|紧凑/);
  });

  await t.test('推荐预算独立于行程，匹配候选超过预算时按相关性保留前列', async () => {
    const pool = Array.from({ length: 25 }, (_, i) => attraction(`spot${i}`));
    for (let offset = 0; offset < pool.length; offset += 20) {
      replies.push({ judgments: pool.slice(offset, offset + 20).map((a, i) => judgment(a.id, { score: offset + i })) });
    }
    const result = await recommend({ ...state, days: 1 }, pool, request());
    assert.equal(result.ids.length, 20);
    assert.equal(result.ids[0], 'spot24');
    assert.equal(result.ids.at(-1), 'spot5');
  });

  await t.test('自动路线分天后仍覆盖所有勾选景点，模型无有效分组时按距离回退', async () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ ...attraction(`spot${i}`), location: { lng: 121.2 + i * 0.01, lat: 31 } }));
    replies.push(null);
    const groups = await assignDays(routeState(state, pool.length), pool);
    assert.equal(groups.length, 4);
    assert.deepEqual(groups.flat().sort(), pool.map(a => a.id).sort());
    assert.ok(groups.every(g => g.length > 0));
    assert.equal(modelInputs.at(-1)!.data.days, 4);
    assert.equal(modelInputs.at(-1)!.data.pace, '适中');
  });

  await t.test('已设置城市时，同一街区的道路、主体及入口归为一个目标，商铺不制造歧义', async () => {
    for (const [city, anchor, district, adcode] of [['无锡', '南长街', '梁溪区', '320213'], ['苏州', '山塘街', '姑苏区', '320508']]) {
      const localState = { ...state, destination: city };
      const parsedRequest: SemanticRequest = {
        ...request(), query: `${anchor}有什么好玩的地方`, searchKeywords: ['景点'],
        sightseeingArea: { anchor, locationType: 'poi' },
      };
      const center = { lng: 120.3, lat: 31.5 };
      const entry = (amapId: string, name: string, type: string): PoiResult => ({
        amapId, name, type, city: `${city}市`, district, adcode, address: anchor, location: center,
      });
      const entries: PoiResult[] = [
        { ...entry('shop', `茶馆(${anchor}店)`, '餐饮服务;茶艺馆'), address: `${anchor}80号` },
        entry('road', anchor, '地名地址信息;交通地名;道路名'),
        entry('street', `${anchor}历史文化街区`, '风景名胜;特色商业街'),
        entry('gate', `${anchor}(北入口)`, '风景名胜;出入口'),
      ];
      replies.push(parsedRequest, { places: [{ id: '2', memberIds: ['1', '2', '3'] }] });
      const parsed = await understandTravelRequest(`${anchor}有什么好玩的地方`, localState, []);
      const resolved = await resolveAttractionArea(localState.destination, parsed.query, parsed.sightseeingArea, provider({
        async searchPoi(keyword, scopedCity) {
          assert.equal(keyword, anchor); assert.equal(scopedCity, city); return entries;
        },
      }));
      assert.equal(resolved.kind, 'poi');
      if (resolved.kind === 'poi') assert.deepEqual(resolved.location, center);
      assert.match(resolved.label, /历史文化街区/);
      const input = modelInputs.at(-1)!.data;
      assert.equal(input.city, city);
      assert.equal(input.candidates.length, 4);
      assert.deepEqual(input.candidates[2].location, center);
      assert.equal(input.candidates[2].amapId, 'street');
      assert.equal(input.candidates[2].adcode, entries[2].adcode);
      assert.equal(input.candidates[0].type, '餐饮服务;茶艺馆');
    }
  });

  await t.test('补充城市时保留原来的街区问题和条件，并优先使用补充的城市', async () => {
    const original = { ...request(), query: '南长街有什么好玩的地方', searchKeywords: ['景点'], sightseeingArea: { anchor: '南长街', locationType: 'poi' as const } };
    const pending: NonNullable<ChatMessage['locationClarification']> = {
      action: 'sightseeing', query: original.query, place: original.sightseeingArea,
      criteria: original.criteria, searchKeywords: original.searchKeywords,
    };
    // 同时兼容修复前只有文字的澄清记录，以及修复后保存的结构化请求。
    for (const locationClarification of [undefined, pending]) {
      const history: ChatMessage[] = [
        { id: 'u1', role: 'user', text: original.query },
        { id: 'a1', role: 'assistant', text: '“南长街”有多个可能的位置，请补充所在城市或附近地标。', ...(locationClarification ? { locationClarification } : {}) },
      ];
      replies.push({ ...original, query: '无锡南长街有什么好玩的地方', sightseeingArea: { ...original.sightseeingArea, city: '无锡' } });
      const parsed = await understandTravelRequest('无锡', state, history);
      const input = modelInputs.at(-1)!.data;
      assert.equal(input.history[0].text, original.query);
      assert.deepEqual(input.history[1].locationClarification, locationClarification);
      assert.equal(parsed.query, '无锡南长街有什么好玩的地方');
      assert.deepEqual(parsed.criteria, original.criteria);
      assert.deepEqual(parsed.patch, {});
      replies.push({ places: [{ id: '0', memberIds: ['0', '1'] }] });
      const resolved = await resolveAttractionArea(state.destination, parsed.query, parsed.sightseeingArea, provider({
        async searchPoi(_keyword, scopedCity) {
          assert.equal(scopedCity, '无锡');
          const base = { city: '无锡市', district: '梁溪区', adcode: '320213', location: { lng: 120.3, lat: 31.5 } };
          return [{ ...poi('street'), ...base, name: '南长街' }, { ...poi('gate'), ...base, name: '南长街(入口)' }];
        },
      }));
      assert.equal(resolved.city, '无锡');
      assert.equal(modelInputs.at(-1)!.data.city, '无锡');
    }
  });

  await t.test('真正不同的同名目标列出名称和地址，不重复要求已提供的城市', async () => {
    replies.push({ places: [{ id: '0', memberIds: ['0'] }, { id: '1', memberIds: ['1'] }] });
    await assert.rejects(resolveAttractionArea('无锡', '老街哪里好玩', { anchor: '老街', locationType: 'poi' }, provider({
      async searchPoi() { return [
        { ...poi('a'), name: '老街景区甲', city: '无锡市', district: '甲区', address: '甲路1号' },
        { ...poi('b'), name: '老街景区乙', city: '无锡市', district: '乙区', address: '乙路2号', location: { lng: 120.5, lat: 31.6 } },
      ]; },
    })), (error: unknown) => {
      assert.ok(error instanceof AreaResolutionError);
      assert.match(error.message, /老街景区甲（无锡市，甲区，甲路1号）/);
      assert.match(error.message, /老街景区乙（无锡市，乙区，乙路2号）/);
      assert.doesNotMatch(error.message, /补充.*城市/);
      return true;
    });
  });

  await t.test('同一目标归组必须引用现有ID，代表须在组内，候选不能跨组或重复', async () => {
    const candidates = [{ id: '0', name: '主体' }, { id: '1', name: '主体入口' }];
    for (const response of [
      { status: 'ambiguous', id: null },
      { places: [{ id: '0', memberIds: ['1'] }] },
      { places: [{ id: '0', memberIds: ['0', 'invented'] }] },
      { places: [{ id: '0', memberIds: ['0', '0'] }] },
      { places: [{ id: '0', memberIds: ['0', '1'] }, { id: '1', memberIds: ['1'] }] },
    ]) {
      replies.push(response);
      await assert.rejects(resolveLocation('这里有什么好玩的', '无锡', { anchor: '主体', locationType: 'poi' }, candidates), SemanticError);
    }
  });

  await t.test('明确查询城市在全市和行政区域检索中同样有效，无效城市字段被拒绝', async () => {
    assert.deepEqual(await resolveAttractionArea('上海', '无锡有什么好玩的', { anchor: null, locationType: 'unknown', city: '无锡' }, provider()), { kind: 'city', label: '无锡', city: '无锡' });
    replies.push({ places: [{ id: '0', memberIds: ['0'] }] });
    const resolved = await resolveAttractionArea('上海', '姑苏有什么好玩的', { anchor: '姑苏', locationType: 'region', city: '苏州' }, provider({
      async geocodeCandidates(_anchor, city) { assert.equal(city, '苏州'); return [region('苏州市姑苏区', '320508')]; },
    }));
    assert.equal(resolved.city, '苏州');
    replies.push({ ...request(), sightseeingArea: { ...request().sightseeingArea, city: 123 } });
    await assert.rejects(understandTravelRequest(request().query, state, []), SemanticError);
  });

  await t.test('松江普通推荐只检索确认后的区县，地图类别即可支持游览推荐', async () => {
    replies.push(request(), { places: [{ id: '1', memberIds: ['1'] }] }, { judgments: [judgment()] });
    const parsed = await understandTravelRequest('松江有什么好玩的地方', state, []);
    assert.deepEqual(parsed.criteria.include, []);
    assert.deepEqual(parsed.patch, {});
    const calls: string[] = [];
    const map = provider({
      async geocodeCandidates(anchor, city) {
        assert.equal(anchor, '松江'); assert.equal(city, '上海');
        return [region('另一同名区域', '220621'), region()];
      },
      async searchPoi(keyword, code, opts) {
        calls.push(keyword); assert.equal(code, '310117'); assert.deepEqual(opts, { page: 1 });
        return [poi(), poi('outside', '310101'), { ...poi('unknown'), adcode: undefined }];
      },
    });
    const resolved = await resolveAttractionArea(state.destination, parsed.query, parsed.sightseeingArea, map);
    assert.deepEqual(resolved, area);
    const found = await searchAttractionPois(map, resolved, parsed.searchKeywords, 15);
    assert.deepEqual(found.pois.map(p => p.amapId), ['park']);
    assert.deepEqual(calls, ['景点', '博物馆']);
    const result = await recommend(state, [attraction()], parsed, async () => assert.fail('普通推荐无需额外攻略证明'), { areaLabel: resolved.label });
    assert.deepEqual(result.ids, ['park']);
    assert.match(result.text, /上海市松江区/);
    assert.doesNotMatch(result.text, /暂时没有找到|放宽条件/);
    assert.deepEqual(modelInputs.at(-1)!.data.criteria.include, []);
  });

  await t.test('任意区域简称使用相同的语义候选流程，无地名分支', async () => {
    for (const [city, anchor, name, code] of [
      ['杭州', '西湖', '杭州市西湖区', '330106'], ['苏州', '姑苏', '苏州市姑苏区', '320508'],
    ]) {
      replies.push({ places: [{ id: '0', memberIds: ['0'] }] });
      const result = await resolveAttractionArea(city, `${anchor}有哪些值得逛的`, { anchor, locationType: 'region' }, provider({
        async geocodeCandidates() { return [{ ...region(name, code), city }]; },
      }));
      assert.equal(result.kind, 'region');
      if (result.kind === 'region') assert.equal(result.adcode, code);
    }
  });

  await t.test('省、市、区范围依据地图行政编码过滤，不混入范围外或无编码候选', async () => {
    const map = provider({ async searchPoi() { return [poi('district', '330106'), poi('otherCity', '330200'), poi('outside', '320508'), { ...poi('unknown'), adcode: undefined }]; } });
    for (const [code, expected] of [
      ['330000', ['district', 'otherCity']], ['330100', ['district']], ['330106', ['district']],
    ] as const) {
      const found = await searchAttractionPois(map, { ...area, adcode: code }, ['景点'], 10);
      assert.deepEqual(found.pois.map(p => p.amapId), expected);
    }
  });

  await t.test('具体地标可选非首项，按语义关键词搜索周边并校验距离', async () => {
    replies.push({ places: [{ id: '1', memberIds: ['1'] }] });
    const center = { lng: 121.23, lat: 31.02 };
    const map = provider({
      async searchPoi(keyword) { assert.equal(keyword, '某地标'); return [poi('wrong'), { ...poi('landmark'), location: center }]; },
      async searchAround(at, opts) {
        assert.deepEqual(at, center);
        assert.deepEqual(opts, { types: '', radius: 3000, keywords: '博物馆', page: 1 });
        return [poi(), { ...poi('far'), location: { lng: 121.8, lat: 31.5 } }];
      },
    });
    const resolved = await resolveAttractionArea('上海', '地标周边有什么可逛的', { anchor: '某地标', locationType: 'poi' }, map);
    const found = await searchAttractionPois(map, resolved, ['博物馆'], 10);
    assert.deepEqual(found.pois.map(p => p.amapId), ['park']);
  });

  await t.test('成功空结果无需模型审核，提示查询范围且不要求放宽并不存在的条件', async () => {
    const found = await searchAttractionPois(provider({ async searchPoi() { return []; } }), area, ['景点'], 15);
    assert.deepEqual(found, { pois: [], partial: false });
    const result = await recommend(state, [], request(), undefined, { areaLabel: area.label });
    assert.match(result.text, /暂未在上海市松江区检索到/);
    assert.doesNotMatch(result.text, /放宽|不符合条件/);
  });

  await t.test('地图失败与部分失败不会被报告成没有符合条件的景点，配额错误保持原样', async () => {
    const failed = provider({ async searchPoi() { throw new Error('network'); } });
    await assert.rejects(searchAttractionPois(failed, area, ['景点'], 15), AttractionSearchError);
    await assert.rejects(resolveAttractionArea('上海', '松江有什么好玩的', request().sightseeingArea, provider({ async geocodeCandidates() { throw new Error('network'); } })), AttractionSearchError);
    const found = await searchAttractionPois(provider({ async searchPoi(keyword) { if (keyword === '景点') throw new Error('network'); return [poi()]; } }), area, ['景点', '公园'], 15);
    assert.equal(found.partial, true);
    replies.push({ judgments: [judgment()] });
    const result = await recommend(state, [attraction()], request(), undefined, { areaLabel: area.label, searchPartial: true });
    assert.match(result.text, /部分地图检索请求未完成/);
    const quota = new QuotaError('amap');
    await assert.rejects(searchAttractionPois(provider({ async searchPoi() { throw quota; } }), area, ['景点'], 15), e => e === quota);
  });

  await t.test('歧义需澄清、空候选不猜测、非法模型地点ID被拒绝', async () => {
    const map = provider({ async geocodeCandidates() { return [region(), region('另一同名区域', '220621')]; } });
    replies.push({ places: [{ id: '0', memberIds: ['0'] }, { id: '1', memberIds: ['1'] }] });
    await assert.rejects(resolveAttractionArea('上海', request().query, request().sightseeingArea, map), /多个不同地点/);
    await assert.rejects(resolveAttractionArea('上海', request().query, request().sightseeingArea, provider({ async geocodeCandidates() { return []; } })), /暂未确认/);
    replies.push({ places: [{ id: 'invented', memberIds: ['invented'] }] });
    await assert.rejects(resolveAttractionArea('上海', request().query, request().sightseeingArea, map), SemanticError);
    await assert.rejects(resolveAttractionArea('上海', request().query, { anchor: '不明确地点', locationType: 'unknown' }, map), AreaResolutionError);
  });

  await t.test('普通推荐仍需可游览性和真实事实证据，不能用名称或编造摘录凑数', async () => {
    const pool = ['unknown', 'unsupported', 'nameOnly', 'notVisitable'].map(attraction);
    replies.push({ judgments: [
      judgment('unknown', { visitability: 'unknown' }),
      judgment('unsupported', { evidence: [{ field: 'poiType', quote: '自然山水' }] }),
      judgment('nameOnly', { evidence: [{ field: 'name', quote: '示例公园' }] }),
      judgment('notVisitable', { visitability: 'no' }),
    ] });
    const judged = await assessAttractions(pool, request());
    assert.deepEqual(judged.map(j => j.status), ['unknown', 'unknown', 'unknown', 'reject']);
    replies.push({ judgments: [judgment('park', { visitability: 'unknown' })] });
    const result = await recommend(state, [attraction()], request(), undefined, { areaLabel: area.label });
    assert.match(result.text, /已检索到上海市松江区的候选地点.*资料不足/);
    assert.doesNotMatch(result.text, /放宽|调整这些条件/);
  });

  await t.test('明确兴趣和排除条件继续严格审核，通用景点类别不能证明自然景观', async () => {
    const constrained = request();
    constrained.criteria = { include: ['自然景观'], exclude: ['需要爬山'], mode: 'strict' };
    replies.push({ judgments: [
      judgment('unknown', { inclusion: 'unknown', exclusion: 'unknown' }),
      judgment('miss', { inclusion: 'miss' }),
      judgment('excluded', { exclusion: 'violated' }),
    ] });
    assert.deepEqual((await assessAttractions(['unknown', 'miss', 'excluded'].map(attraction), constrained)).map(j => j.status), ['unknown', 'reject', 'reject']);
    replies.push({ judgments: [judgment('park', { inclusion: 'miss' })] });
    const result = await recommend(state, [attraction()], constrained, undefined, { areaLabel: area.label });
    assert.deepEqual(result.ids, []);
    assert.match(result.text, /希望：自然景观；排除：需要爬山/);
  });

  await t.test('资料不足可补充真实资料后重审，补充无变化则不重复审核', async () => {
    replies.push({ judgments: [judgment('park', { visitability: 'unknown' })] }, { judgments: [judgment('park', { evidence: [{ field: 'highlights', quote: '可参观展览' }] })] });
    const result = await recommend(state, [attraction()], request(), async ids => {
      assert.deepEqual(ids, ['park']);
      return [{ ...attraction(), highlights: { value: '可参观展览', source: 'web', sourceUrl: 'https://example.com/visit' } }];
    });
    assert.deepEqual(result.ids, ['park']);
    replies.push({ judgments: [judgment('park', { visitability: 'unknown' })] });
    assert.deepEqual((await recommend(state, [attraction()], request(), async () => [attraction()])).ids, []);
  });

  await t.test('分页保留后续候选并去重，不能只搜第一页', async () => {
    const pages: number[] = [];
    const found = await searchAttractionPois(provider({ async searchPoi(_keyword, _city, opts) {
      pages.push(opts!.page!);
      return opts!.page === 1 ? Array.from({ length: 10 }, (_, i) => poi(`p${i}`)) : [poi('p0'), poi('p10')];
    } }), area, ['景点', '景点'], 15);
    assert.deepEqual(pages, [1, 2]);
    assert.equal(found.pois.length, 11);
  });

  await t.test('缺失范围或无效审核结构不能静默回退到关键词规则', async () => {
    replies.push({ ...request(), sightseeingArea: undefined });
    await assert.rejects(understandTravelRequest(request().query, state, []), SemanticError);
    replies.push(null);
    await assert.rejects(understandTravelRequest(request().query, state, []), SemanticError);
    replies.push({ judgments: [judgment('park', { visitability: undefined })] });
    await assert.rejects(assessAttractions([attraction()], request()), SemanticError);
  });

  await t.test('开封自然风光在补充资料没有新增事实时仍返回风景候选，并排除人文与伪造摘录', async () => {
    const nature = request();
    nature.query = '开封有什么自然风光';
    nature.criteria = { include: ['自然风光'], exclude: ['室内场馆'], mode: 'strict' };
    nature.searchKeywords = ['自然风光', '公园', '风景区'];
    const place = (id: string, type: string): Attraction => ({
      ...attraction(id), name: id, poiType: type, tags: type.split(';').filter(Boolean),
    });
    const pool = [
      place('park', '风景名胜;公园广场;公园'),
      place('lake', '风景名胜;风景名胜'),
      place('temple', '风景名胜;风景名胜;寺庙道观'),
      place('museum', '科教文化服务;博物馆'),
      place('fake', '风景名胜;公园广场;公园'),
    ];
    replies.push({ judgments: [
      judgment('park', { inclusion: 'unknown', evidence: [{ field: 'poiType', quote: '公园' }] }),
      judgment('lake', { inclusion: 'unknown', evidence: [{ field: 'poiType', quote: '风景名胜' }] }),
      judgment('temple', { inclusion: 'unknown', evidence: [{ field: 'poiType', quote: '寺庙道观' }] }),
      judgment('museum', { visitability: 'no' }),
      judgment('fake', { evidence: [{ field: 'poiType', quote: '自然山水' }] }),
    ] });
    const loaded: string[][] = [];
    const result = await recommend({ ...state, destination: '开封' }, pool, nature, async ids => {
      loaded.push([...ids]);
      return pool.filter(item => ids.includes(item.id));
    }, { areaLabel: '开封' });
    assert.equal(loaded.length, 1);
    assert.ok(loaded[0].includes('park') && loaded[0].includes('lake') && loaded[0].includes('temple') && loaded[0].includes('fake'));
    assert.equal(loaded[0].includes('museum'), false);
    assert.deepEqual(result.ids, ['park', 'lake']);
    assert.match(result.text, /开封/);
    assert.match(result.text, /自然风光/);
    assert.doesNotMatch(result.text, /不足以确认是否符合本轮条件|杭州|杭帮菜/);
  });

  await t.test('南京自然风光加人文历史的轻松偏好在资料不足时保留地图候选，硬性排除仍然生效', async () => {
    const mixed = request();
    mixed.query = '南京一日游，希望自然风光、人文历史，轻松节奏';
    mixed.criteria = { include: ['自然风光', '人文历史', '轻松节奏'], exclude: [], mode: 'prefer' };
    mixed.searchKeywords = ['自然风光', '人文历史', '博物馆'];
    const place = (id: string, type: string): Attraction => ({
      ...attraction(id), name: id, city: '南京', poiType: type, tags: type.split(';').filter(Boolean),
    });
    const pool = [
      place('park', '风景名胜;公园广场;公园'),
      place('museum', '科教文化服务;博物馆'),
      place('temple', '风景名胜;风景名胜;寺庙道观'),
      place('mall', '购物服务;购物中心'),
    ];
    const unknown = (id: string, score: number) => judgment(id, { inclusion: 'unknown', score, evidence: [{ field: 'poiType', quote: '风景名胜' }] });
    replies.push({ judgments: [unknown('park', 40), unknown('museum', 90), unknown('temple', 70), unknown('mall', 99)] });
    const result = await recommend({ ...state, destination: '南京', days: 1, pace: '轻松' }, pool, mixed, async () => pool, { areaLabel: '南京' });
    assert.deepEqual(result.ids, ['museum', 'park', 'temple']);
    assert.match(result.text, /南京/);
    assert.match(result.text, /自然风光或人文历史/);
    assert.match(result.text, /轻松节奏/);
    assert.doesNotMatch(result.text, /不足以确认是否符合本轮条件|杭州|杭帮菜/);
    replies.push({ judgments: [unknown('park', 40), unknown('museum', 90), unknown('temple', 70), unknown('mall', 99)] });
    const excluded = await recommend({ ...state, destination: '南京', days: 1, pace: '轻松' }, pool, { ...mixed, criteria: { ...mixed.criteria, exclude: ['博物馆'] } }, async () => pool, { areaLabel: '南京' });
    assert.deepEqual(excluded.ids, ['temple', 'park']);
    assert.equal(excluded.ids.includes('museum'), false);
    replies.push({ judgments: [unknown('mall', 99)] });
    const empty = await recommend({ ...state, destination: '南京', days: 1, pace: '轻松' }, [pool[3]], mixed, async () => [pool[3]], { areaLabel: '南京' });
    assert.deepEqual(empty.ids, []);
    assert.match(empty.text, /已检索到南京的候选地点，但现有资料不足以确认是否符合本轮条件（希望：自然风光；希望：人文历史；希望：轻松节奏）/);
  });

  await t.test('高德周边检索传递关键词和页码，不强制过滤为固定景点分类', async () => {
    mapReplies.push({ status: '1', pois: [{ id: 'museum', name: '示例博物馆', location: '121.23,31.02', type: '科教文化服务;博物馆', adcode: '310117' }] });
    const found = await new AmapProvider('test-key').searchAround(poi().location, { types: '', radius: 3000, keywords: '博物馆', page: 2 });
    assert.equal(found[0].amapId, 'museum');
    const url = mapUrls.at(-1)!;
    assert.equal(url.searchParams.get('keywords'), '博物馆');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('types'), null);
  });
  assert.equal(replies.length, 0);
  assert.equal(mapReplies.length, 0);
});
