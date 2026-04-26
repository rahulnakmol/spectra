import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { uploadRouter } from './route.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

let originalFetch: typeof global.fetch;

const PDF = Buffer.from('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\nrest', 'utf8');

function makeStore(): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({
      workspaces: [{
        id: 'invoices', displayName: 'Invoices', template: 'invoices', containerId: 'D1',
        folderConvention: ['Team', 'YYYY', 'MM'],
        metadataSchema: [
          { name: 'Vendor', type: 'string', required: true, indexed: true },
          { name: 'InvoiceNumber', type: 'string', required: true, indexed: true },
          { name: 'Amount', type: 'number', required: true, indexed: false },
          { name: 'Currency', type: 'string', required: true, indexed: false },
        ],
        archived: false, createdAt: '2026-01-01T00:00:00Z',
        createdByOid: '00000000-0000-0000-0000-000000000000',
      }],
    })),
    getGroupRoleMap: jest.fn(), getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(), putGroupRoleMap: jest.fn(), putAppSettings: jest.fn(), invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

const member: SessionClaims = {
  sessionId: 'S', userOid: '00000000-0000-0000-0000-000000000010', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, absoluteExpiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
  userAccessToken: 'AT',
};

function makeApp(session: SessionClaims = member, store?: ConfigStore) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = createGraphClient(async () => 'TOK');
  app.use(uploadRouter({ store: store ?? makeStore(), graphForUser: () => graph, graphAppOnly: () => graph }));
  app.use(errorMiddleware);
  return app;
}

function makeStoreWithExtraFields(extra: Array<{ name: string; type: string; required: boolean; indexed: boolean; enumValues?: string[] }>): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({
      workspaces: [{
        id: 'invoices', displayName: 'Invoices', template: 'invoices', containerId: 'D1',
        folderConvention: ['Team', 'YYYY', 'MM'],
        metadataSchema: [
          { name: 'Vendor', type: 'string', required: true, indexed: true },
          { name: 'InvoiceNumber', type: 'string', required: true, indexed: true },
          { name: 'Amount', type: 'number', required: true, indexed: false },
          { name: 'Currency', type: 'string', required: true, indexed: false },
          ...extra,
        ],
        archived: false, createdAt: '2026-01-01T00:00:00Z',
        createdByOid: '00000000-0000-0000-0000-000000000000',
      }],
    })),
    getGroupRoleMap: jest.fn(), getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(), putGroupRoleMap: jest.fn(), putAppSettings: jest.fn(), invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

describe('upload route', () => {
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

  it('rejects missing file', async () => {
    const r = await request(makeApp()).post('/api/upload').field('workspaceId', 'invoices');
    expect(r.status).toBe(400);
  });

  it('rejects file > 25MB', async () => {
    const big = Buffer.alloc(26 * 1024 * 1024);
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD' }))
      .attach('file', big, 'big.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects when user lacks team access', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'OTHER')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(403);
  });

  it('happy path: sanitizes, materializes folder, uploads, writes metadata, grants permission', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/root:/AP%20Team/2026/04:').reply(200, { id: 'F-MONTH' })
      .get('/v1.0/drives/D1/root:/AP%20Team/2026/04/invoice.pdf:').reply(404, { error: { code: 'itemNotFound' } })
      .put('/v1.0/drives/D1/items/F-MONTH:/invoice.pdf:/content').reply(201, { id: 'NEW', name: 'invoice.pdf' })
      .patch('/v1.0/drives/D1/items/NEW/listItem/fields', (b) =>
        b.Vendor === 'V' && b.InvoiceNumber === 'I-1' && b.Amount === 1 && b.Currency === 'USD'
        && b.UploadedByOid === '00000000-0000-0000-0000-000000000010' && typeof b.UploadedAt === 'string')
      .reply(200, {})
      .post('/v1.0/drives/D1/items/NEW/invite', (b) => b.roles[0] === 'read' && b.requireSignIn === true)
      .reply(200, {});

    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(201);
    expect(r.body.id).toBe('NEW');
  });

  it('rejects bad MIME (text declared as pdf)', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD' }))
      .attach('file', Buffer.from('not a pdf'), 'fake.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata missing required fields', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata with wrong field type (string field given number)', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 123, InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata with wrong field type (number field given string)', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 'not-a-number', Currency: 'USD' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata that is not valid JSON', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', '{not-valid-json')
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects upload when UploadRequest schema validation fails (missing workspaceId)', async () => {
    const r = await request(makeApp())
      .post('/api/upload')
      .field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata with invalid date field', async () => {
    const store = makeStoreWithExtraFields([
      { name: 'InvoiceDate', type: 'date', required: true, indexed: false },
    ]);
    const r = await request(makeApp(member, store))
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD', InvoiceDate: 'not-a-date' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata with enum field not in allowed values', async () => {
    const store = makeStoreWithExtraFields([
      { name: 'Category', type: 'enum', required: true, indexed: false, enumValues: ['A', 'B'] },
    ]);
    const r = await request(makeApp(member, store))
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD', Category: 'C' }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });

  it('rejects metadata with enum field given a non-string value', async () => {
    const store = makeStoreWithExtraFields([
      { name: 'Category', type: 'enum', required: true, indexed: false, enumValues: ['A', 'B'] },
    ]);
    const r = await request(makeApp(member, store))
      .post('/api/upload')
      .field('workspaceId', 'invoices').field('teamCode', 'AP')
      .field('year', '2026').field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'V', InvoiceNumber: 'I-1', Amount: 1, Currency: 'USD', Category: 42 }))
      .attach('file', PDF, 'invoice.pdf');
    expect(r.status).toBe(400);
  });
});
