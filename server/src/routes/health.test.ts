import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../obs/audit.js', () => ({
  audit: jest.fn(),
  hashIp: jest.fn(),
}));

const { healthRouter } = await import('./health.js');

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

  it('/ready is 200 with no probes registered', async () => {
    const app = express();
    app.use(healthRouter({ readinessProbes: [] }));
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ready' });
  });

  it('/ready awaits all probes before responding 200', async () => {
    const probeA = jest.fn<() => Promise<void>>().mockResolvedValue();
    const probeB = jest.fn<() => Promise<void>>().mockResolvedValue();
    const app = express();
    app.use(healthRouter({ readinessProbes: [probeA, probeB] }));
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
    expect(probeA).toHaveBeenCalledTimes(1);
    expect(probeB).toHaveBeenCalledTimes(1);
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
    expect(r.body).toEqual({ error: 'not_ready' });
  });

  it('/ready is 503 when one probe of many fails', async () => {
    const app = express();
    app.use(
      healthRouter({
        readinessProbes: [
          jest.fn<() => Promise<void>>().mockResolvedValue(),
          jest.fn<() => Promise<void>>().mockRejectedValue(new Error('graph down')),
        ],
      }),
    );
    const r = await request(app).get('/ready');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'not_ready' });
  });
});
