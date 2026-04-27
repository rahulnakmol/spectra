import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import request from 'supertest';
import { createApp } from '../app.js';
import type { MsalClient } from '../auth/msal.js';
import { createSessionStore } from '../store/sessionStore.js';
import { createConfigStore } from '../store/configStore.js';
import { createTokenBroker } from '../auth/tokenBroker.js';
import { createGraphClient } from '../spe/client.js';

const HMAC = 'h'.repeat(48);
const ENC = Buffer.alloc(32, 7).toString('base64');

let originalFetch: typeof globalThis.fetch;

describe('auth flow integration', () => {
  beforeAll(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('login → callback → me → logout', async () => {
    const memory = new Map<string, string>();
    const reader = jest.fn(async (p: string) => {
      const v = memory.get(p);
      if (!v) {
        const e = new Error('nf') as Error & { code: string };
        e.code = 'not_found';
        throw e;
      }
      return v;
    });
    const writer = jest.fn(async (p: string, b: string) => { memory.set(p, b); });
    const deleter = jest.fn(async (p: string) => { memory.delete(p); });

    const sessionStore = createSessionStore({ reader, writer, deleter, encryptionKey: ENC });
    const configStore = createConfigStore({ reader, writer });

    const msal: MsalClient = {
      buildAuthorizeUrl: jest.fn(async ({ state }: { state: string }) =>
        `https://login.microsoftonline.com/auth?state=${state}`) as never,
      exchangeCode: jest.fn(async () => ({
        accessToken: 'AT',
        idClaims: {
          oid: '00000000-0000-0000-0000-000000000099',
          tid: 'T',
          preferred_username: 'u@x.com',
          name: 'Test User',
        },
        homeAccountId: 'HID',
        expiresOn: new Date(Date.now() + 3600_000),
      })) as never,
      acquireOboToken: jest.fn(async () => 'OBO') as never,
      acquireAppToken: jest.fn(async () => 'APP') as never,
    };

    const graph = createGraphClient(async () => 'TOK');

    const app = createApp({
      readinessProbes: [],
      routesP2: {
        msal,
        sessionStore,
        configStore,
        hmacKey: HMAC,
        slidingMin: 480,
        absoluteMin: 1440,
        secureCookie: false,
        graphForUser: () => graph,
        graphAppOnly: () => graph,
        tokenBroker: createTokenBroker(msal),
        adminDeps: {
          provisionContainer: jest.fn(async () => 'C') as never,
          auditQuery: jest.fn(async () => ({ events: [] })) as never,
        },
      },
    });

    // Step 1: login redirects to MSAL
    const loginRes = await request(app).get('/api/auth/login');
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toMatch(/login\.microsoftonline\.com/);

    // State cookie set
    const cookies: string[] = Array.isArray(loginRes.headers['set-cookie'])
      ? (loginRes.headers['set-cookie'] as string[])
      : [loginRes.headers['set-cookie'] as string].filter(Boolean);
    const stateCookie = cookies.find((c: string) => c.includes('spectra.oauth'));
    expect(stateCookie).toBeDefined();

    const state = new URL(loginRes.headers['location'] as string).searchParams.get('state')!;
    expect(state).toBeTruthy();

    // Step 2: callback exchanges code, creates session
    const cbRes = await request(app)
      .get(`/api/auth/callback?code=AUTHCODE&state=${state}`)
      .set('Cookie', stateCookie!.split(';')[0]!);
    expect(cbRes.status).toBe(302);

    const cbCookies: string[] = Array.isArray(cbRes.headers['set-cookie'])
      ? (cbRes.headers['set-cookie'] as string[])
      : [cbRes.headers['set-cookie'] as string].filter(Boolean);
    const sessionCookie = cbCookies.find((c: string) => c.includes('spectra.sid='));
    expect(sessionCookie).toBeDefined();
    expect(writer).toHaveBeenCalled();

    // Step 3: /me with session cookie
    const sessionCookieHeader = sessionCookie!.split(';')[0]!;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookieHeader);
    expect(meRes.status).toBe(200);
    expect(meRes.body.userOid).toBe('00000000-0000-0000-0000-000000000099');
    expect(meRes.body.userAccessToken).toBeUndefined(); // never exposed

    // Step 4: logout deletes session
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', sessionCookieHeader);
    expect(logoutRes.status).toBe(204);
    expect(deleter).toHaveBeenCalled();
  });
});
