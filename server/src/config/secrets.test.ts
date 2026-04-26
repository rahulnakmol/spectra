import { describe, it, expect, jest, beforeEach } from '@jest/globals';

type GetSecretResult = { value?: string | undefined };
const getSecretMock = jest.fn<(name: string) => Promise<GetSecretResult>>();

jest.unstable_mockModule('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({ getSecret: getSecretMock })),
}));
jest.unstable_mockModule('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

const { loadSecrets } = await import('./secrets.js');

describe('loadSecrets', () => {
  beforeEach(() => { getSecretMock.mockReset(); });

  it('fetches and assembles the three secrets', async () => {
    getSecretMock
      .mockResolvedValueOnce({ value: 'client-secret-value' })
      .mockResolvedValueOnce({ value: 'a'.repeat(40) })
      .mockResolvedValueOnce({ value: 'b'.repeat(40) });

    const s = await loadSecrets('https://kv.example.vault.azure.net/');
    expect(s.aadClientSecret).toBe('client-secret-value');
    expect(s.cookieHmacKey).toHaveLength(40);
    expect(s.sessionEncryptionKey).toHaveLength(40);
  });

  it('throws a clear error when a secret is missing', async () => {
    getSecretMock.mockResolvedValue({ value: undefined });
    await expect(loadSecrets('https://kv.example.vault.azure.net/')).rejects.toThrow(
      /aad-client-secret/,
    );
  });
});
