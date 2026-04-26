import { Router, type Router as ExpressRouter } from 'express';
import { audit } from '../obs/audit.js';

export interface HealthRouterOptions {
  // Probes must be self-bounded (own timeout). On first rejection, sibling
  // probes are not cancelled — they run to completion in the background.
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
      audit({
        userOid: 'system',
        action: 'readiness.probe.failed',
        outcome: 'failure',
        detail: { message: err instanceof Error ? err.message : String(err) },
      });
      res.status(503).json({ error: 'not_ready' });
    }
  });
  return router;
}
