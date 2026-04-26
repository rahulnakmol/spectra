import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { searchRouter } from './search.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

let originalFetch: typeof global.fetch;

const member: SessionClaims = {
  sessionId: 'S', userOid: 'U-MEM', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, absoluteExpiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
  userAccessToken: 'AT',
};

function makeStore(): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({
      workspaces: [{
        id: 'invoices', displayName: 'Invoices', template: 'invoices' as const, containerId: 'D1',
        folderConvention: ['Team', 'YYYY', 'MM'], metadataSchema: [], archived: false,
        createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000',
      }],
    })),
    getGroupRoleMap: jest.fn(), getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(), putGroupRoleMap: jest.fn(), putAppSettings: jest.fn(), invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

function makeApp(session: SessionClaims = member) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = createGraphClient(async () => 'TOK');
  app.use(searchRouter({ store: makeStore(), graphForUser: () => graph }));
  app.use(errorMiddleware);
  return app;
}

describe('search route', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof global.fetch;
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => {
    global.fetch = originalFetch;
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('GET /api/search returns results filtered by uploader for non-admin', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/root/search(q=%27invoice%27)')
      .query(true)
      .reply(200, { value: [
        { id: 'A', name: 'invoice-1.pdf', size: 1, createdBy: { user: { id: 'U-MEM' } }, createdDateTime: '2026-01-01T00:00:00Z', listItem: { fields: { UploadedByOid: 'U-MEM' } } },
        { id: 'B', name: 'invoice-2.pdf', size: 1, createdBy: { user: { id: 'OTHER' } }, createdDateTime: '2026-01-01T00:00:00Z', listItem: { fields: { UploadedByOid: 'OTHER' } } },
      ] });
    const r = await request(makeApp()).get('/api/search?ws=invoices&q=invoice');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].id).toBe('A');
  });

  it('rejects q < 2 chars', async () => {
    const r = await request(makeApp()).get('/api/search?ws=invoices&q=a');
    expect(r.status).toBe(400);
  });
});
