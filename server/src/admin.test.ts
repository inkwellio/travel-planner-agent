import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AdminBan, AdminThread, AdminUser, TripView } from '../../shared/types.js';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ta-admin-')), 't.db');
process.env.ADMIN_PHONE = '13800138000';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_TOKEN = 'legacy-admin-token';
process.env.MOCK_DELAY = '0';
process.env.AMAP_WEB_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
process.env.SEARCH_API_KEY = '';

const PHONE = process.env.ADMIN_PHONE;
const PASSWORD = process.env.ADMIN_PASSWORD;

test('admin API: phone/password login, sessions, read-only thread, ban and unban', async t => {
  const { app } = await import('./index.js');
  const { db } = await import('./db.js');
  const { getTrip } = await import('./store.js');
  const { isIp, normalizeIp } = await import('./adminStore.js');
  assert.equal(normalizeIp('::ffff:10.1.2.3'), '10.1.2.3');
  assert.equal(normalizeIp(' ::ffff:127.0.0.1 '), '127.0.0.1');
  assert.equal(isIp('127.0.0.1'), true);
  assert.equal(isIp('::1'), true);
  assert.equal(isIp('999.0.0.1'), false);
  assert.equal(isIp('not-an-ip'), false);

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1');
    s.once('listening', () => resolve(s));
    s.once('error', reject);
  });
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  let token = '';
  const login = (body: unknown) => fetch(base + '/admin/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const admin = async (url: string, method = 'GET', body?: unknown) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null as unknown, text };
  };
  const asUser = async (url: string, token: string, method = 'GET', body?: unknown) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? (method === 'GET' || method === 'DELETE' ? undefined : '{}') : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null as unknown, text };
  };
  const openSession = async () => {
    const res = await fetch(base + '/api/session', { method: 'POST' });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    return (JSON.parse(text) as { token: string }).token;
  };

  try {
    const bare = await fetch(base + '/admin/users');
    assert.equal(bare.status, 401);
    const wrong = await fetch(base + '/admin/users', { headers: { authorization: 'Bearer wrong-token' } });
    assert.equal(wrong.status, 401);
    const query = await fetch(base + `/admin/users?access_token=${token}`);
    assert.equal(query.status, 401);
    const sneak = await fetch(base + '/admin/ips/ban', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ip: '203.0.113.9' }),
    });
    assert.equal(sneak.status, 401);

    const legacyAuth = await fetch(base + '/admin/users', { headers: { authorization: 'Bearer legacy-admin-token' } });
    assert.equal(legacyAuth.status, 401);
    for (const body of [{}, [], { phone: '123', password: PASSWORD }, { phone: PHONE, password: '' }]) {
      assert.equal((await login(body)).status, 400);
    }
    const badPhone = await login({ phone: '13900139000', password: PASSWORD });
    const badPassword = await login({ phone: PHONE, password: 'wrong-password' });
    assert.equal(badPhone.status, 401);
    assert.equal(badPassword.status, 401);
    assert.deepEqual(await badPhone.json(), await badPassword.json());
    assert.equal(badPassword.headers.get('cache-control'), 'no-store');
    process.env.ADMIN_PASSWORD = 'x'.repeat(257);
    assert.equal((await login({ phone: PHONE, password: PASSWORD })).status, 401);
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.ADMIN_PHONE = 'invalid';
    assert.equal((await login({ phone: PHONE, password: PASSWORD })).status, 401);
    process.env.ADMIN_PHONE = PHONE;
    const signedIn = await login({ phone: ` ${PHONE} `, password: PASSWORD });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.headers.get('cache-control'), 'no-store');
    const session = await signedIn.json() as { token: string };
    assert.deepEqual(Object.keys(session), ['token']);
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
    token = session.token;
    assert.equal((await fetch(base + `/admin/users?access_token=${token}`)).status, 401);

    const spoof = await fetch(base + '/api/trips', { headers: { 'x-user-id': 'spoofuser01' } });
    assert.equal(spoof.status, 401);
    const onlyToken = await openSession();
    const listed = await asUser('/api/trips', onlyToken);
    assert.equal(listed.status, 200);
    const sessionOnly = ((await admin('/admin/users')).json as AdminUser[])[0];
    assert.ok(sessionOnly);
    assert.equal(sessionOnly.tripCount, 0);
    assert.notEqual(sessionOnly.userId, 'spoofuser01');
    const userToken = await openSession();
    const createdRes = await asUser('/api/trips', userToken, 'POST', {});
    assert.equal(createdRes.status, 200, createdRes.text);
    const created = createdRes.json as TripView;
    const UID = created.ownerId;
    assert.ok(created.messages[0]?.at);
    assert.notEqual(UID, sessionOnly.userId);
    assert.equal((await asUser('/admin/users', userToken)).status, 401);
    assert.equal((await asUser('/api/trips', token)).status, 401);

    const usersRes = await admin('/admin/users');
    assert.equal(usersRes.status, 200);
    const users = usersRes.json as AdminUser[];
    const row = users.find(u => u.userId === UID);
    assert.equal(users.some(u => u.userId === 'spoofuser01'), false);
    assert.ok(row);
    assert.equal(row.ip, '127.0.0.1');
    assert.equal(row.tripCount, 1);
    assert.equal(row.messageCount, 1);
    assert.equal(row.banned, false);
    assert.ok(row.lastSeen);
    assert.ok(sessionOnly);
    assert.equal(sessionOnly.tripCount, 0);
    assert.equal(sessionOnly.messageCount, 0);
    assert.equal(sessionOnly.ip, '127.0.0.1');

    const threadRes = await admin(`/admin/users/${UID}/messages`);
    assert.equal(threadRes.status, 200);
    const thread = threadRes.json as AdminThread;
    assert.equal(thread.sessions.length, 1);
    assert.equal(thread.sessions[0].messageCount, 1);
    assert.equal(thread.sessions[0].messages[0].role, 'assistant');
    assert.match(thread.sessions[0].messages[0].content, /行程助手/);
    assert.equal(thread.sessions[0].messages[0].time, created.messages[0].at);

    const trip = getTrip(created.id);
    assert.ok(trip);
    trip.messages.push({ id: 'legacy', role: 'user', text: '旧消息没有时间' });
    const again = (await admin(`/admin/users/${UID}/messages`)).json as AdminThread;
    const legacy = again.sessions[0].messages.find(m => m.id === 'legacy');
    assert.ok(legacy);
    assert.equal(legacy.time, trip.updatedAt);
    assert.equal(legacy.content, '旧消息没有时间');
    const counted = (await admin('/admin/users')).json as AdminUser[];
    assert.equal(counted.find(u => u.userId === UID)?.messageCount, 2);

    assert.equal((await admin('/admin/users/abc/messages')).status, 400);
    assert.equal((await admin('/admin/users/missinguser/messages')).status, 404);
    assert.equal((await admin('/admin/ips/ban', 'POST', { ip: '你好' })).status, 400);

    const first = await admin('/admin/ips/ban', 'POST', { ip: row.ip, reason: '刷接口' });
    assert.equal(first.status, 200);
    const ban = first.json as AdminBan;
    assert.equal(ban.ip, '127.0.0.1');
    assert.equal(ban.reason, '刷接口');
    assert.ok(ban.visitorCount >= 1);
    await new Promise(r => setTimeout(r, 30));
    const second = await admin('/admin/ips/ban', 'POST', { ip: row.ip, reason: '重复提交' });
    assert.equal((second.json as AdminBan).createdAt, ban.createdAt);
    assert.equal((second.json as AdminBan).reason, '重复提交');
    const third = await admin('/admin/ips/ban', 'POST', { ip: row.ip });
    assert.equal((third.json as AdminBan).createdAt, ban.createdAt);
    assert.equal((third.json as AdminBan).reason, '重复提交');

    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 403);
    const share = await fetch(base + '/api/shares/nope-nope-nope-nope');
    assert.equal(share.status, 403);
    const tripsWhileBanned = await asUser('/api/trips', userToken);
    assert.equal(tripsWhileBanned.status, 403);
    const still = await admin('/admin/users');
    assert.equal(still.status, 200);
    assert.equal((still.json as AdminUser[]).find(u => u.userId === UID)?.banned, true);
    const ips = (await admin('/admin/ips')).json as AdminBan[];
    assert.equal(ips.length, 1);
    assert.equal(ips[0].ip, '127.0.0.1');

    const removed = await admin(`/admin/ips/ban/${encodeURIComponent(row.ip)}`, 'DELETE');
    assert.equal(removed.status, 200);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal((await fetch(base + '/api/shares/nope-nope-nope-nope')).status, 404);
    assert.equal((await asUser('/api/trips', userToken)).status, 200);
    const after = (await admin('/admin/users')).json as AdminUser[];
    assert.equal(after.find(u => u.userId === UID)?.banned, false);
    assert.equal(((await admin('/admin/ips')).json as AdminBan[]).length, 0);
    assert.equal((await admin(`/admin/ips/ban/${encodeURIComponent(row.ip)}`, 'DELETE')).status, 200);
    assert.equal((await admin('/admin/logout', 'POST')).status, 200);
    assert.equal((await admin('/admin/users')).status, 401);
    assert.equal((await admin('/admin/logout', 'POST')).status, 401);

    assert.equal((await login({ phone: PHONE, password: 'wrong' })).status, 401);
    const limited = await login({ phone: PHONE, password: PASSWORD });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.ok((await limited.json() as { retryAfter: number }).retryAfter > 0);
    t.mock.timers.enable({ apis: ['Date'] });
    t.mock.timers.tick(61_000);
    const retry = await login({ phone: PHONE, password: PASSWORD });
    assert.equal(retry.status, 200);
    token = (await retry.json() as { token: string }).token;
    assert.equal((await admin('/admin/users')).status, 200);
    assert.equal((await admin('/admin/logout', 'POST')).status, 200);
    t.mock.timers.reset();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

test('admin sessions expire, revoke, and reject changed credentials', async t => {
  const { createAdminSession, adminAuthorized, revokeAdminSession } = await import('./adminAuth.js');
  t.mock.timers.enable({ apis: ['Date'] });
  const login = () => {
    const token = createAdminSession(PHONE, PASSWORD);
    assert.ok(token);
    return `Bearer ${token}`;
  };
  const first = login();
  const second = login();
  assert.notEqual(first, second);
  assert.equal(adminAuthorized(first), true);
  revokeAdminSession(first);
  assert.equal(adminAuthorized(first), false);
  assert.equal(adminAuthorized(second), true);
  t.mock.timers.tick(8 * 60 * 60 * 1000);
  assert.equal(adminAuthorized(second), false);
  const rotated = login();
  process.env.ADMIN_PASSWORD = 'replacement-password';
  try {
    assert.equal(adminAuthorized(rotated), false);
    assert.equal(createAdminSession(PHONE, PASSWORD), undefined);
  } finally { process.env.ADMIN_PASSWORD = PASSWORD; }
  const disabled = login();
  process.env.ADMIN_PHONE = 'invalid';
  try { assert.equal(adminAuthorized(disabled), false); }
  finally { process.env.ADMIN_PHONE = PHONE; }
});


test('admin login limiter isolates IPs and allows retry after the window', async t => {
  const { adminLoginLimiter } = await import('./adminAuth.js');
  t.mock.timers.enable({ apis: ['Date'] });
  t.mock.timers.tick(120_000);
  const attempt = (ip: string) => {
    const result = { status: 200, retryAfter: '', next: false };
    const req = { ip, socket: {} } as import('express').Request;
    const res = {
      setHeader: (_name: string, value: string) => { result.retryAfter = value; },
      status: (status: number) => { result.status = status; return res; },
      json: () => {},
    } as unknown as import('express').Response;
    adminLoginLimiter(req, res, () => { result.next = true; });
    return result;
  };
  for (let n = 0; n < 10; n++) assert.equal(attempt('203.0.113.1').next, true);
  const limited = attempt('203.0.113.1');
  assert.equal(limited.status, 429);
  assert.equal(limited.next, false);
  assert.equal(limited.retryAfter, '60');
  assert.equal(attempt('203.0.113.2').next, true);
  t.mock.timers.tick(60_000);
  assert.equal(attempt('203.0.113.1').next, true);
});


test('admin configuration provides deployment credentials with optional environment overrides', async () => {
  const { adminConfig } = await import('./config/admin.js');
  const { createAdminSession, adminAuthorized, revokeAdminSession } = await import('./adminAuth.js');
  const savedPhone = process.env.ADMIN_PHONE;
  const savedPassword = process.env.ADMIN_PASSWORD;
  try {
    delete process.env.ADMIN_PHONE;
    delete process.env.ADMIN_PASSWORD;
    const token = createAdminSession(adminConfig.phone, adminConfig.password);
    assert.ok(token);
    assert.equal(adminAuthorized(`Bearer ${token}`), true);
    assert.equal(createAdminSession(adminConfig.phone, 'wrong-password'), undefined);
    process.env.ADMIN_PHONE = '';
    process.env.ADMIN_PASSWORD = '';
    assert.equal(adminAuthorized(`Bearer ${token}`), true);
    assert.ok(createAdminSession(adminConfig.phone, adminConfig.password));
    process.env.ADMIN_PHONE = '13900139000';
    process.env.ADMIN_PASSWORD = 'deployment-password-override';
    assert.equal(adminAuthorized(`Bearer ${token}`), false);
    assert.equal(createAdminSession(adminConfig.phone, adminConfig.password), undefined);
    const overridden = createAdminSession(process.env.ADMIN_PHONE, process.env.ADMIN_PASSWORD);
    assert.ok(overridden);
    revokeAdminSession(`Bearer ${overridden}`);
    assert.equal(adminAuthorized(`Bearer ${overridden}`), false);
  } finally {
    if (savedPhone === undefined) delete process.env.ADMIN_PHONE;
    else process.env.ADMIN_PHONE = savedPhone;
    if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = savedPassword;
  }
});
