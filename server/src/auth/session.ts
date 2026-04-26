import type { Request, RequestHandler, Response, NextFunction } from 'express';
import type { SessionClaims } from '@spectra/shared';
import { UnauthenticatedError } from '../errors/domain.js';
import { SESSION_COOKIE_NAME, verifySessionCookie } from './cookies.js';
import type { SessionStore } from '../store/sessionStore.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionClaims;
  }
}

export interface SessionMiddlewareOpts {
  store: SessionStore;
  hmacKey: string;
  slidingMin: number;
  absoluteMin: number;
  minSlideIntervalMin?: number;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';').map((s) => s.trim());
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

export function sessionMiddleware(opts: SessionMiddlewareOpts): RequestHandler {
  const slideIntervalMs = (opts.minSlideIntervalMin ?? 5) * 60_000;
  const slidingMs = opts.slidingMin * 60_000;

  return async (req: Request, _res: Response, next: NextFunction) => {
    const raw = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (!raw) return next();
    const sessionId = verifySessionCookie(raw, opts.hmacKey);
    if (!sessionId) return next();
    let claims: SessionClaims | null;
    try {
      claims = await opts.store.get(sessionId);
    } catch (err) {
      return next(err);
    }
    if (!claims) return next();
    const now = Date.now();
    if (claims.expiresAt <= now || claims.absoluteExpiresAt <= now) {
      try { await opts.store.delete(sessionId); } catch { /* best-effort cleanup */ }
      return next();
    }
    if (now - claims.lastSlidingUpdate >= slideIntervalMs) {
      const newExpires = Math.min(claims.absoluteExpiresAt, now + slidingMs);
      const updated: SessionClaims = { ...claims, expiresAt: newExpires, lastSlidingUpdate: now };
      try { await opts.store.put(updated); } catch (err) { return next(err); }
      claims = updated;
    }
    req.session = claims;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session) return next(new UnauthenticatedError());
  next();
};
