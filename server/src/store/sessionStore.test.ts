import { describe, it, expect, jest } from '@jest/globals';
import type { SessionClaims } from '@spectra/shared';
import { createSessionStore } from './sessionStore.js';
import { encryptJson } from './crypto.js';

const KEY = Buffer.alloc(32, 1).toString('base64');

function makeBackends(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  const reader = jest.fn(async (path: string) => {
    const v = data.get(path);
    if (v === undefined) {
      const e = new Error('not_found') as Error & { code: string };
      e.code = 'not_found';
      throw e;
    }
    return v;
  });
  const writer = jest.fn(async (path: string, body: string) => { data.set(path, body); });
  const deleter = jest.fn(async (path: string) => { data.delete(path); });
  return { reader, writer, deleter, data };
}

const claims: SessionClaims = {
  sessionId: 'S1aBcDeFgHiJkLmN', userOid: 'U1', tenantId: 'T1', isAdmin: false,
  teamMemberships: [], issuedAt: 1, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 1,
};

describe('SessionStore', () => {
  it('put encrypts and writes; get decrypts', async () => {
    const { reader, writer } = makeBackends();
    const store = createSessionStore({ reader, writer, deleter: jest.fn(async () => {}), encryptionKey: KEY });
    await store.put(claims);
    expect(writer).toHaveBeenCalledTimes(1);
    const got = await store.get('S1aBcDeFgHiJkLmN');
    expect(got?.userOid).toBe('U1');
  });

  it('caches reads within 60s', async () => {
    const { reader, writer, deleter, data } = makeBackends();
    data.set('/sessions/S1aBcDeFgHiJkLmN.json', encryptJson(claims, KEY));
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    await store.get('S1aBcDeFgHiJkLmN');
    await store.get('S1aBcDeFgHiJkLmN');
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('get returns null for missing session', async () => {
    const { reader, writer, deleter } = makeBackends();
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    expect(await store.get('MissingSession-xyz-abc')).toBeNull();
  });

  it('delete removes from backend and cache', async () => {
    const { reader, writer, deleter, data } = makeBackends();
    data.set('/sessions/S1aBcDeFgHiJkLmN.json', encryptJson(claims, KEY));
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    await store.get('S1aBcDeFgHiJkLmN');
    await store.delete('S1aBcDeFgHiJkLmN');
    expect(deleter).toHaveBeenCalledWith('/sessions/S1aBcDeFgHiJkLmN.json');
    expect(await store.get('S1aBcDeFgHiJkLmN')).toBeNull();
  });

  it('rejects sessionId with path traversal', async () => {
    const { reader, writer, deleter } = makeBackends();
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    await expect(store.get('../etc/passwdXXXXXXXXXXXXX')).rejects.toThrow();
    await expect(store.delete('a/bXXXXXXXXXXXXXXXXXXXX')).rejects.toThrow();
  });
});
