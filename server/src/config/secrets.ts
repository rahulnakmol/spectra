import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { SecretsSchema, type Secrets } from '@adminui/shared';

const SECRET_NAMES = {
  aadClientSecret: 'aad-client-secret',
  cookieHmacKey: 'cookie-hmac-key',
  sessionEncryptionKey: 'session-encryption-key',
} as const;

export async function loadSecrets(vaultUri: string): Promise<Secrets> {
  const client = new SecretClient(vaultUri, new DefaultAzureCredential());
  const fetched: Record<string, string> = {};
  for (const [field, name] of Object.entries(SECRET_NAMES)) {
    const resp = await client.getSecret(name);
    if (!resp.value) throw new Error(`Key Vault secret "${name}" is missing or empty`);
    fetched[field] = resp.value;
  }
  const parsed = SecretsSchema.safeParse(fetched);
  if (!parsed.success) {
    throw new Error(`Secrets failed validation: ${parsed.error.message}`);
  }
  return Object.freeze(parsed.data);
}
