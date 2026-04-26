import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { filesRouter } from './files.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import { NotFoundError, ForbiddenError } from '../errors/domain.js';
import type { SpeGraphClient } from '../spe/index.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

let originalFetch: typeof global.fetch;

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

const member: SessionClaims = {
  sessionId: 'S', userOid: 'U-MEM', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, absoluteExpiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
  userAccessToken: 'AT',
};

function makeApp(session: SessionClaims = member, graphOverride?: SpeGraphClient) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = graphOverride ?? createGraphClient(async () => 'TOK');
  app.use(filesRouter({ store: makeStore(), graphForUser: () => graph }));
  app.use(errorMiddleware);
  return app;
}

/** Build a minimal mock SpeGraphClient that throws domain errors on demand */
function mockGraphThrows(err: Error): SpeGraphClient {
  const req = {
    expand: () => req,
    top: () => req,
    filter: () => req,
    query: () => req,
    orderby: () => req,
    get: jest.fn(async () => { throw err; }),
    post: jest.fn(async () => { throw err; }),
  };
  return { api: () => req as unknown as ReturnType<SpeGraphClient['api']> };
}

describe('files routes', () => {
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

  it('GET /api/files filters by uploader and double-checks in code', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/root/children')
      .query((q) => typeof q.$filter === 'string' && q.$filter.includes("UploadedByOid eq 'U-MEM'"))
      .reply(200, {
        value: [
          { id: 'A', name: 'a.pdf', size: 1, createdBy: { user: { id: 'U-MEM', displayName: 'M' } }, createdDateTime: '2026-01-01T00:00:00Z',
            listItem: { fields: { UploadedByOid: 'U-MEM', UploadedAt: '2026-01-01T00:00:00Z', Vendor: 'V' } } },
          { id: 'B', name: 'b.pdf', size: 1, createdBy: { user: { id: 'U-OTHER', displayName: 'O' } }, createdDateTime: '2026-01-01T00:00:00Z',
            listItem: { fields: { UploadedByOid: 'U-OTHER' } } },
        ],
      });
    const r = await request(makeApp()).get('/api/files?ws=invoices');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].id).toBe('A');
  });

  it('GET /api/files admin sees all without filter', async () => {
    const admin: SessionClaims = { ...member, isAdmin: true };
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/root/children')
      .query((q) => !q.$filter || !String(q.$filter).includes('UploadedByOid'))
      .reply(200, { value: [{ id: 'A', name: 'a', size: 1, createdBy: { user: { id: 'X', displayName: 'X' } }, createdDateTime: '2026-01-01T00:00:00Z', listItem: { fields: {} } }] });
    const r = await request(makeApp(admin)).get('/api/files?ws=invoices');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
  });

  it('GET /api/files/:id returns 200 for own item', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/A')
      .query(true)
      .reply(200, { id: 'A', name: 'a.pdf', size: 1, createdBy: { user: { id: 'U-MEM', displayName: 'M' } }, createdDateTime: '2026-01-01T00:00:00Z', listItem: { fields: { UploadedByOid: 'U-MEM' } } });
    const r = await request(makeApp()).get('/api/files/A?ws=invoices');
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('A');
  });

  it('GET /api/files/:id returns 403 when item belongs to another user (only-own)', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/B').query(true)
      .reply(200, { id: 'B', name: 'b', size: 1, createdBy: { user: { id: 'OTHER' } }, createdDateTime: '2026-01-01T00:00:00Z', listItem: { fields: { UploadedByOid: 'OTHER' } } });
    const r = await request(makeApp()).get('/api/files/B?ws=invoices');
    expect(r.status).toBe(403);
  });

  it('GET /api/files/:id/preview returns short-lived embed url', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/A').query(true)
      .reply(200, { id: 'A', name: 'a', size: 1, createdBy: { user: { id: 'U-MEM' } }, createdDateTime: '2026-01-01T00:00:00Z', listItem: { fields: { UploadedByOid: 'U-MEM' } } })
      .post('/v1.0/drives/D1/items/A/preview').reply(200, { getUrl: 'https://contoso.sharepoint.com/embed/abc' });
    const r = await request(makeApp()).get('/api/files/A/preview?ws=invoices');
    expect(r.status).toBe(200);
    expect(r.body.previewUrl).toBe('https://contoso.sharepoint.com/embed/abc');
  });

  it('GET /api/files rejects missing ws param', async () => {
    const r = await request(makeApp()).get('/api/files');
    expect(r.status).toBe(400);
  });

  it('GET /api/files returns 403 when user has no membership in requested workspace', async () => {
    const r = await request(makeApp()).get('/api/files?ws=other-workspace');
    expect(r.status).toBe(403);
  });

  it('GET /api/files/:id returns 403 when ws query missing', async () => {
    const r = await request(makeApp()).get('/api/files/A');
    expect(r.status).toBe(400);
  });

  it('GET /api/files/:id returns 403 when user has no membership in requested workspace', async () => {
    const r = await request(makeApp()).get('/api/files/A?ws=other-workspace');
    expect(r.status).toBe(403);
  });

  it('GET /api/files/:id audits not_found on 404 from Graph', async () => {
    const graph = mockGraphThrows(new NotFoundError('Item not found'));
    const r = await request(makeApp(member, graph)).get('/api/files/MISSING?ws=invoices');
    expect(r.status).toBe(404);
  });

  it('GET /api/files/:id/preview returns 403 when ws missing', async () => {
    const r = await request(makeApp()).get('/api/files/A/preview');
    expect(r.status).toBe(400);
  });

  it('GET /api/files/:id/preview returns 403 for no workspace membership', async () => {
    const r = await request(makeApp()).get('/api/files/A/preview?ws=other-workspace');
    expect(r.status).toBe(403);
  });

  it('GET /api/files/:id/preview returns 403 when item belongs to another user', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/X').query(true)
      .reply(200, { id: 'X', name: 'x.pdf', size: 1,
        createdBy: { user: { id: 'OTHER', displayName: 'Other' } }, createdDateTime: '2026-01-01T00:00:00Z',
        listItem: { fields: { UploadedByOid: 'OTHER' } } });
    const r = await request(makeApp()).get('/api/files/X/preview?ws=invoices');
    expect(r.status).toBe(403);
  });

  it('GET /api/files/:id/preview audits not_found on 404 from Graph', async () => {
    const graph = mockGraphThrows(new NotFoundError('Item not found'));
    const r = await request(makeApp(member, graph)).get('/api/files/GONE/preview?ws=invoices');
    expect(r.status).toBe(404);
  });

  it('GET /api/files admin sees all items without ownership filter', async () => {
    const admin: SessionClaims = { ...member, isAdmin: true, teamMemberships: [] };
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/B').query(true)
      .reply(200, { id: 'B', name: 'b.pdf', size: 1,
        createdBy: { user: { id: 'OTHER', displayName: 'O' } }, createdDateTime: '2026-01-01T00:00:00Z',
        listItem: { fields: { UploadedByOid: 'OTHER' } } });
    const r = await request(makeApp(admin)).get('/api/files/B?ws=invoices');
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('B');
  });
});
