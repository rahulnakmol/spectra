import { Router, type RequestHandler } from 'express';
import type { TeamMembership } from '@spectra/shared';
import { BadRequestError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { SESSION_COOKIE_NAME, buildClearCookieHeader, buildCookieHeader, signSessionCookie, verifySessionCookie } from './cookies.js';
import { generatePkce, generateSessionId, generateState, createPkceStateStore } from './pkce.js';
import type { MsalClient, IdTokenClaims } from './msal.js';
import type { SessionStore } from '../store/sessionStore.js';
import { requireAuth } from './session.js';

export interface AuthRouterDeps {
  msal: MsalClient;
  store: SessionStore;
  hmacKey: string;
  slidingMin: number;
  absoluteMin: number;
  secureCookie: boolean;
  resolveRoleSnapshot: (claims: IdTokenClaims, accessToken: string) => Promise<{ isAdmin: boolean; teamMemberships: TeamMembership[] }>;
}

const STATE_COOKIE = 'spectra.oauth';

export function authRouter(deps: AuthRouterDeps): Router {
  const r = Router();
  const pkceStore = createPkceStateStore({ ttlMs: 10 * 60_000 });
  const slidingMs = deps.slidingMin * 60_000;
  const absoluteMs = deps.absoluteMin * 60_000;

  r.get('/api/auth/login', async (req, res, next) => {
    try {
      const { verifier, challenge } = generatePkce();
      const state = generateState();
      const returnTo = typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/') ? req.query.returnTo : '/';
      pkceStore.put(state, { verifier, returnTo });
      const url = await deps.msal.buildAuthorizeUrl({ state, codeChallenge: challenge });
      res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${deps.secureCookie ? '; Secure' : ''}`);
      audit({ userOid: 'anonymous', action: 'auth.login.start', outcome: 'success' });
      res.redirect(302, url);
    } catch (err) { next(err); }
  });

  r.get('/api/auth/callback', async (req, res, next) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!code || !state) throw new BadRequestError('Missing code or state');
      const cookieState = findCookie(req.headers.cookie, STATE_COOKIE);
      if (!cookieState || cookieState !== state) throw new BadRequestError('State mismatch');
      const stored = pkceStore.consume(state);
      if (!stored) throw new BadRequestError('Unknown state');
      const tokens = await deps.msal.exchangeCode({ code, codeVerifier: stored.verifier });
      const role = await deps.resolveRoleSnapshot(tokens.idClaims, tokens.accessToken);
      const sessionId = generateSessionId();
      const now = Date.now();
      await deps.store.put({
        sessionId,
        userOid: tokens.idClaims.oid,
        tenantId: tokens.idClaims.tid,
        isAdmin: role.isAdmin,
        teamMemberships: role.teamMemberships,
        issuedAt: now,
        absoluteExpiresAt: now + absoluteMs,
        expiresAt: now + slidingMs,
        lastSlidingUpdate: now,
      });
      const signed = signSessionCookie(sessionId, deps.hmacKey);
      res.setHeader('Set-Cookie', [
        buildCookieHeader(signed, { maxAgeMs: slidingMs, secure: deps.secureCookie }),
        `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${deps.secureCookie ? '; Secure' : ''}`,
      ]);
      audit({ userOid: tokens.idClaims.oid, action: 'auth.login.success', outcome: 'success' });
      res.redirect(302, stored.returnTo);
    } catch (err) {
      audit({ userOid: 'anonymous', action: 'auth.login.failure', outcome: 'failure', detail: { message: err instanceof Error ? err.message : 'unknown' } });
      next(err);
    }
  });

  const logout: RequestHandler = async (req, res, next) => {
    try {
      const raw = findCookie(req.headers.cookie, SESSION_COOKIE_NAME);
      if (raw) {
        const sid = verifySessionCookie(raw, deps.hmacKey);
        if (sid) {
          try { await deps.store.delete(sid); } catch (err) { return next(err); }
          audit({ userOid: req.session?.userOid ?? 'anonymous', action: 'auth.logout', outcome: 'success' });
        }
      }
      res.setHeader('Set-Cookie', buildClearCookieHeader(deps.secureCookie));
      res.status(204).end();
    } catch (err) { next(err); }
  };
  r.post('/api/auth/logout', logout);

  r.get('/api/auth/me', requireAuth, (req, res) => {
    if (!req.session) throw new UnauthenticatedError();
    res.json({
      userOid: req.session.userOid,
      tenantId: req.session.tenantId,
      isAdmin: req.session.isAdmin,
      teamMemberships: req.session.teamMemberships,
      expiresAt: req.session.expiresAt,
    });
  });

  return r;
}

function findCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';').map((s) => s.trim())) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}
