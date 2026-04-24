import { loadEnv } from './env.js';
import { loadSecrets } from './secrets.js';
import type { Env, Secrets } from '@adminui/shared';

export interface AppConfig {
  env: Env;
  secrets: Secrets;
}

export async function loadAppConfig(
  envSource: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): Promise<AppConfig> {
  const env = loadEnv(envSource);
  const secrets = await loadSecrets(env.AZURE_KEY_VAULT_URI);
  return Object.freeze({ env, secrets });
}
