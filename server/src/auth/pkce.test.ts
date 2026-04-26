import { describe, it, expect } from '@jest/globals';
import { generatePkce, createPkceStateStore } from './pkce.js';

describe('PKCE', () => {
  it('generatePkce produces verifier ≥ 43 chars and a base64url challenge', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('state store roundtrips and consumes once', () => {
    const store = createPkceStateStore({ ttlMs: 60_000 });
    store.put('STATE', { verifier: 'V', returnTo: '/w' });
    expect(store.consume('STATE')).toEqual({ verifier: 'V', returnTo: '/w' });
    expect(store.consume('STATE')).toBeNull();
  });

  it('rejects unknown state', () => {
    const store = createPkceStateStore({ ttlMs: 60_000 });
    expect(store.consume('nope')).toBeNull();
  });
});
