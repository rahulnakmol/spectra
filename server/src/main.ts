import express from 'express';
import { loadAppConfig } from './config/index.js';
import { initAppInsights } from './obs/appInsights.js';
import { audit } from './obs/audit.js';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { makeKeyVaultProbe } from './probes/keyVault.js';
import { errorMiddleware } from './errors/middleware.js';
import { NotFoundError } from './errors/domain.js';

async function main(): Promise<void> {
  const cfg = await loadAppConfig();
  initAppInsights(cfg.env.APPLICATIONINSIGHTS_CONNECTION_STRING);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(
    rateLimit({ capacity: 60, refillPerSec: 1, keyFn: (req) => req.ip ?? 'unknown' }),
  );
  app.use(express.json({ limit: '1mb' }));

  const probe = makeKeyVaultProbe(cfg.env.AZURE_KEY_VAULT_URI);
  app.use(healthRouter({ readinessProbes: [probe] }));

  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorMiddleware);

  const server = app.listen(cfg.env.PORT, () => {
    audit({
      userOid: 'system',
      action: 'server.startup',
      outcome: 'success',
      detail: { port: cfg.env.PORT, nodeEnv: cfg.env.NODE_ENV },
    });
    // eslint-disable-next-line no-console
    console.error(`server listening on :${cfg.env.PORT}`);
  });

  const shutdown = (sig: string): void => {
    audit({ userOid: 'system', action: 'server.shutdown', outcome: 'success', detail: { signal: sig } });
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
