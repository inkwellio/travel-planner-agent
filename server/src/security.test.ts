import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-security-')), 'test.db');
process.env.AMAP_WEB_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
process.env.SEARCH_API_KEY = '';
process.env.PUBLIC_RATE_LIMIT_PER_MIN = '12';

test('匿名会话隔离、禁止未授权覆盖，且公开接口按 IP 限流', async () => {
  const { app } = await import('./index.js');
  const { db } = await import('./db.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const makeSession = async () => (await (await fetch(base + '/api/session', { method: 'POST' })).json() as { token: string }).token;
    const a = await makeSession();
    const b = await makeSession();
    assert.notEqual(a, b);
    const create = await fetch(base + '/api/trips', { method: 'POST', headers: { authorization: `Bearer ${a}`, 'content-type': 'application/json' }, body: '{}' });
    const trip = await create.json() as { id: string; ownerId: string };
    assert.equal(create.status, 200);
    assert.equal((await fetch(base + `/api/trips/${trip.id}`, { headers: { authorization: `Bearer ${b}` } })).status, 404);
    assert.equal((await fetch(base + `/api/trips/${trip.id}`, { headers: { 'x-user-id': trip.ownerId } })).status, 401);
    assert.equal((await fetch(base + `/api/trips/${trip.id}`, { headers: { authorization: `Bearer ${a}` } })).status, 200);
    assert.equal((await fetch(base + '/api/attractions/test/manual', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"ticket":"bad"}' })).status, 404);
    for (let i = 0; i < 5; i++) await fetch(base + '/api/health', { headers: { 'x-user-id': `different${i}` } });
    const limited = await fetch(base + '/api/health', { headers: { 'x-user-id': 'another' } });
    assert.equal(limited.status, 429);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});
