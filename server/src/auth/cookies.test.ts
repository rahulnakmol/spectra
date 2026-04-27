import { describe, it, expect } from '@jest/globals';
import { signSessionCookie, verifySessionCookie, SESSION_COOKIE_NAME } from './cookies.js';

const HMAC = 'a'.repeat(48);

describe('session cookies', () => {
  it('signs and verifies a session id', () => {
    const signed = signSessionCookie('S1aBcDeFgHiJkLmN', HMAC);
    expect(verifySessionCookie(signed, HMAC)).toBe('S1aBcDeFgHiJkLmN');
  });

  it('rejects tampered cookies', () => {
    const signed = signSessionCookie('S1aBcDeFgHiJkLmN', HMAC);
    const tampered = signed.slice(0, -3) + 'xxx';
    expect(verifySessionCookie(tampered, HMAC)).toBeNull();
  });

  it('rejects wrong key', () => {
    const signed = signSessionCookie('S1aBcDeFgHiJkLmN', HMAC);
    expect(verifySessionCookie(signed, 'b'.repeat(48))).toBeNull();
  });

  it('exports the canonical cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('spectra.sid');
  });
});
