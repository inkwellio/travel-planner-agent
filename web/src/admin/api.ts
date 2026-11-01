import type { AdminBan, AdminThread, AdminUser } from '../../../shared/types';

const KEY = 'travel-agent:admin-token';

let memory = '';
try { memory = sessionStorage.getItem(KEY) ?? ''; } catch { memory = ''; }

export function getAdminToken() { return memory; }

export function setAdminToken(token: string) {
  memory = token.trim();
  try {
    if (memory) sessionStorage.setItem(KEY, memory);
    else sessionStorage.removeItem(KEY);
  } catch { /* 隐私模式写不进 sessionStorage 时，至少本页内存里还有 */ }
}

export class AdminError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** 没有令牌时不发请求。401 会清掉本会话令牌。 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new AdminError('未登录', 401);
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  const r = await fetch(path, { ...init, headers });
  if (r.status === 401) {
    setAdminToken('');
    throw new AdminError('登录已失效，请重新登录', 401);
  }
  if (!r.ok) {
    const b = await r.json().catch(() => ({} as { error?: string }));
    throw new AdminError(b.error ?? '请求失败', r.status);
  }
  return r.json() as Promise<T>;
}

export const adminApi = {
  login: async (phone: string, password: string) => {
    const r = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({} as { error?: string }));
      throw new AdminError(b.error ?? '登录失败，请稍后再试', r.status);
    }
    const { token } = await r.json() as { token: string };
    setAdminToken(token);
  },
  logout: async () => {
    try { await call<{ ok: boolean }>('/admin/logout', { method: 'POST' }); }
    finally { setAdminToken(''); }
  },
  users: () => call<AdminUser[]>('/admin/users'),
  thread: (userId: string) => call<AdminThread>(`/admin/users/${encodeURIComponent(userId)}/messages`),
  bans: () => call<AdminBan[]>('/admin/ips'),
  ban: (ip: string, reason?: string) => call<AdminBan>('/admin/ips/ban', {
    method: 'POST',
    body: JSON.stringify({ ip, ...(reason ? { reason } : {}) }),
  }),
  unban: (ip: string) => call<{ ok: boolean }>(`/admin/ips/ban/${encodeURIComponent(ip)}`, { method: 'DELETE' }),
};

export function explain(e: unknown) {
  if (e instanceof AdminError) return e.message;
  return '无法连接后台';
}
