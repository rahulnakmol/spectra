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
const FILE_ID = 'FILE-1';

// Valid session ID: must match /^[A-Za-z0-9_-]{16,128}$/
const SESSION_ID = 'S2ShareTestSessio';

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

describe('share flow integration', () => {
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

  it('creates share link and returns shareUrl', async () => {
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

    await configStore.putWorkspaces({
      workspaces: [{
        id: 'invoices',
        displayName: 'AP Invoices',
        template: 'invoices',
        containerId: CONTAINER_ID,
        folderConvention: ['Team', 'YYYY', 'MM'],
        metadataSchema: [],
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
    await sessionStore.put(session);

    const msal: MsalClient = {
      buildAuthorizeUrl: jest.fn() as never,
      exchangeCode: jest.fn() as never,
      acquireOboToken: jest.fn(async () => 'OBO') as never,
      acquireAppToken: jest.fn(async () => 'APP') as never,
    };
    const graph = createGraphClient(async () => 'TOK');

    const graphBase = nock('https://graph.microsoft.com');

    // getItem: GET file item with listItem expand for ownership check
    graphBase
      .get(`/v1.0/drives/${CONTAINER_ID}/items/${FILE_ID}`)
      .query({ '$expand': 'listItem($expand=fields)' })
      .reply(200, {
        id: FILE_ID,
        name: 'test.pdf',
        size: 100,
        listItem: {
          fields: {
            UploadedByOid: USER_OID,
            UploadedByDisplayName: 'Test User',
          },
        },
      });

    // resolveRecipients: user lookup
    graphBase
      .get('/v1.0/users/recipient%40example.com')
      .reply(200, { id: 'REC-1', userPrincipalName: 'recipient@example.com' });

    // createSharingLink: POST createLink
    graphBase
      .post(`/v1.0/drives/${CONTAINER_ID}/items/${FILE_ID}/createLink`)
      .reply(200, {
        id: 'PERM-1',
        link: { webUrl: 'https://sharepoint.com/share/xyz', type: 'view' },
      });

    // sendMail: best-effort POST (after response already sent — allow but don't require)
    graphBase
      .post(`/v1.0/users/${USER_OID}/sendMail`)
      .reply(202);

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

    const signedCookieValue = signSessionCookie(SESSION_ID, HMAC);
    const cookieHeader = `${SESSION_COOKIE_NAME}=${signedCookieValue}`;

    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

    const r = await request(app)
      .post(`/api/files/${FILE_ID}/share`)
      .set('Cookie', cookieHeader)
      .send({
        ws: 'invoices',
        itemId: FILE_ID,
        recipientUpns: ['recipient@example.com'],
        expiresAt,
      });

    expect(r.status).toBe(200);
    expect(r.body.shareUrl).toBe('https://sharepoint.com/share/xyz');
    expect(r.body.expiresAt).toBe(expiresAt);
  });
});
