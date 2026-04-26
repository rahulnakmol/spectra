import { loadAppConfig } from './config/index.js';
import { initAppInsights, getAppInsightsClient } from './obs/appInsights.js';
import { audit } from './obs/audit.js';
import { makeKeyVaultProbe } from './probes/keyVault.js';
import { createApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const cfg = await loadAppConfig();
  initAppInsights(cfg.env.APPLICATIONINSIGHTS_CONNECTION_STRING);

  const probe = makeKeyVaultProbe(cfg.env.AZURE_KEY_VAULT_URI);
  const app = createApp({ readinessProbes: [probe] });

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
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
