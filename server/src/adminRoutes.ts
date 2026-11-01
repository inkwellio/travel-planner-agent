import { Router, type Express } from 'express';
import { ADMIN_PHONE_RE, adminAuthorized, adminLoginLimiter, createAdminSession, revokeAdminSession } from './adminAuth.js';
import { banIp, getAdminThread, isIp, listAdminUsers, listBannedIps, normalizeIp, unbanIp, USER_ID_RE } from './adminStore.js';

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** 手机号 + 密码签发管理会话，其余接口均校验该会话。 */
export function mountAdmin(app: Express) {
  const r = Router();
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  r.post('/login', adminLoginLimiter, (req, res) => {
    const body = req.body as { phone?: unknown; password?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || typeof body.phone !== 'string' || !ADMIN_PHONE_RE.test(body.phone.trim())
      || typeof body.password !== 'string' || !body.password || body.password.length > 256) {
      return void res.status(400).json({ error: '请填写有效的手机号和密码' });
    }
    const token = createAdminSession(body.phone.trim(), body.password);
    if (!token) return void res.status(401).json({ error: '手机号或密码不正确' });
    res.json({ token });
  });
  r.use((req, res, next) => {
    if (!adminAuthorized(req.header('authorization'))) return void res.status(401).json({ error: '登录已失效，请重新登录' });
    next();
  });
  r.post('/logout', (req, res) => {
    revokeAdminSession(req.header('authorization'));
    res.json({ ok: true });
  });

  r.get('/users', (_req, res) => { res.json(listAdminUsers()); });

  r.get('/users/:userId/messages', (req, res) => {
    const userId = one(req.params.userId);
    if (!USER_ID_RE.test(userId)) return void res.status(400).json({ error: '访客 ID 无效' });
    const thread = getAdminThread(userId);
    if (!thread) return void res.status(404).json({ error: '访客不存在' });
    res.json(thread);
  });

  r.get('/ips', (_req, res) => { res.json(listBannedIps()); });

  r.post('/ips/ban', (req, res) => {
    const body = req.body as { ip?: unknown; reason?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return void res.status(400).json({ error: '请求无效' });
    if (body.reason != null && typeof body.reason !== 'string') return void res.status(400).json({ error: '原因格式无效' });
    const ip = normalizeIp(typeof body.ip === 'string' ? body.ip : '');
    if (!isIp(ip)) return void res.status(400).json({ error: 'IP 地址无效' });
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : undefined;
    res.json(banIp(ip, reason));
  });

  r.delete('/ips/ban/:ip', (req, res) => {
    const ip = normalizeIp(one(req.params.ip));
    if (!isIp(ip)) return void res.status(400).json({ error: 'IP 地址无效' });
    unbanIp(ip);
    res.json({ ok: true });
  });

  app.use('/admin', r);
}
