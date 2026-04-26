import express, { type Express } from 'express';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { errorMiddleware } from './errors/middleware.js';
import { NotFoundError } from './errors/domain.js';

export interface CreateAppOptions {
  readinessProbes: Array<() => Promise<void>>;
  rateLimitCapacity?: number;
  rateLimitRefillPerSec?: number;
}

export function createApp(opts: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(
    rateLimit({
      capacity: opts.rateLimitCapacity ?? 60,
      refillPerSec: opts.rateLimitRefillPerSec ?? 1,
      keyFn: (req) => req.ip ?? 'unknown',
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter({ readinessProbes: opts.readinessProbes }));
  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorMiddleware);
  return app;
}
