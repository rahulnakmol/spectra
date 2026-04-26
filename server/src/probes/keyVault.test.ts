import { describe, it, expect, jest } from '@jest/globals';

const listMock = jest.fn();
jest.unstable_mockModule('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({ listPropertiesOfSecrets: listMock })),
}));
jest.unstable_mockModule('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

const { makeKeyVaultProbe } = await import('./keyVault.js');

describe('keyVaultProbe', () => {
  it('resolves when the SDK can iterate', async () => {
    listMock.mockReturnValue({ async *[Symbol.asyncIterator]() { yield { name: 'x' }; } });
    const probe = makeKeyVaultProbe('https://kv.example.vault.azure.net/');
    await expect(probe()).resolves.toBeUndefined();
  });

  it('rejects when the SDK throws', async () => {
    listMock.mockImplementation(() => {
      throw new Error('no perms');
    });
    const probe = makeKeyVaultProbe('https://kv.example.vault.azure.net/');
    await expect(probe()).rejects.toThrow(/no perms/);
  });
});
