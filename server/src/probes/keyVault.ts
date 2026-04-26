import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

export function makeKeyVaultProbe(vaultUri: string): () => Promise<void> {
  const client = new SecretClient(vaultUri, new DefaultAzureCredential());
  return async () => {
    // consume a single element to confirm connectivity + permissions
    await client.listPropertiesOfSecrets()[Symbol.asyncIterator]().next();
  };
}
