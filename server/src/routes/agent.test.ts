import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { agentRouter } from './agent.js';
import { errorMiddleware } from '../errors/middleware.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(agentRouter());
  app.use(errorMiddleware);
  return app;
}

describe('agent stub', () => {
  it('GET /api/agent/* → 501', async () => {
    const r = await request(makeApp()).get('/api/agent/anything').send({});
    expect(r.status).toBe(501);
    expect(r.body.error).toBe('not_implemented');
  });

  it('POST /api/agent/* → 501', async () => {
    const r = await request(makeApp()).post('/api/agent/anything').send({});
    expect(r.status).toBe(501);
    expect(r.body.error).toBe('not_implemented');
  });

  it('PUT /api/agent/* → 501', async () => {
    const r = await request(makeApp()).put('/api/agent/anything').send({});
    expect(r.status).toBe(501);
    expect(r.body.error).toBe('not_implemented');
  });

  it('PATCH /api/agent/* → 501', async () => {
    const r = await request(makeApp()).patch('/api/agent/anything').send({});
    expect(r.status).toBe(501);
    expect(r.body.error).toBe('not_implemented');
  });

  it('DELETE /api/agent/* → 501', async () => {
    const r = await request(makeApp()).delete('/api/agent/anything').send({});
    expect(r.status).toBe(501);
    expect(r.body.error).toBe('not_implemented');
  });
});
