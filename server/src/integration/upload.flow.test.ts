import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import request from 'supertest';
import { createApp } from '../app.js';
import type { MsalClient } from '../auth/msal.js';
import { createSessionStore } from '../store/sessionStore.js';
import { createConfigStore } from '../store/configStore.js';
import { createTokenBroker } from '../auth/tokenBroker.js';
import { createGraphClient } from '../spe/client.js';
import { signSessionCookie, SESSION_COOKIE_NAME } from '../auth/cookies.js';
import type { SessionClaims } from '@spectra/shared';

const HMAC = 'h'.repeat(48);
const ENC = Buffer.alloc(32, 7).toString('base64');
const USER_OID = '00000000-0000-0000-0000-000000000001';
const CONTAINER_ID = 'CONTAINER-1';

// Valid session ID: must match /^[A-Za-z0-9_-]{16,128}$/
const SESSION_ID = 'S1UploadTestSess1';

const session: SessionClaims = {
  sessionId: SESSION_ID,
  userOid: USER_OID,
  tenantId: 'T',
  isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }],
  issuedAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
  absoluteExpiresAt: Date.now() + 86_400_000,
  lastSlidingUpdate: Date.now(),
  userAccessToken: 'AT',
};

let originalFetch: typeof globalThis.fetch;

describe('upload flow integration', () => {
  beforeAll(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('uploads a PDF and returns 201 with file id', async () => {
    const memory = new Map<string, string>();
    const reader = jest.fn(async (p: string) => {
      const v = memory.get(p);
      if (!v) {
        const e = new Error('nf') as Error & { code: string };
        e.code = 'not_found';
        throw e;
      }
      return v;
    });
    const writer = jest.fn(async (p: string, b: string) => { memory.set(p, b); });
    const deleter = jest.fn(async (p: string) => { memory.delete(p); });

    const sessionStore = createSessionStore({ reader, writer, deleter, encryptionKey: ENC });
    const configStore = createConfigStore({ reader, writer });

    // Seed config
    await configStore.putWorkspaces({
      workspaces: [{
        id: 'invoices',
        displayName: 'AP Invoices',
        template: 'invoices',
        containerId: CONTAINER_ID,
        folderConvention: ['Team', 'YYYY', 'MM'],
        metadataSchema: [{ name: 'Vendor', type: 'string', required: true, indexed: true }],
        archived: false,
        createdAt: '2026-01-01T00:00:00Z',
        createdByOid: USER_OID,
      }],
    });
    await configStore.putGroupRoleMap({
      entries: [{
        entraGroupId: '11111111-1111-1111-1111-111111111111',
        entraGroupDisplayName: 'Finance',
        workspaceId: 'invoices',
        teamCode: 'AP',
        teamDisplayName: 'AP Team',
      }],
    });

    // Pre-store the session
    await sessionStore.put(session);

    const msal: MsalClient = {
      buildAuthorizeUrl: jest.fn() as never,
      exchangeCode: jest.fn() as never,
      acquireOboToken: jest.fn(async () => 'OBO') as never,
      acquireAppToken: jest.fn(async () => 'APP') as never,
    };
    const graph = createGraphClient(async () => 'TOK');

    // Nock Graph calls for upload pipeline
    // Folder convention: ['Team', 'YYYY', 'MM'] → ['AP Team', '2026', '04']
    const graphBase = nock('https://graph.microsoft.com');

    // ensureFolderPath fast path: GET full path AP Team/2026/04 → 404 (folder doesn't exist yet)
    // The Graph SDK encodes spaces as %20 but leaves slashes as literal /
    graphBase
      .get(`/v1.0/drives/${CONTAINER_ID}/root:/AP%20Team/2026/04:`)
      .reply(404, { error: { code: 'itemNotFound' } });

    // ensureFolderPath slow path: create segment by segment
    // Create 'AP Team' under root
    graphBase
      .post(`/v1.0/drives/${CONTAINER_ID}/root/children`)
      .reply(201, { id: 'FOLDER-AP', name: 'AP Team' });

    // Create '2026' under FOLDER-AP
    graphBase
      .post(`/v1.0/drives/${CONTAINER_ID}/items/FOLDER-AP/children`)
      .reply(201, { id: 'FOLDER-2026', name: '2026' });

    // Create '04' under FOLDER-2026
    graphBase
      .post(`/v1.0/drives/${CONTAINER_ID}/items/FOLDER-2026/children`)
      .reply(201, { id: 'FOLDER-04', name: '04' });

    // resolveCollision: GET full path segments + filename joined with /
    // Spaces encoded as %20, slashes literal
    graphBase
      .get(`/v1.0/drives/${CONTAINER_ID}/root:/AP%20Team/2026/04/test.pdf:`)
      .reply(404, { error: { code: 'itemNotFound' } });

    // uploadSmallFile: PUT content to parent folder item path
    graphBase
      .put(`/v1.0/drives/${CONTAINER_ID}/items/FOLDER-04:/test.pdf:/content`)
      .reply(201, { id: 'FILE-1', name: 'test.pdf', size: 100 });

    // setItemFields: PATCH listItem fields
    graphBase
      .patch(`/v1.0/drives/${CONTAINER_ID}/items/FILE-1/listItem/fields`)
      .reply(200, {});

    // grantItemPermission (app-only): POST invite
    graphBase
      .post(`/v1.0/drives/${CONTAINER_ID}/items/FILE-1/invite`)
      .reply(200, { value: [] });

    const app = createApp({
      readinessProbes: [],
      routesP2: {
        msal,
        sessionStore,
        configStore,
        hmacKey: HMAC,
        slidingMin: 480,
        absoluteMin: 1440,
        secureCookie: false,
        graphForUser: () => graph,
        graphAppOnly: () => graph,
        tokenBroker: createTokenBroker(msal),
        adminDeps: {
          provisionContainer: jest.fn(async () => 'C') as never,
          auditQuery: jest.fn(async () => ({ events: [] })) as never,
        },
      },
    });

    // Build a signed session cookie using the same helper the server uses
    const signedCookieValue = signSessionCookie(SESSION_ID, HMAC);
    const cookieHeader = `${SESSION_COOKIE_NAME}=${signedCookieValue}`;

    // Real minimal PDF buffer (magic bytes %PDF)
    const pdfBytes = Buffer.from(
      '%PDF-1.4 1 0 obj<</Type /Catalog>>endobj xref 0 0 trailer<</Root 1 0 R>>startxref 0 %%EOF',
    );

    const r = await request(app)
      .post('/api/upload')
      .set('Cookie', cookieHeader)
      .field('workspaceId', 'invoices')
      .field('teamCode', 'AP')
      .field('year', '2026')
      .field('month', '4')
      .field('metadata', JSON.stringify({ Vendor: 'ACME Corp' }))
      .attach('file', pdfBytes, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(r.status).toBe(201);
    expect(r.body.id).toBe('FILE-1');
    expect(r.body.name).toBe('test.pdf');
  });
});
