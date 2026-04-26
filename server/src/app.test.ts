import { describe, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from './app.js';
import type { MsalClient } from './auth/msal.js';
import type { SessionStore } from './store/sessionStore.js';
import type { ConfigStore } from './store/configStore.js';
import { createGraphClient } from './spe/client.js';
import { createTokenBroker } from './auth/tokenBroker.js';

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

function fakeP2() {
  const msal: MsalClient = {
    buildAuthorizeUrl: jest.fn() as never,
    exchangeCode: jest.fn() as never,
    acquireOboToken: jest.fn(async () => 'OBO') as never,
    acquireAppToken: jest.fn(async () => 'APP') as never,
  };
  const sessionStore: SessionStore = {
    get: jest.fn(async () => null) as never,
    put: jest.fn() as never,
    delete: jest.fn() as never,
  };
  const configStore: ConfigStore = {
    getWorkspaces: jest.fn(async () => ({ workspaces: [] })) as never,
    getGroupRoleMap: jest.fn(async () => ({ entries: [] })) as never,
    getAppSettings: jest.fn() as never,
    putWorkspaces: jest.fn() as never,
    putGroupRoleMap: jest.fn() as never,
    putAppSettings: jest.fn() as never,
    invalidate: jest.fn() as never,
  };
  const graph = createGraphClient(async () => 'TOK');
  return {
    msal, sessionStore, configStore,
    hmacKey: 'h'.repeat(48), slidingMin: 480, absoluteMin: 1440, secureCookie: false,
    graphForUser: () => graph, graphAppOnly: () => graph,
    tokenBroker: createTokenBroker(msal),
    adminDeps: {
      provisionContainer: jest.fn(async () => 'C') as never,
      auditQuery: jest.fn(async () => ({ events: [] })) as never,
    },
  };
}

describe('createApp wires P2 routes', () => {
  it('GET /api/auth/me without cookie → 401', async () => {
    const app = createApp({ readinessProbes: [], routesP2: fakeP2() });
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });
  it('GET /api/files without cookie → 401', async () => {
    const app = createApp({ readinessProbes: [], routesP2: fakeP2() });
    const r = await request(app).get('/api/files?ws=invoices');
    expect(r.status).toBe(401);
  });
  it('ALL /api/agent/* → 501', async () => {
    const app = createApp({ readinessProbes: [], routesP2: fakeP2() });
    const r = await request(app).post('/api/agent/x').send({});
    expect(r.status).toBe(501);
  });
});
