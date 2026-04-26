import { loadEnv } from './config/env.js';
import { loadSecrets } from './config/secrets.js';
import { initAppInsights, getAppInsightsClient } from './obs/appInsights.js';
import { audit } from './obs/audit.js';
import { makeKeyVaultProbe } from './probes/keyVault.js';
import { createApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv();
  initAppInsights(env.APPLICATIONINSIGHTS_CONNECTION_STRING);

  // Secrets are required for auth/session routes (later phases). At P1,
  // no such routes are mounted, so a KV failure is logged but not fatal —
  // the server still starts and /health returns 200. /ready will return 503
  // via the KV probe until the vault is reachable.
  // TODO(P2): when auth/session routes are mounted, capture the resolved
  // Secrets object here and gate those routes on secrets != null; this
  // .catch must re-throw (or the route mount must assert secrets loaded).
  await loadSecrets(env.AZURE_KEY_VAULT_URI).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Secrets unavailable at startup (non-fatal at P1):', err instanceof Error ? err.message : String(err));
  });

  const probe = makeKeyVaultProbe(env.AZURE_KEY_VAULT_URI);
  const app = createApp({ readinessProbes: [probe] });

  const server = app.listen(env.PORT, () => {
    audit({
      userOid: 'system',
      action: 'server.startup',
      outcome: 'success',
      detail: { port: env.PORT, nodeEnv: env.NODE_ENV },
    });
    // eslint-disable-next-line no-console
    console.error(`server listening on :${env.PORT}`);
  });

  // app.listen does not throw on EADDRINUSE/EACCES — it emits an 'error' event.
  // Without this handler, the failure crashes unhandled after main() resolves.
  server.on('error', (err) => {
    audit({
      userOid: 'system',
      action: 'server.startup',
      outcome: 'failure',
      detail: { message: err instanceof Error ? err.message : String(err) },
    });
    // eslint-disable-next-line no-console
    console.error('Listen failed:', err);
    process.exit(1);
  });

  // Re-entrancy guard: SIGTERM and SIGINT can both arrive (e.g., dev Ctrl+C
  // immediately after platform sends SIGTERM); calling server.close() twice
  // emits a "Server is not running" error.
  let stopping = false;
  const shutdown = (sig: string): void => {
    if (stopping) return;
    stopping = true;
    audit({
      userOid: 'system',
      action: 'server.shutdown',
      outcome: 'success',
      detail: { signal: sig },
    });
    // Hard deadline: a stuck keep-alive connection would block server.close()
    // indefinitely; the platform SIGKILL grace is finite (~30s on Container Apps).
    const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    const finish = (): void => {
      clearTimeout(force);
      server.close(() => process.exit(0));
    };
    // App Insights buffers telemetry — flush before exit so the shutdown audit
    // event isn't lost. In dev/test (no client), close immediately.
    const client = getAppInsightsClient();
    if (client) {
      client.flush({ callback: finish });
    } else {
      finish();
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    audit({
      userOid: 'system',
      action: 'server.unhandled_rejection',
      outcome: 'failure',
      detail: { message: reason instanceof Error ? reason.message : String(reason) },
    });
    // eslint-disable-next-line no-console
    console.error('Unhandled rejection:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    audit({
      userOid: 'system',
      action: 'server.uncaught_exception',
      outcome: 'failure',
      detail: { message: err.message },
    });
    // eslint-disable-next-line no-console
    console.error('Uncaught exception:', err);
    process.exit(1);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
