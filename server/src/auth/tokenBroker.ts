import { LRUCache } from 'lru-cache';
import type { MsalClient } from './msal.js';

export interface TokenBroker {
  obo(ctx: { sessionId: string; userAccessToken: string }, scopes: string[]): Promise<string>;
  app(scopes: string[]): Promise<string>;
  invalidate(sessionId: string): void;
}

const TTL_MS = 50 * 60_000;

export function createTokenBroker(msal: MsalClient): TokenBroker {
  const oboCache = new LRUCache<string, string>({ max: 4096, ttl: TTL_MS });
  const appCache = new LRUCache<string, string>({ max: 64, ttl: TTL_MS });

  return {
    async obo(ctx, scopes) {
      const key = `${ctx.sessionId}|${[...scopes].sort().join(' ')}`;
      const hit = oboCache.get(key);
      if (hit) return hit;
      const tok = await msal.acquireOboToken(ctx.userAccessToken, scopes);
      oboCache.set(key, tok);
      return tok;
    },
    async app(scopes) {
      const key = [...scopes].sort().join(' ');
      const hit = appCache.get(key);
      if (hit) return hit;
      const tok = await msal.acquireAppToken(scopes);
      appCache.set(key, tok);
      return tok;
    },
    invalidate(sessionId) {
      const prefix = `${sessionId}|`;
      for (const key of oboCache.keys()) {
        if (key.startsWith(prefix)) oboCache.delete(key);
      }
    },
  };
}
