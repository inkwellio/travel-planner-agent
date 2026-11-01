import type { PlanEvent, ShareSnapshot, Trip, TripState, TripView } from '../../shared/types';

const SESSION_KEY = 'travel-agent:session';
let pendingSession: Promise<string> | undefined;
async function session(): Promise<string> {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved && /^[A-Za-z0-9_-]{43}$/.test(saved)) return saved;
  if (!pendingSession) pendingSession = (async () => {
    const r = await fetch('/api/session', { method: 'POST', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw await toError(r);
    const { token } = await r.json() as { token: string };
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('无法创建匿名会话，请重试');
    localStorage.setItem(SESSION_KEY, token);
    return token;
  })().finally(() => { pendingSession = undefined; });
  return pendingSession;
}
const headers = async () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${await session()}` });

/** 接口错误：429 时带 code（rate=每分钟超限 / daily=每日额度）与 retryAfter（秒） */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public retryAfter?: number) { super(message); }
}
async function toError(r: Response) {
  const b = await r.json().catch(() => ({}));
  const ra = Number(r.headers.get('Retry-After') ?? b.retryAfter);
  return new ApiError(b.error ?? r.statusText, r.status, b.code, Number.isFinite(ra) ? ra : undefined);
}
/** 401 在业务处理前返回；凭证失效时重新签发，最多重试一次。 */
async function authenticatedFetch(url: string, init?: RequestInit): Promise<Response> {
  const header = await headers();
  const r = await fetch(url, { ...init, headers: header });
  if (r.status !== 401) return r;
  const rejected = header.Authorization.slice('Bearer '.length);
  if (localStorage.getItem(SESSION_KEY) === rejected) localStorage.removeItem(SESSION_KEY);
  return fetch(url, { ...init, headers: await headers() });
}
async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await authenticatedFetch(url, { signal: AbortSignal.timeout(url.endsWith('/chat') ? 180000 : 20000), ...init });
  if (!r.ok) throw await toError(r);
  return r.json();
}
export const api = {
  health: () => j<{ llm: string; map: string; search: string; sample: boolean }>('/api/health'),
  deleteTrip: (id: string) => j<{ ok: boolean }>(`/api/trips/${id}`, { method: 'DELETE' }),
  trips: () => j<Trip[]>('/api/trips'),
  getTrip: (id: string) => j<TripView>(`/api/trips/${id}`),
  createTrip: () => j<TripView>('/api/trips', { method: 'POST', body: '{}' }),
  patchState: (id: string, s: Partial<TripState>) => j<TripView>(`/api/trips/${id}/state`, { method: 'PATCH', body: JSON.stringify(s) }),
  chat: (id: string, message: string) => j<TripView>(`/api/trips/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) }),
  edit: (id: string, day: number, attractionIds: string[], note?: string) =>
    j<TripView>(`/api/trips/${id}/edit`, { method: 'POST', body: JSON.stringify({ day, attractionIds, note }) }),
  share: (id: string) => j<ShareSnapshot>(`/api/trips/${id}/share`, { method: 'POST' }),
  getShare: (sid: string) => j<ShareSnapshot>(`/api/shares/${sid}`),
  copyShare: (sid: string) => j<TripView>(`/api/shares/${sid}/copy`, { method: 'POST' }),
  activate: (id: string, v: number) => j<TripView>(`/api/trips/${id}/versions/${v}/activate`, { method: 'POST' }),
  /** SSE（POST + ReadableStream） */
  async plan(id: string, attractionIds: string[], onEvent: (e: PlanEvent) => void) {
    const r = await authenticatedFetch(`/api/trips/${id}/plan`, { method: 'POST', body: JSON.stringify({ attractionIds }) });
    if (!r.ok) throw await toError(r);
    const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = chunk.split('\n').find(l => l.startsWith('data: '));
        if (data) onEvent(JSON.parse(data.slice(6)));
      }
    }
  },
};
