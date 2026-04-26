import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { sessionMiddleware, requireAuth } from './session.js';
import { signSessionCookie, SESSION_COOKIE_NAME } from './cookies.js';
import type { SessionStore } from '../store/sessionStore.js';
import type { SessionClaims } from '@spectra/shared';
import { errorMiddleware } from '../errors/middleware.js';

const HMAC = 'h'.repeat(48);

function makeStore(initial: SessionClaims | null): SessionStore {
  let claims = initial;
  return {
    get: jest.fn(async () => claims),
    put: jest.fn(async (c: SessionClaims) => { claims = c; }),
    delete: jest.fn(async () => { claims = null; }),
  };
}

const baseClaims: SessionClaims = {
  sessionId: 'SIDaaBBccDDeeFfGg', userOid: 'OID', tenantId: 'TID', isAdmin: false,
  teamMemberships: [], issuedAt: Date.now(), absoluteExpiresAt: Date.now() + 86400_000,
  expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(),
};

function makeApp(store: SessionStore) {
  const app = express();
  app.use(sessionMiddleware({ store, hmacKey: HMAC, slidingMin: 480, absoluteMin: 1440 }));
  app.get('/me', requireAuth, (req, res) => res.json({ oid: req.session?.userOid ?? null }));
  app.use(errorMiddleware);
  return app;
}

describe('sessionMiddleware', () => {
  it('attaches req.session for valid signed cookie', async () => {
    const store = makeStore(baseClaims);
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionCookie('SIDaaBBccDDeeFfGg', HMAC)}`;
    const r = await request(makeApp(store)).get('/me').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ oid: 'OID' });
  });

  it('returns 401 with no cookie via requireAuth', async () => {
    const store = makeStore(null);
    const r = await request(makeApp(store)).get('/me');
    expect(r.status).toBe(401);
  });

  it('returns 401 for tampered cookie', async () => {
    const store = makeStore(baseClaims);
    const r = await request(makeApp(store)).get('/me').set('Cookie', `${SESSION_COOKIE_NAME}=garbage`);
    expect(r.status).toBe(401);
  });

  it('expires session past absolute TTL', async () => {
    const expired = { ...baseClaims, issuedAt: Date.now() - 25 * 3600_000, expiresAt: Date.now() - 1 };
    const store = makeStore(expired);
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionCookie('SIDaaBBccDDeeFfGg', HMAC)}`;
    const r = await request(makeApp(store)).get('/me').set('Cookie', cookie);
    expect(r.status).toBe(401);
    expect(store.delete).toHaveBeenCalledWith('SIDaaBBccDDeeFfGg');
  });

  it('slides expiration when last update > 5 min ago', async () => {
    const sliding = { ...baseClaims, lastSlidingUpdate: Date.now() - 6 * 60_000 };
    const store = makeStore(sliding);
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionCookie('SIDaaBBccDDeeFfGg', HMAC)}`;
    await request(makeApp(store)).get('/me').set('Cookie', cookie);
    expect(store.put).toHaveBeenCalled();
  });
});
