import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  capacity: number;
  refillPerSec: number;
  keyFn?: (req: Request) => string;
}

interface Bucket { tokens: number; lastRefill: number; }

const EVICTION_INTERVAL_MS = 60_000;

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const keyFn = opts.keyFn ?? ((req) => req.ip ?? 'unknown');

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      // Bucket is fully refilled and idle — safe to evict
      const idleMs = (opts.capacity / opts.refillPerSec) * 1000;
      if (now - bucket.lastRefill > idleMs) {
        buckets.delete(key);
      }
    }
  }, EVICTION_INTERVAL_MS).unref();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: opts.capacity, lastRefill: now };
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedSec * opts.refillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      // No buckets.set() here — intentional.
      // A first-touch new key never reaches this branch: capacity >= 1 ensures
      // tokens starts at capacity (>= 1). For known keys the map already holds
      // this object reference, so mutations to bucket.tokens/lastRefill above
      // propagate without a redundant set().
      const wait = opts.refillPerSec > 0 ? Math.ceil((1 - bucket.tokens) / opts.refillPerSec) : 60;
      res.setHeader('Retry-After', String(wait));
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket); // first insertion for a new key happens here (on success)
    next();
  };
}
