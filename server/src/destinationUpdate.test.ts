import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TripView } from '../../shared/types.js';

// 在加载 db / dotenv 之前钉死临时库，避免污染 server/data/travel.db，也避免 .env 里的 key 把测试带出 mock。
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-dest-')), 't.db');
process.env.MOCK_DELAY = '0';
process.env.AMAP_WEB_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
process.env.SEARCH_API_KEY = '';

const UID = 'destupdate1';

test('chat updates destination before recommend, and days in the same sentence', async () => {
  const { app } = await import('./index.js');
  const { db } = await import('./db.js');
  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1');
    s.once('listening', () => resolve(s));
    s.once('error', reject);
  });
  const port = (server.address() as AddressInfo).port;
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/session`, { method: 'POST' });
  const { token } = await sessionResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const call = async (url: string, body?: unknown, method = 'POST') => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : '{}' });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    return text;
  };
  try {
    const created = JSON.parse(await call('/api/trips')) as TripView;
    assert.equal(created.state.destination, '');
    assert.equal(created.state.days, 2);
    assert.equal(created.title, '2 天行程');
    assert.match(created.messages[0]?.text ?? '', /先告诉我要去哪座城市/);
    assert.doesNotMatch(created.messages[0]?.text ?? '', /杭州/);

    const bareTrip = JSON.parse(await call('/api/trips')) as TripView;
    const shanghai = JSON.parse(await call(`/api/trips/${bareTrip.id}/chat`, { message: '上海' })) as TripView;
    assert.equal(shanghai.messages.some(m => m.role === 'user' && m.text === '上海'), true);
    assert.equal(shanghai.state.destination, '上海');
    assert.match(shanghai.title, /^上海 /);
    const shanghaiReply = shanghai.messages.at(-1)?.text ?? '';
    assert.match(shanghaiReply, /已按 上海 更新目的地/);
    assert.match(shanghaiReply, /为上海/);
    assert.doesNotMatch(shanghaiReply, /先告诉我目的地城市/);
    assert.ok((shanghai.messages.at(-1)?.recommendations ?? []).length > 0);

    const food = JSON.parse(await call(`/api/trips/${bareTrip.id}/chat`, { message: '有没有好吃的呢' })) as TripView;
    assert.equal(food.state.destination, '上海');
    assert.equal(food.messages.at(-1)?.recommendations, undefined);
    assert.match(food.messages.at(-1)?.text ?? '', /餐饮信息/);

    for (const question of ['有土特产吗', '住宿住哪里好', '地铁怎么坐', '门票多少钱', '天气怎么样']) {
      const info = JSON.parse(await call(`/api/trips/${bareTrip.id}/chat`, { message: question })) as TripView;
      assert.equal(info.state.destination, '上海');
      assert.equal(info.messages.at(-1)?.recommendations, undefined, question);
      assert.match(info.messages.at(-1)?.text ?? '', /相关资料/, question);
    }
    const noCity = JSON.parse(await call('/api/trips')) as TripView;
    const specialty = JSON.parse(await call(`/api/trips/${noCity.id}/chat`, { message: '土特产' })) as TripView;
    assert.equal(specialty.state.destination, '');
    assert.match(specialty.messages.at(-1)?.text ?? '', /目的地城市/);
    assert.equal(specialty.messages.at(-1)?.recommendations, undefined);

    const unrelated = JSON.parse(await call(`/api/trips/${bareTrip.id}/chat`, { message: '帮我写一段 Python 代码' })) as TripView;
    assert.equal(unrelated.state.destination, '上海');
    assert.equal(unrelated.messages.at(-1)?.recommendations, undefined);
    assert.match(unrelated.messages.at(-1)?.text ?? '', /只能协助解答旅行相关问题/);

    const onlyLake = JSON.parse(await call(`/api/trips/${created.id}/chat`, { message: '西湖' })) as TripView;
    assert.equal(onlyLake.state.destination, '');
    assert.equal(onlyLake.messages.at(-1)?.recommendations, undefined);
    assert.match(onlyLake.messages.at(-1)?.text ?? '', /目的地城市/);
    assert.doesNotMatch(onlyLake.messages.at(-1)?.text ?? '', /更新目的地|为杭州/);

    const lake = JSON.parse(await call(`/api/trips/${created.id}/chat`, { message: '西湖怎么玩' })) as TripView;
    assert.equal(lake.state.destination, '');
    assert.equal(lake.messages.at(-1)?.recommendations, undefined);
    assert.match(lake.messages.at(-1)?.text ?? '', /目的地城市/);
    assert.doesNotMatch(lake.messages.at(-1)?.text ?? '', /更新目的地|为杭州/);

    const temple = JSON.parse(await call(`/api/trips/${created.id}/chat`, { message: '夫子庙怎么玩' })) as TripView;
    assert.equal(temple.state.destination, '');
    assert.equal(temple.messages.at(-1)?.recommendations, undefined);

    const nanjing = JSON.parse(await call(`/api/trips/${created.id}/chat`, { message: '南京怎么玩' })) as TripView;
    assert.equal(nanjing.state.destination, '南京');
    assert.match(nanjing.title, /^南京 /);
    const reply = nanjing.messages.at(-1)?.text ?? '';
    assert.match(reply, /已按 南京 更新目的地/);
    // recommend 的 mock 文案用的是已经写回的 state.destination；candidates 在它前面用同一个值查询。
    assert.match(reply, /为南京/);
    assert.ok((nanjing.messages.at(-1)?.recommendations ?? []).length > 0);

    const fresh = JSON.parse(await call('/api/trips')) as TripView;
    const both = JSON.parse(await call(`/api/trips/${fresh.id}/chat`, { message: '我想去南京 3 天' })) as TripView;
    assert.equal(both.state.destination, '南京');
    assert.equal(both.state.days, 3);
    const bothReply = both.messages.at(-1)?.text ?? '';
    assert.match(bothReply, /已按 南京 更新目的地/);
    assert.match(bothReply, /已按 3 天更新行程/);
    assert.match(both.title, /南京 3 天/);

    const westTrip = JSON.parse(await call('/api/trips')) as TripView;
    const west = JSON.parse(await call(`/api/trips/${westTrip.id}/chat`, { message: '带爸妈慢慢逛西湖，3天' })) as TripView;
    assert.equal(west.state.destination, '');
    assert.equal(west.state.days, 3);
    assert.equal(west.title, '3 天行程');
    assert.match(west.messages.at(-1)?.text ?? '', /已按 3 天更新行程/);
    assert.match(west.messages.at(-1)?.text ?? '', /目的地城市/);
    assert.equal(west.messages.at(-1)?.recommendations, undefined);
    assert.doesNotMatch(west.messages.at(-1)?.text ?? '', /更新目的地|为杭州/);

    const named = JSON.parse(await call(`/api/trips/${westTrip.id}/state`, { destination: '  南京  ' }, 'PATCH')) as TripView;
    assert.equal(named.state.destination, '南京');
    assert.match(named.title, /^南京 /);
    const cleared = JSON.parse(await call(`/api/trips/${westTrip.id}/state`, { destination: '   ' }, 'PATCH')) as TripView;
    assert.equal(cleared.state.destination, '');
    assert.doesNotMatch(cleared.title, /杭州|南京/);

    const unsure = JSON.parse(await call(`/api/trips/${fresh.id}/chat`, { message: '南京还是杭州' })) as TripView;
    assert.equal(unsure.state.destination, '南京');
    assert.match(unsure.messages.at(-1)?.text ?? '', /仍按 南京/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});
