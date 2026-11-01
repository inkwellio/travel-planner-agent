import assert from 'node:assert/strict';
import test from 'node:test';
import type { TripState } from '../../shared/types.js';
import { applyDaysIntent } from './tripPrefs.js';
import { MockProvider } from './map/MockProvider.js';
import {
  applyDestinationIntent, interpretGeocode, isBroadProvince, needCityInProvince, parseDestinationIntent, spoken, type PlaceKind,
} from './destinationIntent.js';

const base = (): TripState => ({ destination: '杭州', days: 2, preferences: ['自然风光'], pace: '轻松', companions: '带老人' });
const hit = (level: string, extra: Partial<{ province: string; city: string; district: string; township: string }> = {}) => ({
  level, province: '', city: '', district: '', township: '', ...extra,
});

function classify(table: Record<string, PlaceKind> = {}) {
  return async (name: string): Promise<PlaceKind> => table[name] ?? 'region';
}

async function both(message: string, table?: Record<string, PlaceKind>) {
  const dest = await applyDestinationIntent(base(), message, classify(table));
  const days = applyDaysIntent(dest.state, message);
  return { state: days.state, note: [dest.note, days.note].filter(Boolean).join('') };
}

test('clear destination phrases extract the place, not a fixed city list', () => {
  const cases: Array<[string, string, boolean]> = [
    ['南京怎么玩', '南京', false],
    ['去南京', '南京', false],
    ['改成南京', '南京', true],
    ['我想去南京 3 天', '南京', false],
    ['南京玩 3 天', '南京', false],
    ['南京玩3天', '南京', false],
    ['从杭州改成南京', '南京', true],
    ['目的地改成南京', '南京', true],
    ['目的地是苏州', '苏州', true],
    ['改为 南京', '南京', true],
    ['去呼和浩特', '呼和浩特', false],
    ['西双版纳怎么玩', '西双版纳', false],
    ['去年去南京', '南京', false],
    ['改成南京市', '南京市', true],
  ];
  for (const [message, name, explicit] of cases) {
    const intent = parseDestinationIntent(message);
    assert.equal(intent.kind, 'candidate', message);
    if (intent.kind === 'candidate') {
      assert.equal(intent.name, name, message);
      assert.equal(intent.explicit, explicit, message);
    }
  }
});

test('last 改成 wins, alternatives stay unresolved', () => {
  const switched = parseDestinationIntent('改成南京，不对，改成苏州');
  assert.deepEqual(switched, { kind: 'candidate', name: '苏州', explicit: true });
  for (const message of ['改成南京或杭州', '南京还是杭州', '去南京还是苏州', '南京还是苏州怎么玩', '去南京和苏州']) {
    assert.equal(parseDestinationIntent(message).kind, 'ambiguous', message);
  }
});

test('attraction mentions and day counts are not a new city', () => {
  for (const message of ['西湖', '逛西湖', '夫子庙', '苏堤春晓很好', '带爸妈慢慢逛西湖，少爬坡', '带爸妈慢慢逛西湖，3天', '改成3天', '改成三天', '就两天', '看到南京的照片', '不去南京', '不要改成南京', '去掉南京', '南京']) {
    assert.equal(parseDestinationIntent(message).kind, 'none', message);
  }
  // 「去灵隐」句式像目的地，但是不是城市交给地理编码。
  assert.deepEqual(parseDestinationIntent('第3天去灵隐'), { kind: 'candidate', name: '灵隐', explicit: false });
  // 「怎么玩 / 改成」会抽出短语，但是不是城市交给地理编码，不在解析器里写死。
  assert.deepEqual(parseDestinationIntent('西湖怎么玩'), { kind: 'candidate', name: '西湖', explicit: false });
  assert.deepEqual(parseDestinationIntent('夫子庙怎么玩'), { kind: 'candidate', name: '夫子庙', explicit: false });
  assert.deepEqual(parseDestinationIntent('改成西湖'), { kind: 'candidate', name: '西湖', explicit: true });
});

test('one negation does not hide a later city', () => {
  assert.deepEqual(parseDestinationIntent('别去杭州，去南京'), { kind: 'candidate', name: '南京', explicit: false });
});

test('a confirmed region updates destination and keeps days in the same sentence', async () => {
  for (const message of ['南京怎么玩', '去南京', '改成南京', '我想去南京']) {
    const applied = await applyDestinationIntent(base(), message, classify());
    assert.equal(applied.state.destination, '南京', message);
    assert.match(applied.note, /已按 南京 更新目的地/, message);
    assert.equal(applied.state.days, 2, message);
  }
  const combined = await both('我想去南京 3 天');
  assert.equal(combined.state.destination, '南京');
  assert.equal(combined.state.days, 3);
  assert.match(combined.note, /已按 南京 更新目的地/);
  assert.match(combined.note, /已按 3 天更新行程/);

  const played = await both('南京玩 3 天');
  assert.equal(played.state.destination, '南京');
  assert.equal(played.state.days, 3);

  const named = await applyDestinationIntent(base(), '改成南京市', classify());
  assert.equal(named.state.destination, '南京');
  assert.equal(spoken('南京市'), '南京');
});

test('a bare city name fills an empty destination; a scenic spot still does not', async () => {
  const map = new MockProvider();
  const kind = async (name: string) => interpretGeocode(name, await map.geocode(name));
  const empty = (): TripState => ({ ...base(), destination: '' });

  assert.equal(parseDestinationIntent('上海').kind, 'none');
  assert.deepEqual(parseDestinationIntent('上海', { destination: '' }), { kind: 'candidate', name: '上海', explicit: false });
  assert.deepEqual(parseDestinationIntent('「杭州市」。', { destination: '' }), { kind: 'candidate', name: '杭州市', explicit: false });
  assert.equal(parseDestinationIntent('上海', { destination: '杭州' }).kind, 'none');
  assert.equal(parseDestinationIntent('你好', { destination: '' }).kind, 'none');
  assert.deepEqual(parseDestinationIntent('西湖', { destination: '' }), { kind: 'candidate', name: '西湖', explicit: false });

  const shanghai = await applyDestinationIntent(empty(), '上海', kind);
  assert.equal(shanghai.state.destination, '上海');
  assert.match(shanghai.note, /已按 上海 更新目的地/);

  const hangzhou = await applyDestinationIntent(empty(), '杭州市', kind);
  assert.equal(hangzhou.state.destination, '杭州');
  assert.match(hangzhou.note, /已按 杭州 更新目的地/);

  const lake = await applyDestinationIntent(empty(), '西湖', kind);
  assert.equal(lake.state.destination, '');
  assert.equal(lake.note, '');

  const already = await applyDestinationIntent(base(), '上海', kind);
  assert.equal(already.state.destination, '杭州');
  assert.equal(already.note, '');
});

test('an empty destination stays empty until the user names a city', async () => {
  const empty = (): TripState => ({ ...base(), destination: '' });
  const set = await applyDestinationIntent(empty(), '南京怎么玩', classify());
  assert.equal(set.state.destination, '南京');
  assert.match(set.note, /已按 南京 更新目的地/);
  const vague = await applyDestinationIntent(empty(), '南京还是杭州', classify());
  assert.equal(vague.state.destination, '');
  assert.match(vague.note, /目的地不太确定/);
  assert.doesNotMatch(vague.note, /仍按/);
  const poi = await applyDestinationIntent(empty(), '改成西湖', classify({ 西湖: 'poi' }));
  assert.equal(poi.state.destination, '');
  assert.match(poi.note, /不太像目的地城市/);
  assert.doesNotMatch(poi.note, /仍按/);
});

test('same destination does not add a note', async () => {
  const applied = await applyDestinationIntent(base(), '杭州怎么玩', classify());
  assert.equal(applied.state.destination, '杭州');
  assert.equal(applied.note, '');
  const styled = await applyDestinationIntent(base(), '杭州市怎么玩', classify());
  assert.equal(styled.state.destination, '杭州');
  assert.equal(styled.note, '');
});

test('ambiguous destinations and failed geocodes ask and leave state', async () => {
  for (const message of ['南京还是杭州', '去南京或苏州', '改成南京或杭州']) {
    const applied = await applyDestinationIntent(base(), message, classify());
    assert.equal(applied.state.destination, '杭州', message);
    assert.match(applied.note, /仍按 杭州/, message);
    assert.match(applied.note, /去南京/, message);
  }
  const unknown = await applyDestinationIntent(base(), '去火星', classify({ 火星: 'unknown' }));
  assert.equal(unknown.state.destination, '杭州');
  assert.match(unknown.note, /仍按 杭州/);
});

test('attraction names do not flip the city; an explicit rename asks', async () => {
  const poi = { 西湖: 'poi' as const, 夫子庙: 'poi' as const, 苏堤: 'poi' as const, 灵隐: 'poi' as const };
  for (const message of ['西湖怎么玩', '去西湖', '夫子庙怎么玩', '带爸妈慢慢逛西湖，3天']) {
    const applied = await both(message, poi);
    assert.equal(applied.state.destination, '杭州', message);
    assert.doesNotMatch(applied.note, /更新目的地/, message);
  }
  const daysOnly = await both('带爸妈慢慢逛西湖，3天', poi);
  assert.equal(daysOnly.state.days, 3);
  assert.match(daysOnly.note, /已按 3 天更新行程/);
  assert.equal(daysOnly.state.destination, '杭州');

  const renamed = await applyDestinationIntent(base(), '改成西湖', classify(poi));
  assert.equal(renamed.state.destination, '杭州');
  assert.match(renamed.note, /西湖/);
  assert.match(renamed.note, /仍按 杭州/);
});

test('geocode hits: cities match admin names, 西湖区 shorthand and POIs do not', () => {
  assert.equal(interpretGeocode('南京', hit('市', { province: '江苏省', city: '南京市' })), 'region');
  assert.equal(interpretGeocode('北京', hit('市', { province: '北京市' })), 'region');
  assert.equal(interpretGeocode('云南', hit('省', { province: '云南省' })), 'region');
  assert.equal(interpretGeocode('西湖区', hit('区县', { province: '浙江省', city: '杭州市', district: '西湖区' })), 'region');
  assert.equal(interpretGeocode('西湖', hit('区县', { province: '浙江省', city: '杭州市', district: '西湖区' })), 'poi');
  assert.equal(interpretGeocode('夫子庙', hit('兴趣点', { province: '江苏省', city: '南京市', district: '秦淮区' })), 'poi');
  assert.equal(interpretGeocode('乌镇', hit('乡镇', { province: '浙江省', city: '嘉兴市', district: '桐乡市', township: '乌镇' })), 'region');
  assert.equal(interpretGeocode('火星', null), 'unknown');
  assert.equal(interpretGeocode('南京', hit('市', { province: '浙江省', city: '杭州市' })), 'poi');
});

test('province-level destinations need a city; municipalities do not', () => {
  assert.equal(isBroadProvince('江苏', hit('省', { province: '江苏省' })), true);
  assert.equal(isBroadProvince('云南', hit('省', { province: '云南省' })), true);
  assert.equal(isBroadProvince('上海', hit('市', { province: '上海市', city: '上海市' })), false);
  assert.equal(isBroadProvince('上海', hit('省', { province: '上海市', city: '上海市' })), false);
  assert.equal(isBroadProvince('上海', hit('省', { province: '上海市' })), false);
  assert.equal(isBroadProvince('南京', hit('市', { province: '江苏省', city: '南京市' })), false);
  assert.match(needCityInProvince('江苏'), /江苏范围比较大/);
  assert.match(needCityInProvince('江苏'), /具体城市/);
});

test('mock geocode accepts arbitrary regions and rejects sample attractions', async () => {
  const map = new MockProvider();
  const kind = async (name: string) => interpretGeocode(name, await map.geocode(name));
  for (const city of ['南京', '杭州', '青岛', '呼和浩特', '西双版纳', '浙江', '江苏', '苏州', '乌镇']) {
    assert.equal(await kind(city), 'region', city);
  }
  assert.equal(isBroadProvince('江苏', await map.geocode('江苏')), true);
  assert.equal(isBroadProvince('浙江', await map.geocode('浙江')), true);
  assert.equal(isBroadProvince('上海', await map.geocode('上海')), false);
  assert.equal(isBroadProvince('南京', await map.geocode('南京')), false);
  for (const poi of ['西湖', '苏堤', '灵隐', '夫子庙', '雷峰塔', '玄武湖', '中山陵']) {
    assert.equal(await kind(poi), 'poi', poi);
  }
  const viaMock = async (message: string) => applyDestinationIntent(base(), message, kind);
  const nanjing = await viaMock('南京怎么玩');
  assert.equal(nanjing.state.destination, '南京');
  assert.match(nanjing.note, /已按 南京 更新目的地/);
  const lake = await viaMock('西湖怎么玩');
  assert.equal(lake.state.destination, '杭州');
  assert.equal(lake.note, '');
  const temple = await viaMock('夫子庙怎么玩');
  assert.equal(temple.state.destination, '杭州');
  assert.equal(temple.note, '');
  const lingyin = await viaMock('第3天去灵隐');
  assert.equal(lingyin.state.destination, '杭州');
  assert.equal(lingyin.note, '');
  const huh = await viaMock('去呼和浩特');
  assert.equal(huh.state.destination, '呼和浩特');
});
