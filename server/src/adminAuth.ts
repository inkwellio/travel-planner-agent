import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { adminConfig } from './config/admin.js';

export const ADMIN_PHONE_RE = /^1[3-9]\d{9}$/;
const SESSION_TTL = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW = 60_000;
const LOGIN_LIMIT = 10;
const hash = (value: string) => createHash('sha256').update(value).digest();
const sessions = new Map<string, { credentials: string; expiresAt: number }>();
const attempts = new Map<string, { count: number; expiresAt: number }>();

function credentials() {
  const phone = process.env.ADMIN_PHONE?.trim() || adminConfig.phone;
  const password = process.env.ADMIN_PASSWORD || adminConfig.password;
  if (!ADMIN_PHONE_RE.test(phone) || !password || password.length > 256) return undefined;
  return { phone, password, signature: hash(`${phone}\0${password}`).toString('hex') };
}

function tokenKey(header: string | undefined) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header ?? '');
  return match ? hash(match[1]).toString('hex') : undefined;
}

/** 独立于匿名访客会话；默认读取服务端配置，也支持环境变量覆盖。 */
export function createAdminSession(phone: string, password: string): string | undefined {
  const config = credentials();
  if (!config) return undefined;
  const phoneOk = timingSafeEqual(hash(phone), hash(config.phone));
  const passwordOk = timingSafeEqual(hash(password), hash(config.password));
  if (!phoneOk || !passwordOk) return undefined;
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (session.expiresAt <= now || session.credentials !== config.signature) sessions.delete(key);
  }
  if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!);
  const token = randomBytes(32).toString('base64url');
  sessions.set(hash(token).toString('hex'), { credentials: config.signature, expiresAt: now + SESSION_TTL });
  return token;
}

export function adminAuthorized(header: string | undefined): boolean {
  const key = tokenKey(header);
  if (!key) return false;
  const session = sessions.get(key);
  if (!session) return false;
  if (session.expiresAt <= Date.now() || session.credentials !== credentials()?.signature) {
    sessions.delete(key);
    return false;
  }
  return true;
}

export function revokeAdminSession(header: string | undefined) {
  const key = tokenKey(header);
  if (key) sessions.delete(key);
}

/** 按可信客户端 IP 限制登录，每分钟最多 10 次，并限制内存占用。 */
export function adminLoginLimiter(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.expiresAt <= now) attempts.delete(key);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const entry = attempts.get(ip) ?? { count: 0, expiresAt: now + LOGIN_WINDOW };
  if (entry.count >= LOGIN_LIMIT || (!attempts.has(ip) && attempts.size >= 10_000)) {
    const retryAfter = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return void res.status(429).json({ error: '登录尝试过于频繁，请稍后再试', retryAfter });
  }
  entry.count += 1;
  attempts.set(ip, entry);
  next();
}
