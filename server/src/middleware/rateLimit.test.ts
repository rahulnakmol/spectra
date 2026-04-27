import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { rateLimit } from './rateLimit.js';

describe('rateLimit', () => {
  it('allows up to capacity and then returns 429', async () => {
    const app = express();
    app.use(rateLimit({ capacity: 2, refillPerSec: 0, keyFn: () => 'static' }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));

    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    const r = await request(app).get('/x');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeDefined();
  });

  it('partitions by keyFn', async () => {
    const app = express();
    let counter = 0;
    app.use(rateLimit({ capacity: 1, refillPerSec: 0, keyFn: () => String(counter++) }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));

    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
  });

  it('uses req.ip as default key when no keyFn provided', async () => {
    const app = express();
    app.use(rateLimit({ capacity: 1, refillPerSec: 0 }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));

    // First request from default IP succeeds, second is rejected
    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    const r = await request(app).get('/x');
    expect(r.status).toBe(429);
  });

  it('Retry-After is 60 when refillPerSec is 0', async () => {
    const app = express();
    app.use(rateLimit({ capacity: 1, refillPerSec: 0, keyFn: () => 'static' }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));
    await request(app).get('/x'); // consume the token
    const r = await request(app).get('/x');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('60');
  });

  it('Retry-After reflects actual refill time when refillPerSec > 0', async () => {
    const app = express();
    app.use(rateLimit({ capacity: 1, refillPerSec: 2, keyFn: () => 'static' }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));
    await request(app).get('/x'); // consume the token
    const r = await request(app).get('/x');
    expect(r.status).toBe(429);
    // retry-after = ceil((1 - tokens) / refillPerSec) = ceil(1/2) = 1
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });
});
