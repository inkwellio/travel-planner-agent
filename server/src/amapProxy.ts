import type { Express, Request, Response } from 'express';

/**
 * 高德 JS API 安全密钥代理（官方推荐的 serviceHost 方式）：
 * 前端只配置 serviceHost = <origin>/_AMapService，安全密钥 AMAP_SECURITY_CODE 只在后端拼接为 jscode。
 */
export function mountAmapProxy(app: Express) {
  app.use('/_AMapService', async (req: Request, res: Response) => {
    const code = process.env.AMAP_SECURITY_CODE;
    if (!code) return void res.status(503).json({ error: 'AMAP_SECURITY_CODE 未配置' });
    const path = req.path; // 例如 /v4/map/styles
    const host = path.startsWith('/v4/map/styles') ? 'https://webapi.amap.com'
      : path.startsWith('/v3/vectormap') ? 'https://fmap01.amap.com' : 'https://restapi.amap.com';
    const qs = new URLSearchParams(req.query as Record<string, string>);
    qs.set('jscode', code);
    try {
      const upstream = await fetch(`${host}${path}?${qs}`, { signal: AbortSignal.timeout(10000) });
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type'); if (ct) res.setHeader('Content-Type', ct);
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) { res.status(502).json({ error: (e as Error).message }); }
  });
}
