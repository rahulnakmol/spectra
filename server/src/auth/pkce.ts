import { createHash, randomBytes } from 'node:crypto';
import { LRUCache } from 'lru-cache';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function generatePkce(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(24).toString('base64url');
}

export function generateSessionId(): string {
  return randomBytes(24).toString('base64url');
}

export interface PkceState {
  verifier: string;
  returnTo: string;
}

export interface PkceStateStore {
  put(state: string, value: PkceState): void;
  consume(state: string): PkceState | null;
}

export function createPkceStateStore(opts: { ttlMs: number }): PkceStateStore {
  const cache = new LRUCache<string, PkceState>({ max: 4096, ttl: opts.ttlMs });
  return {
    put(state, value) { cache.set(state, value); },
    consume(state) {
      const v = cache.get(state);
      if (!v) return null;
      cache.delete(state);
      return v;
    },
  };
}
