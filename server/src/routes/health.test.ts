import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { healthRouter } from './health.js';

describe('health routes', () => {
  it('/health responds 200 with status:up', async () => {
    const app = express();
    app.use(healthRouter({ readinessProbes: [] }));
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'up' });
  });

  it('/ready is 200 when all probes pass', async () => {
    const app = express();
    app.use(healthRouter({ readinessProbes: [jest.fn<() => Promise<void>>().mockResolvedValue()] }));
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
  });

  it('/ready is 503 when a probe fails', async () => {
    const app = express();
    app.use(
      healthRouter({
        readinessProbes: [
          jest.fn<() => Promise<void>>().mockRejectedValue(new Error('kv down')),
        ],
      }),
    );
    const r = await request(app).get('/ready');
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('not_ready');
  });
});
