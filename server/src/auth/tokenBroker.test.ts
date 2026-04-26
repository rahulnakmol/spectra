import { describe, it, expect, jest } from '@jest/globals';
import { createTokenBroker } from './tokenBroker.js';
import type { MsalClient } from './msal.js';

function fakeMsal(): MsalClient {
  return {
    buildAuthorizeUrl: jest.fn(),
    exchangeCode: jest.fn(),
    acquireOboToken: jest.fn(async (_at: string, scopes: string[]) => `OBO:${scopes.join(',')}`),
    acquireAppToken: jest.fn(async (scopes: string[]) => `APP:${scopes.join(',')}`),
  } as unknown as MsalClient;
}

describe('tokenBroker', () => {
  it('caches OBO tokens per (sessionId, scopes) key', async () => {
    const msal = fakeMsal();
    const broker = createTokenBroker(msal);
    const t1 = await broker.obo({ sessionId: 'S1', userAccessToken: 'AT' }, ['Files.ReadWrite.All']);
    const t2 = await broker.obo({ sessionId: 'S1', userAccessToken: 'AT' }, ['Files.ReadWrite.All']);
    expect(t1).toBe(t2);
    expect(msal.acquireOboToken).toHaveBeenCalledTimes(1);
  });

  it('caches app-only tokens per scope set', async () => {
    const msal = fakeMsal();
    const broker = createTokenBroker(msal);
    await broker.app(['https://graph.microsoft.com/.default']);
    await broker.app(['https://graph.microsoft.com/.default']);
    expect(msal.acquireAppToken).toHaveBeenCalledTimes(1);
  });
});
