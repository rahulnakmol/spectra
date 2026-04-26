import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

export function makeKeyVaultProbe(vaultUri: string): () => Promise<void> {
  const client = new SecretClient(vaultUri, new DefaultAzureCredential());
  return async () => {
    const iter = client.listPropertiesOfSecrets();
    // consume a single element to confirm connectivity + permissions
    for await (const _ of iter) break;
  };
}
