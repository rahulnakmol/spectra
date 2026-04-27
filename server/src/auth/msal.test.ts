import { describe, it, expect, jest } from '@jest/globals';
import { createMsalClient, type MsalDeps } from './msal.js';

function makeFakeMsal(): MsalDeps {
  const cca = {
    getAuthCodeUrl: jest.fn(async (req: { state: string; codeChallenge: string }) =>
      `https://login.example/authorize?state=${req.state}&code_challenge=${req.codeChallenge}`),
    acquireTokenByCode: jest.fn(async () => ({
      accessToken: 'AT', idTokenClaims: { oid: 'OID', tid: 'TID', preferred_username: 'u@x', name: 'U', roles: ['AppAdmin'], groups: ['G1'] },
      account: { homeAccountId: 'HID' }, expiresOn: new Date(Date.now() + 3600_000),
    })),
    acquireTokenOnBehalfOf: jest.fn(async () => ({ accessToken: 'OBO-AT', expiresOn: new Date(Date.now() + 3600_000) })),
    acquireTokenByClientCredential: jest.fn(async () => ({ accessToken: 'APP-AT', expiresOn: new Date(Date.now() + 3600_000) })),
  };
  return { ConfidentialClientApplication: jest.fn(() => cca) as unknown as MsalDeps['ConfidentialClientApplication'] };
}

describe('createMsalClient', () => {
  const baseConfig = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    clientId: '00000000-0000-0000-0000-000000000002',
    clientSecret: 'secret',
    redirectUri: 'https://app/api/auth/callback',
  };

  it('builds an authorize URL with state and PKCE challenge', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const url = await m.buildAuthorizeUrl({ state: 'abc', codeChallenge: 'CHAL' });
    expect(url).toContain('state=abc');
    expect(url).toContain('code_challenge=CHAL');
  });

  it('exchanges code for tokens + claims', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const out = await m.exchangeCode({ code: 'C', codeVerifier: 'V' });
    expect(out.idClaims.oid).toBe('OID');
    expect(out.idClaims.roles).toContain('AppAdmin');
    expect(out.accessToken).toBe('AT');
  });

  it('acquires OBO tokens', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const tok = await m.acquireOboToken('AT', ['Files.ReadWrite.All']);
    expect(tok).toBe('OBO-AT');
  });

  it('acquires app-only tokens', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const tok = await m.acquireAppToken(['https://graph.microsoft.com/.default']);
    expect(tok).toBe('APP-AT');
  });
});
