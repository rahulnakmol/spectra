import { describe, it, expect } from '@jest/globals';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  const valid = {
    AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    AZURE_CONTAINER_TYPE_ID: '33333333-3333-3333-3333-333333333333',
    AZURE_SYSTEM_CONTAINER_ID: 'b!xyz',
    AZURE_KEY_VAULT_URI: 'https://kv.example.vault.azure.net/',
    SHAREPOINT_HOSTNAME: 'contoso.sharepoint.com',
    APP_BASE_URL: 'https://app.example.com',
    APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=abc',
  };

  it('returns a frozen, typed env on valid input', () => {
    const env = loadEnv(valid);
    expect(env.AZURE_TENANT_ID).toBe(valid.AZURE_TENANT_ID);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('throws with a clear message listing missing keys', () => {
    const { AZURE_TENANT_ID: _, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/AZURE_TENANT_ID/);
  });

  it('coerces numeric env vars', () => {
    const env = loadEnv({ ...valid, SESSION_TTL_SLIDING_MIN: '240' });
    expect(env.SESSION_TTL_SLIDING_MIN).toBe(240);
  });
});
