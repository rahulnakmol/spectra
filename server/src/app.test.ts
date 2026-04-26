import { describe, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from './app.js';

describe('createApp integration', () => {
  it('GET /health → 200', async () => {
    const app = createApp({ readinessProbes: [] });
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
  });

  it('GET /ready → 200 when probes pass', async () => {
    const app = createApp({
      readinessProbes: [jest.fn<() => Promise<void>>().mockResolvedValue()],
    });
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
  });

  it('GET /ready → 503 when probe fails', async () => {
    const app = createApp({
      readinessProbes: [jest.fn<() => Promise<void>>().mockRejectedValue(new Error('x'))],
    });
    const r = await request(app).get('/ready');
    expect(r.status).toBe(503);
  });

  it('GET /no-such-route → 404', async () => {
    const app = createApp({ readinessProbes: [] });
    const r = await request(app).get('/does-not-exist');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found', message: 'Resource not found' });
  });

  it('sets CSP on every response', async () => {
    const app = createApp({ readinessProbes: [] });
    const r = await request(app).get('/health');
    expect(r.headers['content-security-policy']).toBeDefined();
  });
});
