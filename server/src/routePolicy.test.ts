import assert from 'node:assert/strict';
import test from 'node:test';
import type { TripState } from '../../shared/types.js';
import { routeState } from './routePolicy.js';
import { InputError, statePatch } from './validation.js';

const state: TripState = { destination: '无锡', days: 2, pace: '轻松', preferences: [], companions: '独自' };

test('自动路线随勾选数量扩展，不受旧天数和节奏限制，也不改写原参数', () => {
  const original = structuredClone(state);
  const short = routeState(state, 3);
  const long = routeState(state, 12);
  assert.equal(short.days, 1);
  assert.equal(long.days, 4);
  assert.equal(long.pace, '适中');
  assert.deepEqual(routeState({ ...state, days: 7, pace: '紧凑' }, 12), long);
  assert.deepEqual(state, original);
  assert.equal(routeState(state, 50).days, 7);
});

test('聊天中明确提出的路线要求可保留，未明确的另一项仍自动安排', () => {
  assert.equal(routeState({ ...state, routeConstraints: { days: 3 } }, 12).days, 3);
  const slow = routeState({ ...state, routeConstraints: { pace: '轻松' } }, 12);
  assert.equal(slow.pace, '轻松');
  assert.equal(slow.days, 4);
  assert.deepEqual(statePatch({ routeConstraints: { days: 3, pace: '轻松' } }).routeConstraints, { days: 3, pace: '轻松' });
  for (const value of [null, { days: 0 }, { days: 8 }, { days: 1.5 }, { pace: '任意' }, { destination: '上海' }]) {
    assert.throws(() => statePatch({ routeConstraints: value }), InputError);
  }
});
