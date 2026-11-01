import assert from 'node:assert/strict';
import test from 'node:test';
import type { TripState } from '../../shared/types.js';
import { applyDaysIntent, parseDaysIntent } from './tripPrefs.js';

const base = (): TripState => ({ destination: '杭州', days: 2, preferences: ['自然风光'], pace: '轻松', companions: '带老人' });

test('clear day counts update an existing trip', () => {
  for (const message of ['带爸妈慢慢逛西湖，3天', '三天', '改成3天', '改成三天', '改为 3 天', '三日游', '玩5日', '两天']) {
    const intent = parseDaysIntent(message);
    assert.equal(intent.kind, 'set', message);
    if (intent.kind === 'set') {
      const applied = applyDaysIntent(base(), message);
      assert.equal(applied.state.days, intent.days, message);
      if (intent.days !== 2) assert.match(applied.note, new RegExp(`已按 ${intent.days} 天`));
    }
  }
  assert.equal((parseDaysIntent('带爸妈慢慢逛西湖，3天') as { days: number }).days, 3);
  assert.equal((parseDaysIntent('三天') as { days: number }).days, 3);
  assert.equal((parseDaysIntent('改成3天') as { days: number }).days, 3);
  assert.equal((parseDaysIntent('两天') as { days: number }).days, 2);
  assert.equal((parseDaysIntent('玩5日') as { days: number }).days, 5);
});

test('改成 wins over the previous count', () => {
  const applied = applyDaysIntent(base(), '从2天改成3天');
  assert.equal(applied.state.days, 3);
  assert.match(applied.note, /已按 3 天/);
  const again = applyDaysIntent(base(), '改成3天，不对，改成4天');
  assert.equal(again.state.days, 4);
});

test('an alternative after 改成 stays unresolved', () => {
  for (const message of ['改成3天或4天', '改成3天还是4天']) {
    const applied = applyDaysIntent(base(), message);
    assert.equal(applied.state.days, 2, message);
    assert.match(applied.note, /仍按 2 天/, message);
  }
});

test('same count does not add a note', () => {
  const applied = applyDaysIntent(base(), '就两天');
  assert.equal(applied.state.days, 2);
  assert.equal(applied.note, '');
});

test('day index, dates, and filler words are not a new length', () => {
  for (const message of ['第3天去灵隐', '10月3日去西湖', '每天逛两个地方', '一整天逛西湖', '一天到晚慢慢走', '带爸妈慢慢逛西湖，少爬坡', '天气不错', '西湖十景']) {
    const applied = applyDaysIntent(base(), message);
    assert.equal(applied.state.days, 2, message);
    assert.equal(applied.note, '', message);
    assert.equal(parseDaysIntent(message).kind, 'none', message);
  }
});

test('ambiguous or out-of-range counts ask instead of changing', () => {
  for (const message of ['2天还是3天', '3到4天', '两三天', '三四天', '大概3天', '3天左右', '不要3天', '1.5天', '3天半']) {
    const applied = applyDaysIntent(base(), message);
    assert.equal(applied.state.days, 2, message);
    assert.match(applied.note, /仍按 2 天/, message);
  }
  const tooLong = applyDaysIntent(base(), '改成10天');
  assert.equal(tooLong.state.days, 2);
  assert.match(tooLong.note, /1–7 天/);
  assert.equal(parseDaysIntent('十天').kind, 'out_of_range');
});
