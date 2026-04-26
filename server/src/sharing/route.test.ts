import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { sharingRouter } from './route.js';
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
        id: 'invoices', displayName: 'Invoices', template: 'invoices', containerId: 'D1',
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
  app.use(express.json());
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = createGraphClient(async () => 'TOK');
  app.use(sharingRouter({ store: makeStore(), graphForUser: () => graph }));
  app.use(errorMiddleware);
  return app;
}

describe('share route', () => {
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

  it('POST /api/files/:id/share creates view-only no-download link with expiry', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    nock('https://graph.microsoft.com')
      .get('/v1.0/users/alice%40contoso.com').query(true).reply(200, { id: 'OID-A' })
      .get('/v1.0/drives/D1/items/IT').query(true).reply(200, { id: 'IT', name: 'a.pdf', createdBy: { user: { id: 'U-MEM' } }, listItem: { fields: { UploadedByOid: 'U-MEM' } } })
      .post('/v1.0/drives/D1/items/IT/createLink', (b) => b.preventsDownload === true && b.type === 'view' && b.scope === 'organization')
      .reply(200, { link: { webUrl: 'https://share/x' }, id: 'PERM' })
      .post('/v1.0/users/U-MEM/sendMail').reply(202);
    const r = await request(makeApp())
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['alice@contoso.com'], expiresAt: future });
    expect(r.status).toBe(200);
    expect(r.body.shareUrl).toBe('https://share/x');
  });

  it('rejects expiry > 90 days', async () => {
    const tooFar = new Date(Date.now() + 100 * 86_400_000).toISOString();
    const r = await request(makeApp())
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['x@contoso.com'], expiresAt: tooFar });
    expect(r.status).toBe(400);
  });

  it('rejects expiry in the past', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const r = await request(makeApp())
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['x@contoso.com'], expiresAt: past });
    expect(r.status).toBe(400);
  });

  it('admin can share a file uploaded by another user', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const admin: SessionClaims = {
      ...member,
      userOid: 'U-ADMIN',
      isAdmin: true,
    };
    nock('https://graph.microsoft.com')
      .get('/v1.0/users/alice%40contoso.com').query(true).reply(200, { id: 'OID-A' })
      .get('/v1.0/drives/D1/items/IT').query(true).reply(200, {
        id: 'IT', name: 'a.pdf',
        createdBy: { user: { id: 'U-OTHER' } },
        listItem: { fields: { UploadedByOid: 'U-OTHER' } },
      })
      .post('/v1.0/drives/D1/items/IT/createLink').reply(200, { link: { webUrl: 'https://share/x' }, id: 'PERM' })
      .post('/v1.0/users/U-ADMIN/sendMail').reply(202);
    const r = await request(makeApp(admin))
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['alice@contoso.com'], expiresAt: future });
    expect(r.status).toBe(200);
    expect(r.body.shareUrl).toBe('https://share/x');
  });

  it('returns 404 when file does not exist', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    nock('https://graph.microsoft.com')
      .get('/v1.0/users/alice%40contoso.com').query(true).reply(200, { id: 'OID-A' })
      .get('/v1.0/drives/D1/items/MISSING').query(true).reply(404, { error: { code: 'itemNotFound', message: 'Item not found' } });
    const r = await request(makeApp())
      .post('/api/files/MISSING/share')
      .send({ ws: 'invoices', recipientUpns: ['alice@contoso.com'], expiresAt: future });
    expect(r.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const app = express();
    app.use(express.json());
    // No session middleware — req.session will be undefined, triggering requireAuth rejection
    const graph = createGraphClient(async () => 'TOK');
    app.use(sharingRouter({ store: makeStore(), graphForUser: () => graph }));
    app.use(errorMiddleware);
    const r = await request(app)
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['alice@contoso.com'], expiresAt: future });
    expect(r.status).toBe(401);
  });

  it('returns 200 even when sendMail returns 403 (best-effort mail)', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/IT').query(true).reply(200, { id: 'IT', name: 'a.pdf', createdBy: { user: { id: 'U-MEM' } }, listItem: { fields: { UploadedByOid: 'U-MEM' } } })
      .get('/v1.0/users/alice%40contoso.com').query(true).reply(200, { id: 'OID-A' })
      .post('/v1.0/drives/D1/items/IT/createLink').reply(200, { link: { webUrl: 'https://share/x' }, id: 'PERM' })
      .post('/v1.0/users/U-MEM/sendMail').reply(403, { error: { code: 'ErrorAccessDenied', message: 'Access denied' } });
    const r = await request(makeApp())
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['alice@contoso.com'], expiresAt: future });
    expect(r.status).toBe(200);
    expect(r.body.shareUrl).toBe('https://share/x');
  });

  it('rejects share when user does not own the file (only-own)', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    nock('https://graph.microsoft.com')
      .get('/v1.0/users/alice%40contoso.com').query(true).reply(200, { id: 'OID-A' })
      .get('/v1.0/drives/D1/items/IT').query(true).reply(200, { id: 'IT', name: 'a.pdf', createdBy: { user: { id: 'OTHER' } }, listItem: { fields: { UploadedByOid: 'OTHER' } } });
    const r = await request(makeApp())
      .post('/api/files/IT/share')
      .send({ ws: 'invoices', recipientUpns: ['alice@contoso.com'], expiresAt: future });
    expect(r.status).toBe(403);
  });
});
