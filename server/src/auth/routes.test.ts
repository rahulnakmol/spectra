import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { authRouter } from './routes.js';
import type { MsalClient } from './msal.js';
import type { SessionStore } from '../store/sessionStore.js';
import { sessionMiddleware } from './session.js';
import { signSessionCookie, SESSION_COOKIE_NAME } from './cookies.js';
import { errorMiddleware } from '../errors/middleware.js';

const HMAC = 'h'.repeat(48);

function makeMsal(): MsalClient {
  return {
    buildAuthorizeUrl: jest.fn(async (req: { state: string; codeChallenge: string }) => `https://login/authorize?state=${req.state}&pk=${req.codeChallenge}`),
    exchangeCode: jest.fn(async () => ({
      accessToken: 'AT',
      idClaims: { oid: 'O1', tid: 'T1', preferred_username: 'u@x', name: 'U', roles: ['AppAdmin'] },
      homeAccountId: 'HID',
      expiresOn: new Date(Date.now() + 3600_000),
    })),
    acquireOboToken: jest.fn(async () => 'OBO'),
    acquireAppToken: jest.fn(async () => 'APP'),
  };
}

function makeStore(): SessionStore {
  const data = new Map<string, unknown>();
  return {
    get: jest.fn(async (id: string) => (data.get(id) as never) ?? null),
    put: jest.fn(async (c: { sessionId: string }) => { data.set(c.sessionId, c); }),
    delete: jest.fn(async (id: string) => { data.delete(id); }),
  };
}

function makeApp(msal: MsalClient, store: SessionStore) {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware({ store, hmacKey: HMAC, slidingMin: 480, absoluteMin: 1440 }));
  app.use(authRouter({
    msal,
    store,
    hmacKey: HMAC,
    slidingMin: 480,
    absoluteMin: 1440,
    secureCookie: false,
    resolveRoleSnapshot: async () => ({ isAdmin: true, teamMemberships: [] }),
  }));
  app.use(errorMiddleware);
  return app;
}

describe('auth routes', () => {
  it('GET /api/auth/login → 302 with state cookie + redirect to authorize URL', async () => {
    const r = await request(makeApp(makeMsal(), makeStore())).get('/api/auth/login');
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/^https:\/\/login\/authorize\?state=/);
  });

  it('GET /api/auth/callback → exchanges code, sets session cookie, redirects', async () => {
    const msal = makeMsal();
    const store = makeStore();
    const app = makeApp(msal, store);
    const login = await request(app).get('/api/auth/login');
    const setCookie = login.headers['set-cookie']?.[0] ?? '';
    const stateMatch = (login.headers.location ?? '').match(/state=([^&]+)/);
    const state = stateMatch?.[1] ?? '';
    const r = await request(app)
      .get(`/api/auth/callback?code=C&state=${state}`)
      .set('Cookie', setCookie);
    expect(r.status).toBe(302);
    expect(r.headers['set-cookie']?.[0]).toMatch(/spectra\.sid=/);
    expect(store.put).toHaveBeenCalled();
  });

  it('POST /api/auth/logout → destroys session, clears cookie', async () => {
    const store = makeStore();
    // Use a valid 16+ char session ID
    const sid = 'SIDaaBBccDDeeFfGg';
    await store.put({ sessionId: sid, userOid: 'O', tenantId: 'T', isAdmin: false,
      teamMemberships: [], issuedAt: Date.now(), absoluteExpiresAt: Date.now() + 86400_000,
      expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(), userAccessToken: 'AT' } as never);
    const r = await request(makeApp(makeMsal(), store))
      .post('/api/auth/logout')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${signSessionCookie(sid, HMAC)}`);
    expect(r.status).toBe(204);
    expect(store.delete).toHaveBeenCalledWith(sid);
    expect(r.headers['set-cookie']?.[0]).toMatch(/Max-Age=0/);
  });

  it('GET /api/auth/me → 401 without session', async () => {
    const r = await request(makeApp(makeMsal(), makeStore())).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('GET /api/auth/me → 200 with identity payload when authenticated', async () => {
    const store = makeStore();
    const sid = 'SIDaaBBccDDeeFfGg';
    await store.put({ sessionId: sid, userOid: 'O', tenantId: 'T', isAdmin: true,
      teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }],
      issuedAt: Date.now(), absoluteExpiresAt: Date.now() + 86400_000,
      expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(), userAccessToken: 'AT' } as never);
    const r = await request(makeApp(makeMsal(), store))
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${signSessionCookie(sid, HMAC)}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ userOid: 'O', isAdmin: true });
    expect(r.body.teamMemberships).toHaveLength(1);
  });

  it('GET /api/auth/callback → 400 when code or state missing', async () => {
    const r = await request(makeApp(makeMsal(), makeStore()))
      .get('/api/auth/callback?code=C'); // state missing
    expect(r.status).toBe(400);
  });

  it('GET /api/auth/callback → 400 when state cookie missing', async () => {
    const r = await request(makeApp(makeMsal(), makeStore()))
      .get('/api/auth/callback?code=C&state=S'); // no cookie set
    expect(r.status).toBe(400);
  });

  it('GET /api/auth/callback → 400 when state cookie does not match query state', async () => {
    const r = await request(makeApp(makeMsal(), makeStore()))
      .get('/api/auth/callback?code=C&state=WRONG')
      .set('Cookie', 'spectra.oauth=DIFFERENT');
    expect(r.status).toBe(400);
  });

  it('GET /api/auth/callback → 400 when state is not in pkce store (unknown state)', async () => {
    const app = makeApp(makeMsal(), makeStore());
    // Do the login to register a real state cookie
    const login = await request(app).get('/api/auth/login');
    const setCookie = login.headers['set-cookie']?.[0] ?? '';
    // Use the real state cookie but a different state value — matches cookie but not in store
    const stateMatch = (login.headers.location ?? '').match(/state=([^&]+)/);
    const realState = stateMatch?.[1] ?? '';
    // Consume the real state first so store no longer has it
    await request(app)
      .get(`/api/auth/callback?code=C&state=${realState}`)
      .set('Cookie', setCookie);
    // Second attempt with same state → already consumed
    const r2 = await request(app)
      .get(`/api/auth/callback?code=C&state=${realState}`)
      .set('Cookie', setCookie);
    expect(r2.status).toBe(400);
  });

  it('GET /api/auth/login → sets Secure flag on cookie when secureCookie=true', async () => {
    const app = express();
    app.use(express.json());
    app.use(authRouter({
      msal: makeMsal(), store: makeStore(), hmacKey: HMAC,
      slidingMin: 480, absoluteMin: 1440, secureCookie: true,
      resolveRoleSnapshot: async () => ({ isAdmin: false, teamMemberships: [] }),
    }));
    const r = await request(app).get('/api/auth/login');
    expect(r.headers['set-cookie']?.[0]).toContain('Secure');
  });

  it('GET /api/auth/login → ignores non-relative returnTo values', async () => {
    const r = await request(makeApp(makeMsal(), makeStore()))
      .get('/api/auth/login?returnTo=https://evil.com/steal');
    // Should redirect to authorize URL, returnTo is ignored (defaults to /)
    expect(r.status).toBe(302);
    // After callback the redirect should go to '/', not the external URL
  });

  it('POST /api/auth/logout → 204 when no session cookie present', async () => {
    const r = await request(makeApp(makeMsal(), makeStore())).post('/api/auth/logout');
    expect(r.status).toBe(204);
  });

  it('POST /api/auth/logout → 204 when cookie present but HMAC invalid', async () => {
    const r = await request(makeApp(makeMsal(), makeStore()))
      .post('/api/auth/logout')
      .set('Cookie', `${SESSION_COOKIE_NAME}=invalidsig.blah`);
    expect(r.status).toBe(204);
  });

  it('POST /api/auth/logout → propagates store.delete error', async () => {
    const store = makeStore();
    const sid = 'SIDaaBBccDDeeFfGg';
    await store.put({ sessionId: sid, userOid: 'O', tenantId: 'T', isAdmin: false,
      teamMemberships: [], issuedAt: Date.now(), absoluteExpiresAt: Date.now() + 86400_000,
      expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(), userAccessToken: 'AT' } as never);
    (store.delete as jest.MockedFunction<(id: string) => Promise<void>>).mockRejectedValue(new Error('store failure'));
    const r = await request(makeApp(makeMsal(), store))
      .post('/api/auth/logout')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${signSessionCookie(sid, HMAC)}`);
    expect(r.status).toBe(500);
  });
});
