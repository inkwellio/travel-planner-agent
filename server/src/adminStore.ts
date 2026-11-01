import type { NextFunction, Request, Response } from 'express';
import type { AdminBan, AdminSession, AdminThread, AdminUser, Trip } from '../../shared/types.js';
import { db } from './db.js';
import { allTrips, listTrips } from './store.js';

/**
 * 管理后台用的两张表，跟行程 checkpoint 放在同一个 SQLite 文件里。
 * user_sessions 只记匿名访客最近从哪个 IP 来过，不建完整用户表。
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS banned_ips (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT
  );
  CREATE TABLE IF NOT EXISTS user_sessions (
    user_id TEXT NOT NULL,
    ip TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (user_id, ip)
  );
  CREATE INDEX IF NOT EXISTS user_sessions_ip ON user_sessions(ip);
`);

const UID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const V4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Express 在双栈下可能给出 ::ffff:1.2.3.4，统一成点分 IPv4 再入库、再比对 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim();
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : ip;
}

export function isIp(ip: string): boolean {
  if (V4.test(ip)) return true;
  if (!ip.includes(':') || ip.length > 45) return false;
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;
  const halves = ip.split('::');
  if (halves.length > 2) return false;
  const groups = halves.length === 2
    ? [...(halves[0] ? halves[0].split(':') : []), ...(halves[1] ? halves[1].split(':') : [])]
    : ip.split(':');
  if (halves.length === 1 && groups.length !== 8) return false;
  if (halves.length === 2 && groups.length > 7) return false;
  return groups.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
}

export function clientIp(req: Request): string {
  return normalizeIp(req.ip || req.socket.remoteAddress || '');
}

const touchStmt = db.prepare(`INSERT INTO user_sessions (user_id, ip, last_seen) VALUES (?, ?, ?)
  ON CONFLICT(user_id, ip) DO UPDATE SET last_seen = excluded.last_seen`);
const bannedStmt = db.prepare(`SELECT 1 AS ok FROM banned_ips WHERE ip = ?`);
const banStmt = db.prepare(`INSERT INTO banned_ips (ip, reason, created_at, created_by) VALUES (@ip, @reason, @created_at, @created_by)
  ON CONFLICT(ip) DO UPDATE SET
    reason = CASE WHEN excluded.reason IS NOT NULL AND excluded.reason != '' THEN excluded.reason ELSE banned_ips.reason END`);
const unbanStmt = db.prepare(`DELETE FROM banned_ips WHERE ip = ?`);
const sessionsStmt = db.prepare(`SELECT user_id, ip, last_seen FROM user_sessions`);
const bansStmt = db.prepare(`SELECT b.ip, b.reason, b.created_at, b.created_by, COUNT(s.user_id) AS visitor_count
  FROM banned_ips b LEFT JOIN user_sessions s ON s.ip = b.ip
  GROUP BY b.ip ORDER BY b.created_at DESC`);
const banOneStmt = db.prepare(`SELECT b.ip, b.reason, b.created_at, b.created_by, COUNT(s.user_id) AS visitor_count
  FROM banned_ips b LEFT JOIN user_sessions s ON s.ip = b.ip
  WHERE b.ip = ? GROUP BY b.ip`);

type SessionRow = { user_id: string; ip: string; last_seen: string };
type BanRow = { ip: string; reason: string | null; created_at: string; created_by: string | null; visitor_count: number };

export function touchUserSession(userId: string, ip: string, at = new Date().toISOString()) {
  if (!userId || !ip) return;
  touchStmt.run(userId, ip, at);
}

export function isBanned(ip: string): boolean {
  if (!ip) return false;
  return !!bannedStmt.get(ip);
}

function toBan(row: BanRow): AdminBan {
  return {
    ip: row.ip,
    reason: row.reason,
    createdAt: row.created_at,
    createdBy: row.created_by,
    visitorCount: Number(row.visitor_count) || 0,
  };
}

/** 重复封禁保持首次禁用时间；带了新原因才覆盖原因 */
export function banIp(ip: string, reason: string | undefined, createdBy = 'admin'): AdminBan {
  banStmt.run({ ip, reason: reason?.trim() ? reason.trim() : null, created_at: new Date().toISOString(), created_by: createdBy });
  return toBan(banOneStmt.get(ip) as BanRow);
}

export function unbanIp(ip: string) {
  unbanStmt.run(ip);
}

export function listBannedIps(): AdminBan[] {
  return (bansStmt.all() as BanRow[]).map(toBan);
}

function latestSessions() {
  const latest = new Map<string, { ip: string; lastSeen: string }>();
  for (const s of sessionsStmt.all() as SessionRow[]) {
    const prev = latest.get(s.user_id);
    if (!prev || s.last_seen > prev.lastSeen) latest.set(s.user_id, { ip: s.ip, lastSeen: s.last_seen });
  }
  return latest;
}

function tripStats() {
  const map = new Map<string, { tripCount: number; messageCount: number; updatedAt: string }>();
  for (const t of allTrips()) {
    const cur = map.get(t.ownerId) ?? { tripCount: 0, messageCount: 0, updatedAt: '' };
    cur.tripCount += 1;
    cur.messageCount += t.messages.length;
    if (t.updatedAt > cur.updatedAt) cur.updatedAt = t.updatedAt;
    map.set(t.ownerId, cur);
  }
  return map;
}

/** 访客列表：行程聚合会话数/消息数，IP 与最近活跃取该访客最后一条 user_sessions */
export function listAdminUsers(): AdminUser[] {
  const sessions = latestSessions();
  const stats = tripStats();
  const banned = new Set(listBannedIps().map(b => b.ip));
  const ids = new Set<string>([...sessions.keys(), ...stats.keys()]);
  const users: AdminUser[] = [...ids].map(userId => {
    const session = sessions.get(userId);
    const agg = stats.get(userId);
    const ip = session?.ip ?? '';
    return {
      userId,
      ip,
      lastSeen: session?.lastSeen ?? (agg?.updatedAt || null),
      tripCount: agg?.tripCount ?? 0,
      messageCount: agg?.messageCount ?? 0,
      banned: ip !== '' && banned.has(ip),
    };
  });
  users.sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '') || a.userId.localeCompare(b.userId));
  return users;
}

function sessionOf(t: Trip): AdminSession {
  const version = t.versions.find(v => v.version === t.activeVersion) ?? null;
  return {
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt,
    messageCount: t.messages.length,
    destination: t.state.destination,
    days: t.state.days,
    pace: t.state.pace,
    companions: t.state.companions,
    preferences: t.state.preferences,
    messages: t.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.text,
      time: m.at ?? t.updatedAt,
    })),
    plan: version ? {
      version: version.version,
      note: version.note,
      complete: version.complete,
      days: version.days.map(d => ({ day: d.day, names: d.names, ...(d.summary ? { summary: d.summary } : {}) })),
    } : null,
  };
}

export function getAdminThread(userId: string): AdminThread | undefined {
  const trips = listTrips(userId);
  const session = latestSessions().get(userId);
  if (!trips.length && !session) return undefined;
  const ip = session?.ip ?? '';
  return {
    userId,
    ip,
    lastSeen: session?.lastSeen ?? trips[0]?.updatedAt ?? null,
    banned: ip !== '' && isBanned(ip),
    sessions: trips.map(sessionOf),
  };
}

/**
 * 业务请求入口：先解析客户端 IP，再查 banned_ips。
 * /admin 留给运营解禁，不在这里拦截。访客身份只认服务端会话，不认客户端传来的 X-User-Id。
 */
export function accessGuard(req: Request, res: Response, next: NextFunction) {
  const ip = clientIp(req);
  res.locals.clientIp = ip;
  if (req.path === '/admin' || req.path.startsWith('/admin/')) return next();
  if (isBanned(ip)) return void res.status(403).json({ error: '该 IP 已被禁用' });
  next();
}

/** 放在 requireSession 之后：用会话里的 owner id 更新 user_sessions。 */
export function rememberVisitor(req: Request, res: Response, next: NextFunction) {
  const id = res.locals.uid;
  const ip = typeof res.locals.clientIp === 'string' && res.locals.clientIp ? res.locals.clientIp : clientIp(req);
  if (typeof id === 'string' && UID_RE.test(id)) touchUserSession(id, ip);
  next();
}

export const USER_ID_RE = UID_RE;
