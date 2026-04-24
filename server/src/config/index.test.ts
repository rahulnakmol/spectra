import { describe, it, expect, jest } from '@jest/globals';

type LoadSecretsFn = (uri: string) => Promise<{
  aadClientSecret: string;
  cookieHmacKey: string;
  sessionEncryptionKey: string;
}>;
const loadSecretsMock = jest.fn<LoadSecretsFn>();

jest.unstable_mockModule('./secrets.js', () => ({ loadSecrets: loadSecretsMock }));

const { loadAppConfig } = await import('./index.js');

describe('loadAppConfig', () => {
  const envSource = {
    AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    AZURE_CONTAINER_TYPE_ID: '33333333-3333-3333-3333-333333333333',
    AZURE_SYSTEM_CONTAINER_ID: 'b!x',
    AZURE_KEY_VAULT_URI: 'https://kv.example.vault.azure.net/',
    SHAREPOINT_HOSTNAME: 'contoso.sharepoint.com',
    APP_BASE_URL: 'https://app.example.com',
    APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=abc',
  };

  it('composes env + secrets into a single frozen AppConfig', async () => {
    loadSecretsMock.mockResolvedValue({
      aadClientSecret: 'cs',
      cookieHmacKey: 'k'.repeat(40),
      sessionEncryptionKey: 'k'.repeat(40),
    });
    const cfg = await loadAppConfig(envSource);
    expect(cfg.env.AZURE_CLIENT_ID).toBe(envSource.AZURE_CLIENT_ID);
    expect(cfg.secrets.aadClientSecret).toBe('cs');
    expect(Object.isFrozen(cfg)).toBe(true);
  });
});
