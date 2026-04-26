import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { SecretsSchema, type Secrets } from '@spectra/shared';

const SECRET_NAMES = {
  aadClientSecret: 'aad-client-secret',
  cookieHmacKey: 'cookie-hmac-key',
  sessionEncryptionKey: 'session-encryption-key',
} as const;

export async function loadSecrets(vaultUri: string): Promise<Secrets> {
  const client = new SecretClient(vaultUri, new DefaultAzureCredential());
  const entries = Object.entries(SECRET_NAMES) as [keyof typeof SECRET_NAMES, string][];
  const fetched = await Promise.all(
    entries.map(async ([field, name]) => {
      const resp = await client.getSecret(name);
      if (!resp.value) throw new Error(`Key Vault secret "${name}" is missing or empty`);
      return [field, resp.value] as const;
    }),
  );
  const raw = Object.fromEntries(fetched);
  const parsed = SecretsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Secrets failed validation: ${parsed.error.message}`);
  }
  return Object.freeze(parsed.data);
}
