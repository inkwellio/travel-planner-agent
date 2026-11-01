import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mp = join(root, 'miniprogram');
const require = createRequire(import.meta.url);
const { createSseParser } = require('../miniprogram/utils/sse.js');
const { bucketOf, fmtRange, groupTrips, refTag, selectionFrom, tripRows } = require('../miniprogram/utils/format.js');
const { derive, activeDraft } = require('../miniprogram/utils/present.js');
const { toErr } = require('../miniprogram/utils/http.js');
const { exportPages } = require('../miniprogram/utils/export-image.js');
const { randomId, isUserId } = require('../miniprogram/utils/id.js');

test('匿名 ID 满足服务端 X-User-Id', () => {
  assert.equal(isUserId(randomId()), true);
  assert.equal(isUserId('short'), false);
});

test('429 解析出 code 与 Retry-After', () => {
  const err = toErr(429, { error: '规划得有点快，稍等几秒再试', code: 'rate', retryAfter: 8 }, '8');
  assert.equal(err.status, 429);
  assert.equal(err.code, 'rate');
  assert.equal(err.retryAfter, 8);
  assert.match(err.message, /稍等/);
});

test('新聊天清理过期提示，缺少目的地时不重复提示', async () => {
  const api = require('../miniprogram/services/api.js');
  const originalChat = api.chat;
  const oldPage = globalThis.Page;
  let page;
  globalThis.Page = definition => { page = definition; };
  try {
    require('../miniprogram/pages/index/index.js');
    const context = {
      trip: { id: 'trip', state: { destination: '' }, messages: [] },
      notices: [], busy: false, streaming: false, cooldown: 0,
      setTrip(t) { this.trip = t; }, takeView(t) { this.trip = t; },
      refreshList() {}, sync() {}, notify(text) { this.notices.push({ text }); },
    };
    api.chat = async (_id, text) => ({ ...context.trip, state: { destination: '' }, messages: [{ role: 'user', text }, { role: 'assistant', text: '先告诉我目的地城市' }] });
    await page.onSend.call(context, { detail: { text: '哪里好吃' } });
    assert.equal(context.notices.length, 0);
    assert.equal(context.trip.messages.at(-1).text, '先告诉我目的地城市');

    context.notices = [{ text: '目的地还是空的，所以这次没有推荐景点' }];
    api.chat = async (_id, text) => ({ ...context.trip, state: { destination: '上海' }, messages: [{ role: 'user', text }, { role: 'assistant', text: '在上海找到这些餐饮地点' }] });
    await page.onSend.call(context, { detail: { text: '上海有没有好吃的呢' } });
    assert.equal(context.notices.length, 0);
    assert.equal(context.trip.messages.at(-1).text, '在上海找到这些餐饮地点');
  } finally {
    api.chat = originalChat;
    globalThis.Page = oldPage;
  }
});

test('SSE 跨分块、跨 UTF-8 码点', () => {
  const events = [];
  const parser = createSseParser(e => events.push(e));
  const raw = new TextEncoder().encode(
    'event: day\ndata: ' + JSON.stringify({ type: 'day', day: { summary: '西湖晴' } }) + '\n\n' +
    'data: ' + JSON.stringify({ type: 'done', version: 1 }) + '\n\n',
  );
  parser.pushBytes(raw.slice(0, 11));
  parser.pushBytes(raw.slice(11, 12));
  parser.pushBytes(raw.slice(12));
  assert.equal(events.length, 2);
  assert.equal(events[0].day.summary, '西湖晴');
  assert.equal(events[1].type, 'done');
});

test('行程按今天 / 本周 / 更早分组，文案与 Web 一致', () => {
  const now = new Date(2026, 9, 27, 15, 0, 0);
  const trips = [
    { id: 'a', title: '杭州 2 天', updatedAt: new Date(2026, 9, 27, 9).toISOString(), state: { days: 2, destination: '杭州', companions: '带老人', preferences: ['美食'] }, versions: [{ version: 1, days: [{ names: ['西湖'] }] }], activeVersion: 1 },
    { id: 'b', title: '空', updatedAt: new Date(2026, 9, 20, 9).toISOString(), state: { days: 1, destination: '', companions: '独自', preferences: [] }, versions: [], activeVersion: null },
  ];
  assert.equal(bucketOf(trips[0].updatedAt, now), '今天');
  const rows = tripRows(trips, now);
  const hit = groupTrips(rows, '西湖', now);
  assert.equal(hit.groups.length, 1);
  assert.equal(hit.groups[0].rows[0].id, 'a');
  assert.equal(hit.groups[0].rows[0].draft, '');
  const shown = new Date(trips[0].updatedAt);
  const mm = String(shown.getMonth() + 1).padStart(2, '0');
  const dd = String(shown.getDate()).padStart(2, '0');
  assert.equal(hit.groups[0].rows[0].stamp, mm + '.' + dd + ' · 1天');
  const miss = groupTrips(rows, '不存在的词', now);
  assert.equal(miss.miss, true);
});

test('出处与游玩时段格式', () => {
  assert.equal(fmtRange('09:30', 90), '09:30 - 11:00');
  assert.equal(refTag({ source: 'amap' }), null);
  const web = refTag({ source: 'web', sourceUrl: 'https://www.example.com/a', sourceTitle: '官网', fetchedAt: '2026-10-15T00:00:00.000Z' });
  assert.equal(web.kind, 'web');
  assert.match(web.text, /来源：官网/);
  assert.equal(refTag({ source: 'sample' }, '示例天气').text, '示例天气');
});

test('推荐勾选与空路线概览', () => {
  const trip = {
    id: 't',
    title: '2 天行程',
    updatedAt: '2026-10-27T00:00:00.000Z',
    activeVersion: null,
    versions: [],
    state: { destination: '', days: 2, preferences: ['美食'], pace: '轻松', companions: '带老人' },
    messages: [
      { id: 'm1', role: 'assistant', text: '你好', recommendations: ['a1'] },
      { id: 'm2', role: 'user', text: '西湖' },
    ],
  };
  assert.deepEqual(selectionFrom(trip), { a1: true });
  const view = derive({
    trip,
    catalog: { a1: { id: 'a1', name: '西湖', tags: ['湖'], indoor: false, photos: [], sample: true, highlights: { value: '水', source: 'sample' }, duration: { value: '2小时', source: 'sample' } } },
    selected: { a1: true },
    notices: [],
    trips: [trip],
    sample: true,
    loading: false,
  });
  assert.equal(view.messages[0].showActions, true);
  assert.deepEqual(view.messages[0].actions, []);
  const kaifeng = derive({
    ...{
      trip: {
        ...trip,
        state: { ...trip.state, destination: '开封' },
        messages: [{ id: 'm1', role: 'assistant', text: '已按本轮需求筛选开封的景点。推荐自然风光候选。', recommendations: ['a1'] }],
      },
    },
    catalog: { a1: { id: 'a1', name: '龙亭公园', tags: ['公园'], indoor: false, photos: [], sample: false } },
    selected: { a1: true },
    notices: [],
    trips: [],
    sample: false,
    loading: false,
  });
  const chipText = kaifeng.messages[0].actions.map(a => a.label + a.text).join('\n');
  assert.match(chipText, /开封/);
  assert.doesNotMatch(chipText, /杭州|杭帮菜/);
  const natureFollowUp = derive({
    trip: {
      ...trip,
      state: { ...trip.state, destination: '开封' },
      messages: [{
        id: 'm1',
        role: 'assistant',
        text: '已按本轮需求筛选南京的景点。推荐 2 个候选景点。',
        recommendations: ['a1'],
        recommendationContext: {
          query: '杭州的自然风光和人文历史都可以',
          criteria: { include: ['自然风光', '人文历史'], exclude: [], mode: 'prefer' },
          searchKeywords: ['杭州', '公园'],
        },
      }],
    },
    catalog: { a1: { id: 'a1', name: '龙亭公园', tags: ['公园'], indoor: false, photos: [], sample: false } },
    selected: {},
    notices: [],
    trips: [],
    sample: false,
    loading: false,
  });
  const natureChips = natureFollowUp.messages[0].actions.map(a => a.label + a.text).join('\n');
  assert.match(natureChips, /再找开封自然风光/);
  assert.doesNotMatch(natureChips, /杭州|南京/);
  assert.equal(view.messages[0].cards[0].checked, true);
  assert.equal(view.messages[0].cards[0].refLabel, '仅供参考');
  assert.equal(view.draft.empty, true);
  assert.equal(view.draft.needCity, true);
  assert.match(view.footer, /示例数据/);
  assert.equal(view.state.prefsLabel, '美食');
  assert.equal(view.canPlan, false);
  assert.equal(activeDraft(trip), null);
});

test('路线带地图点与交通', () => {
  const trip = {
    id: 't',
    activeVersion: 1,
    state: { destination: '杭州', days: 1, preferences: [], pace: '适中', companions: '独自' },
    messages: [],
    versions: [{
      version: 1,
      note: '生成',
      complete: true,
      days: [{
        day: 1,
        status: 'ready',
        attractionIds: ['a', 'b'],
        names: ['甲', '乙'],
        summary: '一天',
        stops: [{ attractionId: 'a', arrive: '09:00', stayMin: 60 }, { attractionId: 'b', arrive: '11:00', stayMin: 60 }],
        legs: [{ fromId: 'a', toId: 'b', transit: { lines: ['地铁1号线'], transfers: ['站'], durationMin: 20, fare: 4, source: 'sample' }, driving: { durationMin: 15, distanceKm: 6.2, tolls: 0, parking: '停车场', source: 'amap' } }],
        weather: { date: '10-28', text: '小雨', tempMin: 12, tempMax: 18, rainy: true, source: 'sample' },
        indoorAlternatives: ['c'],
      }],
    }],
  };
  const catalog = {
    a: { id: 'a', name: '甲·馆', tags: ['馆'], indoor: true, location: { lng: 120.1, lat: 30.2 }, photos: [] },
    b: { id: 'b', name: '乙', tags: [], indoor: false, location: { lng: 120.2, lat: 30.3 }, photos: ['https://example.com/p.jpg'] },
    c: { id: 'c', name: '丙', tags: [], location: { lng: 120, lat: 30 } },
  };
  const view = derive({ trip, catalog, selected: {}, notices: [], trips: [], streaming: false, busy: false, sample: false });
  assert.equal(view.canPlan, true);
  assert.equal(view.draft.empty, false);
  assert.equal(view.draft.editable, true);
  assert.equal(view.draft.map.show, true);
  assert.equal(view.draft.map.markers.length, 2);
  assert.match(view.draft.map.markers[0].iconPath, /on-1\.png$/);
  assert.equal(view.draft.body.stops[0].canDown, true);
  assert.equal(view.draft.body.stops[0].leg.transit.steps[0].subway, true);
  assert.equal(view.draft.alerts[0].ref.text, '示例天气');
  assert.equal(view.sheetTitle, '规划结果');
  const streaming = derive({ trip, catalog, selected: {}, notices: [], trips: [], streaming: true, busy: false, sample: false });
  assert.equal(streaming.draft.editable, false);
  assert.match(streaming.sheetTitle, /生成中/);
});

test('地铁优先方案、小程序切换和导出保留独立公交方案', () => {
  const subway = { lines: ['1号线'], lineModes: ['subway'], transfers: [], durationMin: 30, source: 'amap' };
  const bus = { lines: ['8路'], lineModes: ['bus'], transfers: [], durationMin: 15, fare: 2, source: 'amap' };
  const catalog = {
    a: { id: 'a', name: '甲', tags: [], location: { lng: 120.1, lat: 31.2 } },
    b: { id: 'b', name: '乙', tags: [], location: { lng: 120.2, lat: 31.3 } },
  };
  const day = { day: 1, status: 'ready', names: ['甲', '乙'], attractionIds: ['a', 'b'], stops: [{ attractionId: 'a' }, { attractionId: 'b' }] };
  const trip = { state: { destination: '无锡' }, messages: [], activeVersion: 1, versions: [] };
  const present = transit => {
    const draft = { version: 1, complete: true, days: [{ ...day, legs: [{ fromId: 'a', toId: 'b', transit }] }] };
    return { draft, view: derive({ trip: { ...trip, versions: [draft] }, catalog, selected: {}, trips: [], notices: [], sample: false }) };
  };
  const result = present({ ...subway, alternatives: { subway, bus }, availability: { subway: 'available', bus: 'available' } });
  const leg = result.view.draft.body.stops[0].leg;
  assert.equal(leg.preferredMode, 'subway');
  assert.equal(leg.subway.steps[0].subway, true);
  assert.equal(leg.subway.fare, '');
  assert.equal(leg.bus.steps[0].bus, true);
  assert.equal(leg.bus.fare, '2.00');
  const exported = exportPages(trip, result.draft, catalog)[0].lines.map(item => item.text).join('');
  assert.match(exported, /地铁优先：1号线/);
  assert.match(exported, /公交方案：8路/);

  const saved = globalThis.Component;
  let component;
  globalThis.Component = definition => { component = definition; };
  try { require('../miniprogram/components/leg-card/leg-card.js'); }
  finally { globalThis.Component = saved; }
  const context = { data: { leg }, setData(patch) { Object.assign(this.data, patch); }, ...component.methods };
  component.observers.leg.call(context, leg);
  assert.equal(context.data.mode, 'subway');
  context.onMode({ currentTarget: { dataset: { mode: 'bus' } } });
  assert.equal(context.data.transit.steps[0].line, '8路');
  const fallback = present({ ...bus, alternatives: { bus }, availability: { subway: 'not_found', bus: 'available' } }).view.draft.body.stops[0].leg;
  context.data.leg = fallback;
  component.observers.leg.call(context, fallback);
  assert.equal(context.data.mode, 'bus');
  assert.match(fallback.transitNote, /未查询到可用地铁方案/);
  context.onMode({ currentTarget: { dataset: { mode: 'subway' } } });
  assert.match(context.data.message, /未查询到可用地铁方案/);
  const partial = present({ ...bus, alternatives: { bus }, availability: { subway: 'unavailable', bus: 'available' } }).view.draft.body.stops[0].leg;
  assert.match(partial.transitNote, /暂时无法查询/);
  assert.doesNotMatch(partial.transitNote, /未查询到可用地铁方案/);
});

test('导出图片包含各天路线、时间和交通', () => {
  const pages = exportPages({ state: { destination: '上海' } }, { days: [
    { day: 1, stops: [{ attractionId: 'a', arrive: '09:00', stayMin: 60 }, { attractionId: 'b' }], legs: [{ transit: { lines: ['地铁1号线'], durationMin: 20 } }] },
    { day: 2, attractionIds: ['b'] },
  ] }, { a: { name: '人民广场' }, b: { name: '外滩' } });
  assert.equal(pages.length, 2);
  const text = pages[0].lines.map(line => line.text).join('');
  assert.match(text, /上海 · 第 1 天/);
  assert.match(text, /人民广场/);
  assert.match(text, /09:00 - 10:00/);
  assert.match(text, /地铁1号线/);
  assert.ok(pages[0].height > pages[0].lines.at(-1).y);
  assert.match(pages[1].lines.map(line => line.text).join(''), /外滩/);
});

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test('小程序目录可被开发者工具打开：四件套、JSON、无密钥', () => {
  const app = JSON.parse(readFileSync(join(mp, 'app.json'), 'utf8'));
  assert.equal(app.lazyCodeLoading, 'requiredComponents');
  assert.equal(app.convertRpxToVw, true);
  assert.equal(app.pages[0], 'pages/index/index');
  for (const page of app.pages) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      statSync(join(mp, page + ext));
    }
  }
  const rootCfg = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8'));
  const localCfg = JSON.parse(readFileSync(join(mp, 'project.config.json'), 'utf8'));
  assert.equal(rootCfg.miniprogramRoot, 'miniprogram/');
  assert.equal(localCfg.miniprogramRoot, './');
  assert.equal(rootCfg.setting.urlCheck, false);
  const files = walk(mp);
  const js = files.filter(f => f.endsWith('.js'));
  for (const file of js) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(check.status, 0, file + '\n' + check.stderr);
  }
  const manifest = JSON.parse(readFileSync(join(mp, 'assets/icons/manifest.json'), 'utf8'));
  const wxml = files.filter(f => f.endsWith('.wxml')).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(wxml, /<(div|span|img|p|h1|h2|button)\b/);
  assert.doesNotMatch(wxml, /\b(bind|catch)[a-z]/);
  for (const tag of wxml.match(/<icon\b[^>]*>/g) || []) {
    const name = /name="([^"]+)"/.exec(tag);
    const tone = /tone="([^"]+)"/.exec(tag);
    assert.ok(name, tag);
    assert.ok(manifest.names.includes(name[1]), name[1]);
    if (tone && !tone[1].includes('{{')) {
      statSync(join(mp, 'assets/icons', tone[1], name[1] + '.png'));
    }
  }
  const source = files.filter(f => /\.(js|wxml|wxss|json|md)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(source, /AMAP_|DEEPSEEK_|SEARCH_API_KEY|APPSECRET|appsecret/i);
  const wxs = readFileSync(join(mp, 'components/sheet-frame/sheet.wxs'), 'utf8');
  assert.doesNotMatch(wxs, /\b(const|let|=>)/);
  for (const file of files.filter(f => f.endsWith('.json') && f.includes('/components/'))) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    if (file.endsWith('/icon.json') || file.includes(`${join('components', '')}`)) {
      if (json.component !== undefined) assert.equal(json.component, true);
    }
  }
  const comps = readdirSync(join(mp, 'components'));
  for (const name of comps) {
    const json = JSON.parse(readFileSync(join(mp, 'components', name, name + '.json'), 'utf8'));
    assert.equal(json.component, true, name);
    const wxss = readFileSync(join(mp, 'components', name, name + '.wxss'), 'utf8');
    assert.doesNotMatch(wxss, /(^|\n)(view|text|image|button|input|textarea|page)\b/);
  }
});
