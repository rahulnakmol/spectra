import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  capacity: number;
  refillPerSec: number;
  keyFn?: (req: Request) => string;
}

interface Bucket { tokens: number; lastRefill: number; }

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const keyFn = opts.keyFn ?? ((req) => req.ip ?? 'unknown');

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: opts.capacity, lastRefill: now };
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedSec * opts.refillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const wait = opts.refillPerSec > 0 ? Math.ceil((1 - bucket.tokens) / opts.refillPerSec) : 60;
      res.setHeader('Retry-After', String(wait));
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
