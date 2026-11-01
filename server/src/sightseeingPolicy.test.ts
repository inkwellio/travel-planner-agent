import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attraction } from '../../shared/types.js';
import type { AttractionJudgment } from './semantic.js';
import { composeShortlist, cultureHistoryRank, enrichmentBudget, isBroadNatureRequest, isSoftMixedPrefer, scenicNatureRank } from './sightseeingPolicy.js';

const spot = (id: string, poiType: string, tags = poiType.split(';').filter(Boolean)): Attraction => ({
  id, name: id, city: '开封', location: { lng: 114.3, lat: 34.8 }, indoor: false, sample: false, tags, poiType,
});
const judged = (id: string, overrides: Partial<AttractionJudgment> = {}): AttractionJudgment => ({
  id, status: 'unknown', score: 50, visitability: 'yes', inclusion: 'unknown', exclusion: 'clear', downgraded: false, ...overrides,
});

test('自然风光资料不足时保留风景和公园候选，并排除人文、硬性排除和伪造摘录', () => {
  assert.equal(isBroadNatureRequest(['自然风光']), true);
  assert.equal(isBroadNatureRequest(['自然景观']), true);
  assert.equal(isBroadNatureRequest(['博物馆']), false);
  assert.equal(isBroadNatureRequest([]), false);
  const pool = [
    spot('park', '风景名胜;公园广场;公园'),
    spot('lake', '风景名胜;风景名胜'),
    spot('temple', '风景名胜;风景名胜;寺庙道观'),
    spot('museum', '科教文化服务;博物馆'),
    spot('square', '风景名胜;公园广场;城市广场'),
    spot('fake', '风景名胜;公园广场;公园'),
    spot('confirmed', '风景名胜;风景名胜;湿地'),
    spot('unclear', '风景名胜;公园广场;公园'),
  ];
  assert.equal(scenicNatureRank(pool[0]), 2);
  assert.equal(scenicNatureRank(pool[2]), 0);
  assert.equal(scenicNatureRank(pool[4]), 0);
  const result = composeShortlist(pool, [
    judged('park', { score: 40 }),
    judged('lake', { score: 90 }),
    judged('temple'),
    judged('museum', { status: 'reject', visitability: 'no' }),
    judged('square'),
    judged('fake', { inclusion: 'match', downgraded: true }),
    judged('confirmed', { status: 'match', inclusion: 'match', score: 80 }),
    judged('unclear', { exclusion: 'unknown', score: 99 }),
  ], { include: ['自然风光'], exclude: ['室内场馆'], mode: 'strict' }, 4, true);
  assert.deepEqual(result.confirmed, ['confirmed']);
  assert.deepEqual(result.ids, ['confirmed', 'park', 'lake']);
  assert.equal(result.ids.includes('unclear'), false);
  assert.deepEqual(result.filled, ['park', 'lake']);
  assert.equal(enrichmentBudget(20, 4), 12);
  assert.equal(enrichmentBudget(3, 4), 3);
  const strict = composeShortlist(pool, [judged('park')], { include: ['自然风光'], exclude: [], mode: 'strict' }, 4, false);
  assert.deepEqual(strict.ids, []);
  const cultural = composeShortlist([spot('museum', '科教文化服务;博物馆')], [judged('museum')], { include: ['博物馆'], exclude: [], mode: 'strict' }, 4, true);
  assert.deepEqual(cultural.ids, []);
  assert.equal(isBroadNatureRequest(['自然风光', '轻松节奏']), true);
  assert.equal(isBroadNatureRequest(['轻松节奏']), false);
  const paceOnly = composeShortlist([spot('park', '风景名胜;公园广场;公园'), spot('museum', '科教文化服务;博物馆')], [
    judged('park'), judged('museum'),
  ], { include: ['自然风光', '轻松节奏'], exclude: [], mode: 'strict' }, 4, true);
  assert.deepEqual(paceOnly.ids, ['park']);
});

test('软性偏好混合自然与人文历史时用地图类别补足，轻松节奏不阻挡，硬性排除仍然生效', () => {
  const include = ['自然风光', '人文历史', '轻松节奏'];
  const prefer = { include, exclude: [] as string[], mode: 'prefer' as const };
  assert.equal(isBroadNatureRequest(include), false);
  assert.equal(isSoftMixedPrefer(prefer), true);
  assert.equal(isSoftMixedPrefer({ ...prefer, mode: 'strict' }), false);
  const pool = [
    spot('park', '风景名胜;公园广场;公园'),
    spot('lake', '风景名胜;风景名胜'),
    spot('museum', '科教文化服务;博物馆'),
    spot('temple', '风景名胜;风景名胜;寺庙道观'),
    spot('mall', '购物服务;购物中心'),
    spot('street', '风景名胜;特色商业街'),
    spot('namedOnly', '购物服务;购物中心'),
    spot('fake', '风景名胜;公园广场;公园'),
    spot('confirmed', '风景名胜;风景名胜;湿地'),
    spot('unclear', '风景名胜;公园广场;公园'),
  ];
  pool[6].name = '南京博物院';
  assert.equal(scenicNatureRank(pool[2]), 0);
  assert.equal(cultureHistoryRank(pool[2]), 3);
  assert.equal(cultureHistoryRank(pool[3]), 3);
  assert.equal(cultureHistoryRank(pool[0]), 0);
  assert.equal(cultureHistoryRank(pool[6]), 0);
  const judgedAll = [
    judged('park', { score: 40 }),
    judged('lake', { score: 90 }),
    judged('museum', { score: 95 }),
    judged('temple', { score: 60 }),
    judged('mall', { score: 99 }),
    judged('street', { score: 98 }),
    judged('namedOnly', { score: 97 }),
    judged('fake', { inclusion: 'match', downgraded: true, score: 100 }),
    judged('confirmed', { status: 'match', inclusion: 'match', score: 80 }),
    judged('unclear', { exclusion: 'unknown', score: 99 }),
  ];
  const result = composeShortlist(pool, judgedAll, prefer, 6, true);
  assert.deepEqual(result.confirmed, ['confirmed']);
  assert.deepEqual(result.filled, ['museum', 'park', 'temple', 'lake']);
  assert.deepEqual(result.ids, ['confirmed', 'museum', 'park', 'temple', 'lake']);
  const excluded = composeShortlist(pool, judgedAll, { ...prefer, exclude: ['博物馆'] }, 6, true);
  assert.equal(excluded.ids.includes('museum'), false);
  assert.deepEqual(excluded.filled, ['temple', 'park', 'lake']);
  const indoor = composeShortlist(pool, judgedAll, { ...prefer, exclude: ['室内场馆'] }, 6, true);
  assert.equal(indoor.ids.includes('museum'), false);
  assert.equal(indoor.ids.includes('temple'), true);
  assert.equal(indoor.ids.includes('park'), true);
  const strict = composeShortlist(pool, judgedAll, { ...prefer, mode: 'strict' }, 6, true);
  assert.deepEqual(strict.ids, ['confirmed']);
  assert.deepEqual(strict.filled, []);
  const noEnrich = composeShortlist(pool, judgedAll, prefer, 6, false);
  assert.deepEqual(noEnrich.ids, ['confirmed']);
  const rejected = composeShortlist(pool, judgedAll.map(item => item.id === 'museum' ? { ...item, status: 'reject' as const, exclusion: 'violated' as const } : item), prefer, 6, true);
  assert.equal(rejected.ids.includes('museum'), false);
});
