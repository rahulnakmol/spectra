import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from './security.js';

describe('securityHeaders middleware', () => {
  const app = express();
  app.use(securityHeaders());
  app.get('/x', (_req, res) => res.status(200).send('ok'));

  it('sets CSP, HSTS, nosniff, referrer-policy, permissions-policy', async () => {
    const r = await request(app).get('/x');
    expect(r.status).toBe(200);
    expect(r.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(r.headers['content-security-policy']).toMatch(/frame-src https:\/\/\*\.sharepoint\.com/);
    expect(r.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(r.headers['permissions-policy']).toMatch(/geolocation=\(\)/);
  });

  it('removes x-powered-by', async () => {
    const r = await request(app).get('/x');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});
