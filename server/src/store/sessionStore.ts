import { LRUCache } from 'lru-cache';
import type { SessionClaims } from '@spectra/shared';
import { decryptJson, encryptJson } from './crypto.js';
import type { ConfigReader, ConfigWriter } from './configStore.js';
import type { SessionDeleter } from './speBackend.js';

export type { SessionDeleter };

interface Opts {
  reader: ConfigReader;
  writer: ConfigWriter;
  deleter: SessionDeleter;
  encryptionKey: string;
  ttlMs?: number;
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionClaims | null>;
  put(claims: SessionClaims): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

const SAFE = /^[A-Za-z0-9_-]{16,128}$/;

function pathFor(sessionId: string): string {
  if (!SAFE.test(sessionId)) throw new Error('invalid sessionId');
  return `/sessions/${sessionId}.json`;
}

export function createSessionStore(opts: Opts): SessionStore {
  const cache = new LRUCache<string, SessionClaims>({ max: 1024, ttl: opts.ttlMs ?? 60_000 });
  return {
    async get(sessionId) {
      const path = pathFor(sessionId);
      const cached = cache.get(sessionId);
      if (cached) return cached;
      let body: string;
      try { body = await opts.reader(path); }
      catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'not_found' || (err as { status?: number }).status === 404) return null;
        throw err;
      }
      const claims = decryptJson<SessionClaims>(body, opts.encryptionKey);
      cache.set(sessionId, claims);
      return claims;
    },
    async put(claims) {
      const path = pathFor(claims.sessionId);
      const ct = encryptJson(claims, opts.encryptionKey);
      await opts.writer(path, ct);
      cache.set(claims.sessionId, claims);
    },
    async delete(sessionId) {
      const path = pathFor(sessionId);
      await opts.deleter(path);
      cache.delete(sessionId);
    },
  };
}
