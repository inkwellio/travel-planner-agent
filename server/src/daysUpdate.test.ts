import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PlanEvent, TripView } from '../../shared/types.js';

// 在加载 db / dotenv 之前钉死临时库，避免污染 server/data/travel.db，也避免 .env 里的 key 把测试带出 mock。
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-days-')), 't.db');
process.env.MOCK_DELAY = '0';
process.env.AMAP_WEB_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
process.env.SEARCH_API_KEY = '';

const UID = 'daysupdate1';

function sse(body: string): PlanEvent[] {
  return body.split('\n\n').flatMap(block => {
    const data = block.split('\n').find(l => l.startsWith('data: '));
    return data ? [JSON.parse(data.slice(6)) as PlanEvent] : [];
  });
}

test('chat updates days on an existing trip and plan uses that count', async () => {
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
    assert.equal(created.state.days, 2);
    assert.equal(created.state.destination, '');
    const named = JSON.parse(await call(`/api/trips/${created.id}/state`, { destination: '南京' }, 'PATCH')) as TripView;
    assert.equal(named.state.destination, '南京');

    const chatted = JSON.parse(await call(`/api/trips/${created.id}/chat`, { message: '带爸妈慢慢逛西湖，3天' })) as TripView;
    assert.equal(chatted.state.days, 3);
    assert.match(chatted.title, /3 天/);
    assert.match(chatted.messages.at(-1)?.text ?? '', /已按 3 天更新行程/);

    const ids = chatted.messages.at(-1)?.recommendations ?? [];
    assert.ok(ids.length >= 3, `expected enough recommendations to fill 3 days, got ${ids.length}`);
    const events = sse(await call(`/api/trips/${created.id}/plan`, { attractionIds: ids }));
    const assign = events.find(e => e.type === 'assign');
    assert.ok(assign && assign.type === 'assign');
    assert.deepEqual(assign.days.map(d => d.day), [1, 2, 3]);
    const done = events.find(e => e.type === 'done');
    assert.ok(done && done.type === 'done');
    assert.equal(done.trip.state.days, 3);
    assert.equal(done.trip.versions.find(v => v.version === done.version)?.days.length, 3);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});
