import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';

/**
 * 限流与每日额度：每分钟限流在内存；每日计数持久化在 SQLite（daily_usage），重启不清零
 * - 每分钟：按 IP + 匿名 ID，仅作用于规划/聊天类接口（查看、分享不受影响）
 * - 每日全局：DeepSeek / 高德 / 搜索 分别计数（Asia/Taipei 自然日）
 * 本地 dev（NODE_ENV!=production）默认宽松：每分钟 60 次、每日不限；生产默认每分钟 5 次。
 */
const isProd = process.env.NODE_ENV === 'production';
const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
export const LIMITS = {
  perMinute: num(process.env.RATE_LIMIT_PER_MIN, isProd ? 5 : 60),
  daily: {
    deepseek: num(process.env.DAILY_LIMIT_DEEPSEEK, isProd ? 2000 : 0), // 0 = 不限
    amap: num(process.env.DAILY_LIMIT_AMAP, isProd ? 5000 : 0),
    search: num(process.env.DAILY_LIMIT_SEARCH, isProd ? 500 : 0),
  },
};
export type ExternalKind = keyof typeof LIMITS.daily;

export class QuotaError extends Error {
  constructor(public kind: ExternalKind) { super('今天的规划次数已用完，明天再来'); }
}

// —— 每日计数（SQLite，原子自增）——
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
db.exec(`CREATE TABLE IF NOT EXISTS daily_usage (date TEXT NOT NULL, provider TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, provider))`);
// 单条语句完成“未超额则 +1”：超额时 WHERE 不成立、不返回行
const incr = db.prepare(`INSERT INTO daily_usage (date, provider, count) VALUES (@date, @provider, 1)
  ON CONFLICT(date, provider) DO UPDATE SET count = count + 1 WHERE @cap <= 0 OR count < @cap
  RETURNING count`);
const selDay = db.prepare(`SELECT provider, count FROM daily_usage WHERE date = ?`);
const countOf = (date: string) => {
  const used: Record<ExternalKind, number> = { deepseek: 0, amap: 0, search: 0 };
  for (const r of selDay.all(date) as { provider: ExternalKind; count: number }[]) if (r.provider in used) used[r.provider] = r.count;
  return used;
};
/** 每次真实外部调用前调用；超额抛 QuotaError（调用方不得把它吞掉回退 mock） */
export function consume(kind: ExternalKind) {
  const cap = LIMITS.daily[kind];
  if (cap > 0 && countOf(today())[kind] >= cap) throw new QuotaError(kind);
  const row = incr.get({ date: today(), provider: kind, cap });
  if (!row) throw new QuotaError(kind);
}
export function exhausted(kinds: ExternalKind[]) { const u = countOf(today()); return kinds.find(k => LIMITS.daily[k] > 0 && u[k] >= LIMITS.daily[k]); }
export const usage = () => { const day = today(); return { day, used: countOf(day), limits: LIMITS }; };
export const isQuotaError = (e: unknown): e is QuotaError => e instanceof QuotaError;

// —— 每分钟滑动窗口 ——
const hits = new Map<string, number[]>();
const publicHits = new Map<string, number[]>();
setInterval(() => { const t = Date.now() - 60_000; for (const [k, v] of hits) if (!v.some(x => x > t)) hits.delete(k); }, 60_000).unref();
setInterval(() => { const t = Date.now() - 60_000; for (const [k, v] of publicHits) if (!v.some(x => x > t)) publicHits.delete(k); }, 60_000).unref();

/** 所有公开接口按 IP 限制，不能通过更换匿名会话绕过。 */
export function publicLimiter(req: Request, res: Response, next: NextFunction) {
  const cap = num(process.env.PUBLIC_RATE_LIMIT_PER_MIN, isProd ? 120 : 600);
  if (cap <= 0) return next();
  const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const arr = (publicHits.get(key) ?? []).filter(t => t > now - 60_000);
  if (arr.length >= cap) {
    const retry = Math.max(1, Math.ceil((arr[0] + 60_000 - now) / 1000));
    res.setHeader('Retry-After', String(retry));
    return void res.status(429).json({ error: '请求过于频繁，请稍后再试', code: 'rate', retryAfter: retry });
  }
  arr.push(now); publicHits.set(key, arr); next();
}

/** 规划/聊天类接口：每分钟上限 + 每日额度预检 */
export function planLimiter(kinds: () => ExternalKind[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ex = exhausted(kinds());
    if (ex) return void res.status(429).json({ error: '今天的规划次数已用完，明天再来', code: 'daily', kind: ex });
    if (LIMITS.perMinute > 0) {
      const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const now = Date.now();
      const arr = (hits.get(key) ?? []).filter(t => t > now - 60_000);
      if (arr.length >= LIMITS.perMinute) {
        const retry = Math.max(1, Math.ceil((arr[0] + 60_000 - now) / 1000));
        res.setHeader('Retry-After', String(retry));
        return void res.status(429).json({ error: '规划得有点快，稍等几秒再试', code: 'rate', retryAfter: retry });
      }
      arr.push(now); hits.set(key, arr);
    }
    next();
  };
}
