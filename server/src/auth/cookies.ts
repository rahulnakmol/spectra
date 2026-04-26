import { sign, unsign } from 'cookie-signature';

export const SESSION_COOKIE_NAME = 'spectra.sid';

export function signSessionCookie(sessionId: string, hmacKey: string): string {
  return sign(sessionId, hmacKey);
}

export function verifySessionCookie(value: string, hmacKey: string): string | null {
  const out = unsign(value, hmacKey);
  return typeof out === 'string' ? out : null;
}

export interface SessionCookieOptions {
  maxAgeMs: number;
  secure: boolean;
}

export function buildCookieHeader(value: string, opts: SessionCookieOptions): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`,
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookieHeader(secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
