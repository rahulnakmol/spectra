import { Router, type Router as ExpressRouter } from 'express';

export interface HealthRouterOptions {
  readinessProbes: Array<() => Promise<void>>;
}

export function healthRouter(opts: HealthRouterOptions): ExpressRouter {
  const router = Router();
  router.get('/health', (_req, res) => res.status(200).json({ status: 'up' }));
  router.get('/ready', async (_req, res) => {
    try {
      await Promise.all(opts.readinessProbes.map((p) => p()));
      res.status(200).json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ error: 'not_ready', message: (err as Error).message });
    }
  });
  return router;
}
