import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

db.exec('CREATE TABLE IF NOT EXISTS anonymous_sessions (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created_at TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO anonymous_sessions (token_hash, owner_id, created_at) VALUES (?, ?, ?)');
const lookup = db.prepare('SELECT owner_id FROM anonymous_sessions WHERE token_hash = ?');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(): string {
  const token = randomBytes(32).toString('base64url');
  insert.run(hash(token), randomUUID(), new Date().toISOString());
  return token;
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.header('authorization') ?? '');
  const row = match ? lookup.get(hash(match[1])) as { owner_id: string } | undefined : undefined;
  if (!row) return void res.status(401).json({ error: '匿名会话无效，请重新打开应用' });
  res.locals.uid = row.owner_id;
  next();
}
