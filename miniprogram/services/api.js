/**
 * 与 Web `web/src/api.ts` 同一套契约（见 shared/types.ts、server/src/index.ts）。
 * 服务端签发匿名会话，凭证存储在本机。
 */
const config = require('../config');
const { toErr, parseBody } = require('../utils/http');
const { createSseParser } = require('../utils/sse');

const UID_KEY = 'travel-agent:session';
let cachedUser = '';
let pendingUser;

function base() {
  return String(config.baseUrl || '').replace(/\/$/, '');
}

function ensureUser() {
  if (cachedUser) return Promise.resolve(cachedUser);
  if (pendingUser) return pendingUser;
  pendingUser = new Promise((resolve, reject) => {
    wx.getStorage({
      key: UID_KEY,
      success(res) {
        if (typeof res.data === 'string' && /^[A-Za-z0-9_-]{43}$/.test(res.data)) { cachedUser = res.data; resolve(cachedUser); return; }
        mint(resolve, reject);
      },
      fail() { mint(resolve, reject); },
    });
  }).finally(() => { pendingUser = null; });
  return pendingUser;
}

function mint(resolve, reject) {
  wx.request({ url: base() + '/api/session', method: 'POST', success(res) {
    const token = res.data && res.data.token;
    if (res.statusCode !== 200 || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return reject(toErr(res.statusCode, res.data, retryHeader(res)));
    wx.setStorage({ key: UID_KEY, data: token, success() { cachedUser = token; resolve(token); },
      fail(err) { reject({ status: 0, message: (err && err.errMsg) || '无法保存匿名会话' }); } });
  }, fail(err) { reject({ status: 0, message: (err && err.errMsg) || '网络错误' }); } });
}

/** 多个请求同时收到旧凭证的 401 时，只签发一次新会话。 */
function renewUser(rejectedAuthorization) {
  if (pendingUser) return pendingUser;
  if (cachedUser && rejectedAuthorization !== 'Bearer ' + cachedUser) return Promise.resolve(cachedUser);
  cachedUser = '';
  pendingUser = new Promise((resolve, reject) => {
    wx.removeStorage({
      key: UID_KEY,
      success() { mint(resolve, reject); },
      fail() {
        // 缓存可能已被用户清空；新凭证写入成功后会覆盖旧值。
        mint(resolve, reject);
      },
    });
  }).finally(() => { pendingUser = null; });
  return pendingUser;
}

async function headers() {
  const id = await ensureUser();
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + id };
}

function retryHeader(res) {
  const h = (res && res.header) || {};
  return h['Retry-After'] || h['retry-after'] || '';
}

function asBytes(data) {
  const tag = Object.prototype.toString.call(data);
  if (tag === '[object ArrayBuffer]') return new Uint8Array(data);
  if (tag === '[object Uint8Array]') return data;
  if (data && data.buffer && typeof data.byteLength === 'number') {
    return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  }
  return null;
}

function request(method, path, data, timeout, retried) {
  return headers().then(header => new Promise((resolve, reject) => {
    wx.request({
      url: base() + path,
      method,
      data,
      timeout: timeout || 20000,
      header,
      success(res) {
        const status = res.statusCode || 0;
        if (status === 401 && !retried) {
          renewUser(header.Authorization).then(() => request(method, path, data, timeout, true)).then(resolve, reject);
          return;
        }
        if (status >= 200 && status < 300) resolve(res.data);
        else reject(toErr(status, res.data, retryHeader(res)));
      },
      fail(err) {
        reject({ status: 0, code: '', retryAfter: 0, message: (err && err.errMsg) || '网络错误' });
      },
    });
  }));
}

function feed(parser, data) {
  if (data == null || data === '') return;
  if (typeof data === 'string') { parser.pushString(data); return; }
  const bytes = asBytes(data);
  if (bytes) parser.pushBytes(bytes);
}

/**
 * POST /api/trips/:id/plan 的 SSE。
 * 基础库 ≥2.20.1 走 enableChunked 逐块解析；不支持时等响应结束后解析整段，再不行由页面拉一次行程。
 */
function plan(id, attractionIds, onEvent, retried) {
  return headers().then(header => new Promise((resolve, reject) => {
    let events = 0;
    let chunked = false;
    const parser = createSseParser(e => { events += 1; onEvent(e); });
    const task = wx.request({
      url: base() + '/api/trips/' + encodeURIComponent(id) + '/plan',
      method: 'POST',
      data: { attractionIds },
      timeout: 180000,
      enableChunked: true,
      header,
      success(res) {
        const status = res.statusCode || 0;
        if (status === 401 && !retried && !events) {
          renewUser(header.Authorization).then(() => plan(id, attractionIds, onEvent, true)).then(resolve, reject);
          return;
        }
        if (status >= 400) { reject(toErr(status, parseBody(res.data), retryHeader(res))); return; }
        if (!chunked) feed(parser, res.data);
        resolve({ events });
      },
      fail(err) {
        reject({ status: 0, code: '', retryAfter: 0, message: (err && err.errMsg) || '网络错误' });
      },
    });
    if (task && typeof task.onChunkReceived === 'function') {
      task.onChunkReceived(res => {
        chunked = true;
        feed(parser, res && res.data);
      });
    }
  }));
}

const api = {
  ensureUser,
  health: () => request('GET', '/api/health'),
  trips: () => request('GET', '/api/trips'),
  getTrip: id => request('GET', '/api/trips/' + encodeURIComponent(id)),
  createTrip: () => request('POST', '/api/trips', {}),
  deleteTrip: id => request('DELETE', '/api/trips/' + encodeURIComponent(id)),
  patchState: (id, state) => request('PATCH', '/api/trips/' + encodeURIComponent(id) + '/state', state),
  chat: (id, message) => request('POST', '/api/trips/' + encodeURIComponent(id) + '/chat', { message }),
  edit: (id, day, attractionIds, note) => request('POST', '/api/trips/' + encodeURIComponent(id) + '/edit', { day, attractionIds, note }),
  activate: (id, version) => request('POST', '/api/trips/' + encodeURIComponent(id) + '/versions/' + version + '/activate', {}),
  share: id => request('POST', '/api/trips/' + encodeURIComponent(id) + '/share', {}),
  plan,
};

module.exports = api;
