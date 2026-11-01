import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { TripState } from '../../shared/types.js';
import { NO_PLAN_WITHOUT_CITY, hasDestination, messageFromParams } from '../../shared/askFromParams.js';
import { parseDestinationIntent } from './destinationIntent.js';
import { applyDaysIntent } from './tripPrefs.js';

const require = createRequire(import.meta.url);
const js = require('../../miniprogram/utils/ask.js') as {
  hasDestination: typeof hasDestination;
  messageFromParams: typeof messageFromParams;
  NO_PLAN_WITHOUT_CITY: string;
};

const cixi: TripState = {
  destination: '慈溪',
  days: 1,
  preferences: ['自然风光', '人文历史'],
  pace: '轻松',
  companions: '独自',
};

test('自动诉求仅使用目的地和偏好，不带入已移除的参数', () => {
  const text = messageFromParams(cixi);
  assert.equal(text, '请按规划参数推荐景点。慈溪，偏好：自然风光、人文历史。');
  assert.equal(js.messageFromParams(cixi), text);
  const legacy: TripState = { ...cixi, days: 7, pace: '紧凑', companions: '带老人' };
  assert.equal(messageFromParams(legacy), text);
  assert.equal(js.messageFromParams(legacy), text);
  assert.equal(parseDestinationIntent(text).kind, 'none');
  const days = applyDaysIntent(cixi, text);
  assert.equal(days.state.days, 1);
  assert.equal(days.note, '');
});

test('没填偏好时写成不限；没目的地不能当参数够用', () => {
  const bare: TripState = { ...cixi, destination: '  ', preferences: [] };
  assert.equal(hasDestination(bare), false);
  assert.equal(js.hasDestination(bare), false);
  assert.equal(hasDestination(cixi), true);
  const text = messageFromParams({ ...cixi, preferences: ['  '] });
  assert.match(text, /偏好：不限/);
  assert.equal(js.messageFromParams({ ...cixi, preferences: [] }), messageFromParams({ ...cixi, preferences: [] }));
  assert.equal(js.NO_PLAN_WITHOUT_CITY, NO_PLAN_WITHOUT_CITY);
});
