import path from 'node:path';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { errorMiddleware } from './errors/middleware.js';
import { NotFoundError } from './errors/domain.js';
import type { MsalClient } from './auth/msal.js';
import type { SessionStore } from './store/sessionStore.js';
import type { ConfigStore } from './store/configStore.js';
import type { SpeGraphClient } from './spe/client.js';
import type { TokenBroker } from './auth/tokenBroker.js';
import { sessionMiddleware } from './auth/session.js';
import { authRouter } from './auth/routes.js';
import { filesRouter } from './routes/files.js';
import { searchRouter } from './routes/search.js';
import { workspacesRouter } from './routes/workspaces.js';
import { uploadRouter } from './upload/route.js';
import { sharingRouter } from './sharing/route.js';
import { adminRouter, type AdminRouterDeps } from './routes/admin.js';
import { agentRouter } from './routes/agent.js';
import { resolveRoleSnapshot } from './authz/resolveRole.js';
import { fetchGroupsTransitive } from './authz/groupsOverage.js';

export interface CreateAppOptions {
  readinessProbes: Array<() => Promise<void>>;
  rateLimitCapacity?: number;
  rateLimitRefillPerSec?: number;
  routesP2?: P2RouteWiring;
  staticDir?: string;
}

export interface P2RouteWiring {
  msal: MsalClient;
  sessionStore: SessionStore;
  configStore: ConfigStore;
  hmacKey: string;
  slidingMin: number;
  absoluteMin: number;
  secureCookie: boolean;
  graphForUser: (req: Request) => SpeGraphClient;
  graphAppOnly: () => SpeGraphClient;
  tokenBroker: TokenBroker;
  adminDeps: Pick<AdminRouterDeps, 'provisionContainer' | 'auditQuery'>;
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

  if (opts.routesP2) {
    const p = opts.routesP2;
    app.use(sessionMiddleware({
      store: p.sessionStore, hmacKey: p.hmacKey,
      slidingMin: p.slidingMin, absoluteMin: p.absoluteMin,
    }));
    app.use(authRouter({
      msal: p.msal, store: p.sessionStore,
      hmacKey: p.hmacKey, slidingMin: p.slidingMin, absoluteMin: p.absoluteMin,
      secureCookie: p.secureCookie,
      resolveRoleSnapshot: (claims, accessToken) =>
        resolveRoleSnapshot(claims, accessToken, {
          store: p.configStore,
          fetchGroupsOverage: fetchGroupsTransitive,
        }),
    }));
    app.use(filesRouter({ store: p.configStore, graphForUser: p.graphForUser }));
    app.use(searchRouter({ store: p.configStore, graphForUser: p.graphForUser }));
    app.use(workspacesRouter({ store: p.configStore }));
    app.use(uploadRouter({ store: p.configStore, graphForUser: p.graphForUser, graphAppOnly: p.graphAppOnly }));
    app.use(sharingRouter({ store: p.configStore, graphForUser: p.graphForUser }));
    app.use(adminRouter({ store: p.configStore, ...p.adminDeps }));
    app.use(agentRouter());
  }

  if (opts.staticDir) {
    const dir = opts.staticDir;
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api)(?!\/health)(?!\/ready).*/u, (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(dir, 'index.html'));
    });
  }

  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorMiddleware);
  return app;
}
