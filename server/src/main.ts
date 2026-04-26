import { loadEnv } from './config/env.js';
import { loadSecrets } from './config/secrets.js';
import { initAppInsights, getAppInsightsClient } from './obs/appInsights.js';
import { audit } from './obs/audit.js';
import { makeKeyVaultProbe } from './probes/keyVault.js';
import { makeGraphProbe } from './probes/graph.js';
import { createApp } from './app.js';
import { createConfigStore, createSessionStore, createSpeReader, createSpeWriter, createSpeDeleter, startConfigPoller } from './store/index.js';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createMsalClient } from './auth/msal.js';
import { createTokenBroker } from './auth/tokenBroker.js';
import { createGraphClient } from './spe/client.js';
import { createContainerProvisioner } from './admin/provision.js';
import { createAuditQuery } from './obs/auditQuery.js';
import type { AdminRouterDeps } from './routes/admin.js';
import type { Request } from 'express';
import type { SpeGraphClient } from './spe/index.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv();
  initAppInsights(env.APPLICATIONINSIGHTS_CONNECTION_STRING);

  // Secrets are required for auth/session routes (P2+).
  const secrets = await loadSecrets(env.AZURE_KEY_VAULT_URI);

  const msal = createMsalClient(
    {
      tenantId: env.AZURE_TENANT_ID,
      clientId: env.AZURE_CLIENT_ID,
      clientSecret: secrets.aadClientSecret,
      redirectUri: `${env.APP_BASE_URL}/api/auth/callback`,
    },
    { ConfidentialClientApplication },
  );
  const tokenBroker = createTokenBroker(msal);

  const appGraph = createGraphClient(() =>
    tokenBroker.app(['https://graph.microsoft.com/.default']),
  );

  const configReader = createSpeReader(appGraph, env.AZURE_SYSTEM_CONTAINER_ID);
  const configWriter = createSpeWriter(appGraph, env.AZURE_SYSTEM_CONTAINER_ID);
  const configStore = createConfigStore({ reader: configReader, writer: configWriter });
  startConfigPoller(configStore);

  const sessionStore = createSessionStore({
    reader: createSpeReader(appGraph, env.AZURE_SYSTEM_CONTAINER_ID),
    writer: createSpeWriter(appGraph, env.AZURE_SYSTEM_CONTAINER_ID),
    deleter: createSpeDeleter(appGraph, env.AZURE_SYSTEM_CONTAINER_ID),
    encryptionKey: secrets.sessionEncryptionKey,
  });

  const graphForUser = (req: Request): SpeGraphClient => {
    const session = req.session;
    if (!session) return appGraph;
    return createGraphClient(async () =>
      tokenBroker.obo(
        { sessionId: session.sessionId, userAccessToken: session.userAccessToken },
        ['https://graph.microsoft.com/.default'],
      ),
    );
  };
  const graphAppOnly = (): SpeGraphClient => appGraph;

  const routesP2 = {
    msal,
    sessionStore,
    configStore,
    hmacKey: secrets.cookieHmacKey,
    slidingMin: env.SESSION_TTL_SLIDING_MIN,
    absoluteMin: env.SESSION_TTL_ABSOLUTE_MIN,
    secureCookie: env.NODE_ENV === 'production',
    graphForUser,
    graphAppOnly,
    tokenBroker,
    adminDeps: {
      provisionContainer: createContainerProvisioner(appGraph, env.AZURE_CONTAINER_TYPE_ID),
      // Cast resolves exactOptionalPropertyTypes mismatch between Zod-inferred
      // params (no `| undefined`) and createAuditQuery's declared signature.
      auditQuery: createAuditQuery({ logsClient: null }) as AdminRouterDeps['auditQuery'],
    },
  };

  const kvProbe = makeKeyVaultProbe(env.AZURE_KEY_VAULT_URI);
  const graphProbe = makeGraphProbe();
  const app = createApp({ readinessProbes: [kvProbe, graphProbe], routesP2 });

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
