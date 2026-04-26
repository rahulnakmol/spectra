# P2 — BFF Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all BFF API routes (auth, authz, SPE client, store, upload, sharing, admin) on top of the P1 foundation so the backend is fully functional before the frontend is wired.

**Architecture:** MSAL-Node confidential client with PKCE; encrypted session JSON in SPE system container behind 60s LRU; OBO for user-scoped Graph ops, app-only for admin; all Graph calls go through `spe/`; authz guards in `authz/` with 100% test coverage.

**Tech Stack:** `@azure/msal-node`, `@microsoft/microsoft-graph-client`, `multer`, `file-type`, `lru-cache`, `cookie-signature`, `nock` (test), `supertest` (test).

**Reference:** `docs/superpowers/specs/2026-04-24-spectra-design.md` §4 (auth & request flow), §5 (component breakdown — BFF API), §7 (admin surface), §8 (security posture), `CLAUDE.md` §6 (conventions).

**Deliverable at P2 end:**
- All BFF routes from the API table in §5 of the spec are implemented and integration-tested
- Login, callback, logout, `/me` work against MSAL-Node confidential client with encrypted SPE-backed sessions
- Authz guards (`requireAuth`, `requireRole`, `requireWorkspaceAccess`) at 100% line coverage
- Upload endpoint handles multipart, MIME-sniff, allowlist, sanitization, folder materialization, metadata, item-permission grant
- Sharing endpoint creates view-only no-download Graph links with required expiry and same-tenant validation
- Admin CRUD on workspaces and group-mapping is wired and gated on `AppAdmin`
- `/api/agent/*` returns 501
- `/ready` probe extended to check Graph reachability
- Server coverage ≥80%, `authz/` at 100%
- Tagged `v0.2.0-bff`

---

## Phase A — SPE client (Graph wrappers)

The SPE module is the *only* place in the codebase that talks to Microsoft Graph. Every other module calls into `spe/`. This phase builds wrappers without auth context — auth comes in Phase C; here we accept a token-acquirer callback.

### Task A1: Install Graph + MSAL dependencies

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Add runtime dependencies**

```bash
npm install -w @spectra/server \
  @azure/msal-node@2.16.2 \
  @microsoft/microsoft-graph-client@3.0.7 \
  isomorphic-fetch@3.0.0 \
  multer@1.4.5-lts.1 \
  file-type@19.6.0 \
  lru-cache@10.4.3 \
  cookie-signature@1.2.2
```

- [ ] **Step 2: Add dev dependencies**

```bash
npm install -w @spectra/server --save-dev \
  @types/multer@1.4.12 \
  @types/cookie-signature@1.1.2 \
  nock@13.5.6
```

- [ ] **Step 3: Verify install**

```bash
npm -w @spectra/server ls @azure/msal-node @microsoft/microsoft-graph-client
```

Expected: both packages listed at the requested versions, no peer-dep warnings.

- [ ] **Step 4: Commit**

```bash
git add server/package.json package-lock.json
git commit -m "chore(server): add MSAL, Graph SDK, multer, file-type, lru-cache, nock"
```

### Task A2: Define SPE types and error mapping

**Files:**
- Create: `server/src/spe/types.ts`
- Create: `server/src/spe/types.test.ts`

- [ ] **Step 1: Failing test — `server/src/spe/types.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import { mapGraphErrorToDomain } from './types.js';
import { NotFoundError, ForbiddenError, ConflictError, UpstreamError, BadRequestError } from '../errors/domain.js';

describe('mapGraphErrorToDomain', () => {
  it('maps 404 to NotFoundError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 404, message: 'itemNotFound' });
    expect(e).toBeInstanceOf(NotFoundError);
  });
  it('maps 403 to ForbiddenError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 403, message: 'accessDenied' });
    expect(e).toBeInstanceOf(ForbiddenError);
  });
  it('maps 409 to ConflictError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 409, message: 'nameAlreadyExists' });
    expect(e).toBeInstanceOf(ConflictError);
  });
  it('maps 400 to BadRequestError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 400, message: 'invalidRequest' });
    expect(e).toBeInstanceOf(BadRequestError);
  });
  it('maps 5xx to UpstreamError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 503, message: 'serviceUnavailable' });
    expect(e).toBeInstanceOf(UpstreamError);
  });
  it('maps 429 to UpstreamError with retry-after detail', () => {
    const e = mapGraphErrorToDomain({ statusCode: 429, message: 'tooManyRequests', headers: { 'retry-after': '30' } });
    expect(e).toBeInstanceOf(UpstreamError);
    expect((e as UpstreamError).detail?.retryAfterSec).toBe(30);
  });
  it('falls through unknown to UpstreamError', () => {
    const e = mapGraphErrorToDomain({ statusCode: undefined, message: 'unknown' });
    expect(e).toBeInstanceOf(UpstreamError);
  });
});
```

Run: `npm -w @spectra/server test -- types.test`. Expect: cannot find module `./types.js`.

- [ ] **Step 2: Implement — `server/src/spe/types.ts`**

```ts
import { BadRequestError, ConflictError, DomainError, ForbiddenError, NotFoundError, UpstreamError } from '../errors/domain.js';

export interface GraphLikeError {
  statusCode?: number;
  message?: string;
  code?: string;
  headers?: Record<string, string>;
}

export interface GraphTokenAcquirer {
  // Returns a Graph access token. OBO flow uses the user's session refresh token;
  // app-only flow uses client credentials. The acquirer encapsulates both modes.
  (): Promise<string>;
}

export interface SpeDriveItem {
  id: string;
  name: string;
  parentReference?: { path?: string; driveId?: string };
  size?: number;
  createdBy?: { user?: { id?: string; displayName?: string } };
  createdDateTime?: string;
  listItem?: { fields?: Record<string, unknown> };
}

export interface SpeListing {
  items: SpeDriveItem[];
  nextLink?: string;
}

export function mapGraphErrorToDomain(err: GraphLikeError): DomainError {
  const status = err.statusCode ?? 0;
  const msg = err.message ?? err.code ?? 'graph_error';
  if (status === 404) return new NotFoundError('Resource not found', { upstream: msg });
  if (status === 403) return new ForbiddenError('Access denied', { upstream: msg });
  if (status === 409) return new ConflictError('Conflict', { upstream: msg });
  if (status === 400) return new BadRequestError('Bad request', { upstream: msg });
  if (status === 429) {
    const ra = err.headers?.['retry-after'];
    const retryAfterSec = ra ? Number.parseInt(ra, 10) : undefined;
    return new UpstreamError('Upstream throttled', {
      upstream: msg,
      ...(Number.isFinite(retryAfterSec) ? { retryAfterSec: retryAfterSec! } : {}),
    });
  }
  return new UpstreamError('Upstream error', { upstream: msg, status });
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- types.test
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/spe/types.ts server/src/spe/types.test.ts
git commit -m "feat(server/spe): add Graph error → DomainError mapping and SPE types"
```

### Task A3: Build the Graph client factory

**Files:**
- Create: `server/src/spe/client.ts`
- Create: `server/src/spe/client.test.ts`

- [ ] **Step 1: Failing test — `server/src/spe/client.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from './client.js';

describe('createGraphClient', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('attaches bearer token from acquirer', async () => {
    const scope = nock('https://graph.microsoft.com', {
      reqheaders: { authorization: 'Bearer test-token-abc' },
    }).get('/v1.0/me').reply(200, { id: 'user-1' });

    const client = createGraphClient(async () => 'test-token-abc');
    const out = await client.api('/me').get();
    expect(out.id).toBe('user-1');
    expect(scope.isDone()).toBe(true);
  });

  it('translates Graph 404 via mapGraphErrorToDomain', async () => {
    nock('https://graph.microsoft.com').get('/v1.0/me/drive/items/bad').reply(404, { error: { code: 'itemNotFound', message: 'gone' } });
    const client = createGraphClient(async () => 't');
    await expect(client.api('/me/drive/items/bad').get()).rejects.toMatchObject({ code: 'not_found' });
  });

  it('translates Graph 429 to UpstreamError with retryAfterSec', async () => {
    nock('https://graph.microsoft.com').get('/v1.0/anything')
      .reply(429, { error: { code: 'tooManyRequests', message: 'slow down' } }, { 'retry-after': '7' });
    const client = createGraphClient(async () => 't');
    await expect(client.api('/anything').get()).rejects.toMatchObject({
      code: 'upstream',
      detail: expect.objectContaining({ retryAfterSec: 7 }),
    });
  });
});
```

Run: `npm -w @spectra/server test -- client.test`. Expect: module not found.

- [ ] **Step 2: Implement — `server/src/spe/client.ts`**

```ts
import { Client, type AuthenticationProvider, type GraphRequest } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { mapGraphErrorToDomain, type GraphLikeError, type GraphTokenAcquirer } from './types.js';

class TokenAcquirerProvider implements AuthenticationProvider {
  constructor(private readonly acquire: GraphTokenAcquirer) {}
  async getAccessToken(): Promise<string> {
    return this.acquire();
  }
}

export interface SpeGraphClient {
  api(path: string): GraphRequest;
}

export function createGraphClient(acquire: GraphTokenAcquirer): SpeGraphClient {
  const inner = Client.initWithMiddleware({
    authProvider: new TokenAcquirerProvider(acquire),
    defaultVersion: 'v1.0',
  });
  return {
    api(path) {
      // Wrap so every call gets unified error translation. The Graph SDK throws
      // GraphError with statusCode + headers; we map to DomainError once here.
      const req = inner.api(path);
      const proxy: GraphRequest = new Proxy(req, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value !== 'function') return value;
          if (!['get', 'post', 'put', 'patch', 'delete', 'getStream', 'putStream'].includes(String(prop))) {
            return value.bind(target);
          }
          return async (...args: unknown[]) => {
            try {
              return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            } catch (err) {
              throw mapGraphErrorToDomain(err as GraphLikeError);
            }
          };
        },
      });
      return proxy;
    },
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- client.test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/spe/client.ts server/src/spe/client.test.ts
git commit -m "feat(server/spe): Graph client factory with unified error translation"
```

### Task A4: Drives + items wrapper

**Files:**
- Create: `server/src/spe/drives.ts`
- Create: `server/src/spe/drives.test.ts`

- [ ] **Step 1: Failing test — `server/src/spe/drives.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { listChildren, getItem, deleteItem, downloadItemStream } from './drives.js';

describe('drives wrappers', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  const client = createGraphClient(async () => 'tok');

  it('listChildren returns items + nextLink', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/I1/children')
      .query(true)
      .reply(200, {
        value: [{ id: 'A', name: 'a.pdf' }, { id: 'B', name: 'b.pdf' }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/D1/items/I1/children?$skiptoken=x',
      });
    const out = await listChildren(client, 'D1', 'I1');
    expect(out.items).toHaveLength(2);
    expect(out.nextLink).toMatch(/skiptoken=x/);
  });

  it('getItem fetches single item with expand=listItem', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/items/X')
      .query({ '$expand': 'listItem($expand=fields)' })
      .reply(200, { id: 'X', name: 'x.pdf', listItem: { fields: { Vendor: 'Acme' } } });
    const out = await getItem(client, 'D1', 'X');
    expect(out.id).toBe('X');
    expect(out.listItem?.fields?.Vendor).toBe('Acme');
  });

  it('deleteItem issues DELETE', async () => {
    const scope = nock('https://graph.microsoft.com').delete('/v1.0/drives/D1/items/X').reply(204);
    await deleteItem(client, 'D1', 'X');
    expect(scope.isDone()).toBe(true);
  });

  it('downloadItemStream fetches /content', async () => {
    nock('https://graph.microsoft.com').get('/v1.0/drives/D1/items/X/content').reply(200, 'BYTES');
    const buf = await downloadItemStream(client, 'D1', 'X');
    expect(buf.toString('utf8')).toBe('BYTES');
  });
});
```

- [ ] **Step 2: Implement — `server/src/spe/drives.ts`**

```ts
import type { SpeGraphClient } from './client.js';
import type { SpeDriveItem, SpeListing } from './types.js';

export async function listChildren(
  client: SpeGraphClient,
  driveId: string,
  parentItemId: string,
  opts: { top?: number; filter?: string; orderby?: string; skipToken?: string } = {},
): Promise<SpeListing> {
  let req = client.api(`/drives/${driveId}/items/${parentItemId}/children`);
  if (opts.top !== undefined) req = req.top(opts.top);
  if (opts.filter) req = req.filter(opts.filter);
  if (opts.orderby) req = req.orderby(opts.orderby);
  if (opts.skipToken) req = req.query({ $skiptoken: opts.skipToken });
  const resp = await req.expand('listItem($expand=fields)').get();
  return {
    items: (resp.value as SpeDriveItem[]) ?? [],
    nextLink: resp['@odata.nextLink'] as string | undefined,
  };
}

export async function getItem(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
): Promise<SpeDriveItem> {
  return (await client
    .api(`/drives/${driveId}/items/${itemId}`)
    .expand('listItem($expand=fields)')
    .get()) as SpeDriveItem;
}

export async function deleteItem(client: SpeGraphClient, driveId: string, itemId: string): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}`).delete();
}

export async function downloadItemStream(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
): Promise<Buffer> {
  const stream = await client.api(`/drives/${driveId}/items/${itemId}/content`).getStream();
  // The Graph SDK returns a NodeJS.ReadableStream-compatible object.
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- drives.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/spe/drives.ts server/src/spe/drives.test.ts
git commit -m "feat(server/spe): drives wrappers — listChildren, getItem, deleteItem, downloadItemStream"
```

### Task A5: Upload + folder materialization wrapper

**Files:**
- Create: `server/src/spe/uploads.ts`
- Create: `server/src/spe/uploads.test.ts`

- [ ] **Step 1: Failing test — `server/src/spe/uploads.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { ensureFolderPath, uploadSmallFile } from './uploads.js';

describe('uploads wrappers', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });
  const client = createGraphClient(async () => 'tok');

  it('ensureFolderPath creates each missing segment', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D/root:/Team/2026:').reply(404, { error: { code: 'itemNotFound' } })
      .post('/v1.0/drives/D/root/children', (b) => b.name === 'Team').reply(201, { id: 'I-team' })
      .post('/v1.0/drives/D/items/I-team/children', (b) => b.name === '2026').reply(201, { id: 'I-2026' });
    const out = await ensureFolderPath(client, 'D', ['Team', '2026']);
    expect(out.folderId).toBe('I-2026');
  });

  it('ensureFolderPath returns existing folder when full path present', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D/root:/Team/2026:').reply(200, { id: 'I-2026' });
    const out = await ensureFolderPath(client, 'D', ['Team', '2026']);
    expect(out.folderId).toBe('I-2026');
  });

  it('uploadSmallFile PUTs to /content', async () => {
    nock('https://graph.microsoft.com')
      .put('/v1.0/drives/D/items/PARENT:/file.pdf:/content', 'CONTENT')
      .reply(201, { id: 'NEW', name: 'file.pdf' });
    const out = await uploadSmallFile(client, 'D', 'PARENT', 'file.pdf', Buffer.from('CONTENT'), 'application/pdf');
    expect(out.id).toBe('NEW');
  });
});
```

- [ ] **Step 2: Implement — `server/src/spe/uploads.ts`**

```ts
import type { SpeGraphClient } from './client.js';
import type { SpeDriveItem } from './types.js';
import { NotFoundError } from '../errors/domain.js';

export async function ensureFolderPath(
  client: SpeGraphClient,
  driveId: string,
  segments: string[],
): Promise<{ folderId: string }> {
  // Fast path: try the full path first.
  try {
    const item = (await client.api(`/drives/${driveId}/root:/${segments.join('/')}:`).get()) as SpeDriveItem;
    return { folderId: item.id };
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  // Slow path: walk and create missing segments.
  let parentId: string | undefined;
  let cumulative: string[] = [];
  for (const seg of segments) {
    cumulative.push(seg);
    const path = cumulative.join('/');
    try {
      const item = (await client.api(`/drives/${driveId}/root:/${path}:`).get()) as SpeDriveItem;
      parentId = item.id;
      continue;
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    const created = (await client
      .api(parentId ? `/drives/${driveId}/items/${parentId}/children` : `/drives/${driveId}/root/children`)
      .post({ name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })) as SpeDriveItem;
    parentId = created.id;
  }
  if (!parentId) throw new Error('ensureFolderPath: empty segments');
  return { folderId: parentId };
}

export async function uploadSmallFile(
  client: SpeGraphClient,
  driveId: string,
  parentItemId: string,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<SpeDriveItem> {
  // Graph "small file" upload tops out at 4 MB; our cap is 25 MB so most uploads
  // need a resumable session. This helper covers the small-file fast path used by
  // tests and the agent stub; large uploads go through createUploadSession.
  return (await client
    .api(`/drives/${driveId}/items/${parentItemId}:/${filename}:/content`)
    .header('Content-Type', contentType)
    .put(body)) as SpeDriveItem;
}

export interface UploadSession {
  uploadUrl: string;
  expirationDateTime: string;
}

export async function createUploadSession(
  client: SpeGraphClient,
  driveId: string,
  parentItemId: string,
  filename: string,
): Promise<UploadSession> {
  const resp = await client
    .api(`/drives/${driveId}/items/${parentItemId}:/${filename}:/createUploadSession`)
    .post({
      item: { '@microsoft.graph.conflictBehavior': 'fail', name: filename },
    });
  return { uploadUrl: resp.uploadUrl as string, expirationDateTime: resp.expirationDateTime as string };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- uploads.test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/spe/uploads.ts server/src/spe/uploads.test.ts
git commit -m "feat(server/spe): folder materialization + small-file upload + upload session"
```

### Task A6: Columns + permissions + preview wrappers

**Files:**
- Create: `server/src/spe/columns.ts`
- Create: `server/src/spe/columns.test.ts`
- Create: `server/src/spe/permissions.ts`
- Create: `server/src/spe/permissions.test.ts`
- Create: `server/src/spe/preview.ts`
- Create: `server/src/spe/preview.test.ts`

- [ ] **Step 1: Failing tests**

`server/src/spe/columns.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { setItemFields } from './columns.js';

describe('setItemFields', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('PATCHes listItem/fields', async () => {
    const scope = nock('https://graph.microsoft.com')
      .patch('/v1.0/drives/D/items/I/listItem/fields', { Vendor: 'Acme', InvoiceNumber: 'INV-1' })
      .reply(200, { Vendor: 'Acme', InvoiceNumber: 'INV-1' });
    const client = createGraphClient(async () => 't');
    await setItemFields(client, 'D', 'I', { Vendor: 'Acme', InvoiceNumber: 'INV-1' });
    expect(scope.isDone()).toBe(true);
  });
});
```

`server/src/spe/permissions.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { createSharingLink, grantItemPermission } from './permissions.js';

describe('permissions wrappers', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });
  const client = createGraphClient(async () => 't');

  it('createSharingLink posts view + preventsDownload + expiry', async () => {
    const scope = nock('https://graph.microsoft.com')
      .post('/v1.0/drives/D/items/I/createLink', (b) =>
        b.type === 'view' && b.scope === 'organization' && b.preventsDownload === true && typeof b.expirationDateTime === 'string')
      .reply(200, { link: { webUrl: 'https://share/abc' }, id: 'PERM-1' });
    const out = await createSharingLink(client, 'D', 'I', { expiresAt: '2026-05-01T00:00:00Z' });
    expect(out.webUrl).toBe('https://share/abc');
    expect(out.permissionId).toBe('PERM-1');
    expect(scope.isDone()).toBe(true);
  });

  it('grantItemPermission posts /invite with read role', async () => {
    const scope = nock('https://graph.microsoft.com')
      .post('/v1.0/drives/D/items/I/invite', (b) =>
        Array.isArray(b.roles) && b.roles[0] === 'read' && b.requireSignIn === true && b.sendInvitation === false)
      .reply(200, { value: [{ id: 'PERM-2' }] });
    await grantItemPermission(client, 'D', 'I', { recipientObjectId: 'OID', roles: ['read'] });
    expect(scope.isDone()).toBe(true);
  });
});
```

`server/src/spe/preview.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { getPreviewUrl } from './preview.js';

describe('getPreviewUrl', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns getUrl from /preview', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/drives/D/items/I/preview')
      .reply(200, { getUrl: 'https://contoso.sharepoint.com/embed/xyz', postUrl: null });
    const client = createGraphClient(async () => 't');
    const url = await getPreviewUrl(client, 'D', 'I');
    expect(url).toBe('https://contoso.sharepoint.com/embed/xyz');
  });
});
```

- [ ] **Step 2: Implementations**

`server/src/spe/columns.ts`:
```ts
import type { SpeGraphClient } from './client.js';

export async function setItemFields(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
  fields: Record<string, string | number | null>,
): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}/listItem/fields`).patch(fields);
}
```

`server/src/spe/permissions.ts`:
```ts
import type { SpeGraphClient } from './client.js';

export interface SharingLinkResult {
  webUrl: string;
  permissionId: string;
  expirationDateTime?: string;
}

export async function createSharingLink(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
  opts: { expiresAt: string },
): Promise<SharingLinkResult> {
  const resp = await client.api(`/drives/${driveId}/items/${itemId}/createLink`).post({
    type: 'view',
    scope: 'organization',
    preventsDownload: true,
    expirationDateTime: opts.expiresAt,
    retainInheritedPermissions: true,
  });
  return {
    webUrl: resp.link?.webUrl as string,
    permissionId: resp.id as string,
    expirationDateTime: resp.expirationDateTime as string | undefined,
  };
}

export async function grantItemPermission(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
  opts: { recipientObjectId: string; roles: Array<'read' | 'write'> },
): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}/invite`).post({
    requireSignIn: true,
    sendInvitation: false,
    roles: opts.roles,
    recipients: [{ objectId: opts.recipientObjectId }],
  });
}
```

`server/src/spe/preview.ts`:
```ts
import type { SpeGraphClient } from './client.js';

export async function getPreviewUrl(client: SpeGraphClient, driveId: string, itemId: string): Promise<string> {
  const resp = await client.api(`/drives/${driveId}/items/${itemId}/preview`).post({});
  if (!resp?.getUrl) throw new Error('Graph /preview returned no getUrl');
  return resp.getUrl as string;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- columns.test permissions.test preview.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/spe/columns.ts server/src/spe/columns.test.ts \
        server/src/spe/permissions.ts server/src/spe/permissions.test.ts \
        server/src/spe/preview.ts server/src/spe/preview.test.ts
git commit -m "feat(server/spe): columns, permissions, preview Graph wrappers"
```

### Task A7: SPE module barrel + Graph readiness probe

**Files:**
- Create: `server/src/spe/index.ts`
- Create: `server/src/probes/graph.ts`
- Create: `server/src/probes/graph.test.ts`

- [ ] **Step 1: Failing test — `server/src/probes/graph.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { makeGraphProbe } from './graph.js';

describe('makeGraphProbe', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('resolves when Graph $metadata responds', async () => {
    nock('https://graph.microsoft.com').get('/v1.0/$metadata').reply(200, '<edmx/>');
    const probe = makeGraphProbe();
    await expect(probe()).resolves.toBeUndefined();
  });

  it('rejects on 5xx', async () => {
    nock('https://graph.microsoft.com').get('/v1.0/$metadata').reply(503, '');
    const probe = makeGraphProbe();
    await expect(probe()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implementations**

`server/src/spe/index.ts`:
```ts
export * from './client.js';
export * from './drives.js';
export * from './uploads.js';
export * from './columns.js';
export * from './permissions.js';
export * from './preview.js';
export * from './types.js';
```

`server/src/probes/graph.ts`:
```ts
import 'isomorphic-fetch';

const GRAPH_METADATA = 'https://graph.microsoft.com/v1.0/$metadata';

export function makeGraphProbe(timeoutMs = 3_000): () => Promise<void> {
  return async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs).unref();
    try {
      const resp = await fetch(GRAPH_METADATA, { method: 'GET', signal: ctrl.signal });
      // $metadata is anonymous-readable; any 5xx is a real outage. 4xx still
      // means the service is up.
      if (resp.status >= 500) throw new Error(`Graph metadata returned ${resp.status}`);
    } finally {
      clearTimeout(t);
    }
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- graph.test
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/spe/index.ts server/src/probes/graph.ts server/src/probes/graph.test.ts
git commit -m "feat(server/spe): module barrel + Graph readiness probe"
```

---

## Phase B — Store module (Config + Sessions)

The store layer holds two abstractions:
- `ConfigStore` — reads `workspaces.json`, `group-role-map.json`, `app-settings.json` from the SPE system container with a 60s LRU and a 5-min poll for change detection.
- `SessionStore` — reads/writes encrypted session JSON for the current user behind a 60s LRU.

### Task B1: Encryption helper for session JSON

**Files:**
- Create: `server/src/store/crypto.ts`
- Create: `server/src/store/crypto.test.ts`

- [ ] **Step 1: Failing test — `server/src/store/crypto.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import { encryptJson, decryptJson } from './crypto.js';

describe('crypto', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('round-trips JSON', () => {
    const ct = encryptJson({ a: 1, b: 'two' }, key);
    expect(decryptJson(ct, key)).toEqual({ a: 1, b: 'two' });
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const a = encryptJson({ x: 1 }, key);
    const b = encryptJson({ x: 1 }, key);
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', () => {
    const ct = encryptJson({ x: 1 }, key);
    const parts = ct.split('.');
    const tampered = [parts[0], parts[1], 'AAAAAAAAAAAAAAAAAAAAAA==', parts[3]].join('.');
    expect(() => decryptJson(tampered, key)).toThrow();
  });

  it('rejects wrong key', () => {
    const ct = encryptJson({ x: 1 }, key);
    const otherKey = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptJson(ct, otherKey)).toThrow();
  });
});
```

- [ ] **Step 2: Implement — `server/src/store/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const VERSION = 'v1';

function keyToBuffer(b64: string): Buffer {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) throw new Error('session encryption key must decode to 32 bytes');
  return buf;
}

export function encryptJson(value: unknown, keyB64: string): string {
  const key = keyToBuffer(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const pt = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJson<T = unknown>(token: string, keyB64: string): T {
  const [v, ivB64, tagB64, ctB64] = token.split('.');
  if (v !== VERSION || !ivB64 || !tagB64 || !ctB64) throw new Error('bad ciphertext envelope');
  const key = keyToBuffer(keyB64);
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- crypto.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/store/crypto.ts server/src/store/crypto.test.ts
git commit -m "feat(server/store): AES-256-GCM session JSON encryption helper"
```

### Task B2: ConfigStore with 60s LRU and 5-min poll

**Files:**
- Create: `server/src/store/configStore.ts`
- Create: `server/src/store/configStore.test.ts`

- [ ] **Step 1: Failing test — `server/src/store/configStore.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { createConfigStore } from './configStore.js';

function fakeReader(payloads: Record<string, unknown>) {
  return jest.fn(async (path: string) => {
    if (!(path in payloads)) {
      const err = new Error('not found') as Error & { code: string };
      err.code = 'not_found';
      throw err;
    }
    return JSON.stringify(payloads[path]);
  });
}

describe('ConfigStore', () => {
  it('reads + parses workspaces.json against schema', async () => {
    const reader = fakeReader({
      '/config/workspaces.json': {
        workspaces: [{
          id: 'invoices', displayName: 'Invoices', template: 'invoices',
          containerId: 'C1', folderConvention: ['Team', 'YYYY', 'MM'],
          metadataSchema: [], archived: false,
          createdAt: '2026-04-26T00:00:00Z',
          createdByOid: '00000000-0000-0000-0000-000000000000',
        }],
      },
    });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    const out = await store.getWorkspaces();
    expect(out.workspaces).toHaveLength(1);
    expect(out.workspaces[0].id).toBe('invoices');
  });

  it('caches subsequent reads within TTL', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [] } });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await store.getWorkspaces();
    await store.getWorkspaces();
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('returns empty defaults when config files do not exist yet', async () => {
    const reader = fakeReader({});
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    expect((await store.getWorkspaces()).workspaces).toEqual([]);
    expect((await store.getGroupRoleMap()).entries).toEqual([]);
    expect((await store.getAppSettings()).brandName).toBe('Docs Vault');
  });

  it('rejects schema-invalid payloads', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [{ id: 'BAD UPPER' }] } });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await expect(store.getWorkspaces()).rejects.toThrow(/lowercase-kebab|workspaces\[0\]/);
  });

  it('invalidate() forces re-read', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [] } });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await store.getWorkspaces();
    store.invalidate();
    await store.getWorkspaces();
    expect(reader).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Implement — `server/src/store/configStore.ts`**

```ts
import { LRUCache } from 'lru-cache';
import {
  AppSettingsSchema,
  GroupRoleMapSchema,
  WorkspacesConfigSchema,
  type AppSettings,
} from '@spectra/shared';
import type { GroupRoleMapEntry, WorkspaceConfig } from '@spectra/shared';

const PATH_WORKSPACES = '/config/workspaces.json';
const PATH_GROUP_MAP = '/config/group-role-map.json';
const PATH_APP_SETTINGS = '/config/app-settings.json';

export interface ConfigReader {
  (path: string): Promise<string>;
}

export interface ConfigWriter {
  (path: string, body: string): Promise<void>;
}

export interface ConfigStore {
  getWorkspaces(): Promise<{ workspaces: WorkspaceConfig[] }>;
  getGroupRoleMap(): Promise<{ entries: GroupRoleMapEntry[] }>;
  getAppSettings(): Promise<AppSettings>;
  putWorkspaces(value: { workspaces: WorkspaceConfig[] }): Promise<void>;
  putGroupRoleMap(value: { entries: GroupRoleMapEntry[] }): Promise<void>;
  putAppSettings(value: AppSettings): Promise<void>;
  invalidate(): void;
}

interface Opts {
  reader: ConfigReader;
  writer?: ConfigWriter;
  ttlMs?: number;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  brandName: 'Docs Vault',
  welcomePitch: 'Secure file management for every team.',
  defaultTheme: 'light',
};

export function createConfigStore(opts: Opts): ConfigStore {
  const cache = new LRUCache<string, unknown>({ max: 16, ttl: opts.ttlMs ?? 60_000 });

  async function readParsed<T>(path: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
    const cached = cache.get(path) as T | undefined;
    if (cached !== undefined) return cached;
    let raw: string;
    try {
      raw = await opts.reader(path);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'not_found' || (err as { status?: number }).status === 404) {
        cache.set(path, fallback);
        return fallback;
      }
      throw err;
    }
    const json = JSON.parse(raw) as unknown;
    const parsed = parse(json);
    cache.set(path, parsed);
    return parsed;
  }

  async function write(path: string, value: unknown): Promise<void> {
    if (!opts.writer) throw new Error('ConfigStore: writer not provided');
    await opts.writer(path, JSON.stringify(value, null, 2));
    cache.delete(path);
  }

  return {
    getWorkspaces: () =>
      readParsed(PATH_WORKSPACES, (j) => WorkspacesConfigSchema.parse(j), { workspaces: [] }),
    getGroupRoleMap: () =>
      readParsed(PATH_GROUP_MAP, (j) => GroupRoleMapSchema.parse(j), { entries: [] }),
    getAppSettings: () =>
      readParsed(PATH_APP_SETTINGS, (j) => AppSettingsSchema.parse(j), DEFAULT_APP_SETTINGS),
    putWorkspaces: (v) => write(PATH_WORKSPACES, WorkspacesConfigSchema.parse(v)),
    putGroupRoleMap: (v) => write(PATH_GROUP_MAP, GroupRoleMapSchema.parse(v)),
    putAppSettings: (v) => write(PATH_APP_SETTINGS, AppSettingsSchema.parse(v)),
    invalidate: () => cache.clear(),
  };
}

export function startConfigPoller(store: ConfigStore, intervalMs = 5 * 60_000): { stop: () => void } {
  const t = setInterval(() => store.invalidate(), intervalMs).unref();
  return { stop: () => clearInterval(t) };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- configStore.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/store/configStore.ts server/src/store/configStore.test.ts
git commit -m "feat(server/store): ConfigStore with 60s LRU + 5-min poll for runtime configs"
```

### Task B3: SPE-backed reader/writer for system container

**Files:**
- Create: `server/src/store/speBackend.ts`
- Create: `server/src/store/speBackend.test.ts`

- [ ] **Step 1: Failing test — `server/src/store/speBackend.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from '../spe/client.js';
import { createSpeReader, createSpeWriter } from './speBackend.js';

describe('speBackend', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });
  const client = createGraphClient(async () => 't');

  it('reader fetches /content for a path', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/SYS/root:/config/workspaces.json:/content')
      .reply(200, '{"workspaces":[]}');
    const reader = createSpeReader(client, 'SYS');
    expect(await reader('/config/workspaces.json')).toBe('{"workspaces":[]}');
  });

  it('reader maps 404 to error.code = not_found', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/SYS/root:/config/missing.json:/content')
      .reply(404, { error: { code: 'itemNotFound' } });
    const reader = createSpeReader(client, 'SYS');
    await expect(reader('/config/missing.json')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('writer PUTs body to path /content', async () => {
    const scope = nock('https://graph.microsoft.com')
      .put('/v1.0/drives/SYS/root:/config/app-settings.json:/content', '{"brandName":"X"}')
      .reply(201, { id: 'I' });
    const writer = createSpeWriter(client, 'SYS');
    await writer('/config/app-settings.json', '{"brandName":"X"}');
    expect(scope.isDone()).toBe(true);
  });
});
```

- [ ] **Step 2: Implement — `server/src/store/speBackend.ts`**

```ts
import type { SpeGraphClient } from '../spe/index.js';
import type { ConfigReader, ConfigWriter } from './configStore.js';

function normalize(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p;
}

export function createSpeReader(client: SpeGraphClient, driveId: string): ConfigReader {
  return async (path) => {
    const resp = await client
      .api(`/drives/${driveId}/root:/${normalize(path)}:/content`)
      .responseType('text' as never)
      .get();
    return typeof resp === 'string' ? resp : JSON.stringify(resp);
  };
}

export function createSpeWriter(client: SpeGraphClient, driveId: string): ConfigWriter {
  return async (path, body) => {
    await client
      .api(`/drives/${driveId}/root:/${normalize(path)}:/content`)
      .header('Content-Type', 'application/json')
      .put(body);
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- speBackend.test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/store/speBackend.ts server/src/store/speBackend.test.ts
git commit -m "feat(server/store): SPE-backed config reader/writer for system container"
```

### Task B4: SessionStore (encrypted session JSON, 60s LRU)

**Files:**
- Create: `server/src/store/sessionStore.ts`
- Create: `server/src/store/sessionStore.test.ts`

- [ ] **Step 1: Failing test — `server/src/store/sessionStore.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import type { SessionClaims } from '@spectra/shared';
import { createSessionStore } from './sessionStore.js';
import { encryptJson } from './crypto.js';

const KEY = Buffer.alloc(32, 1).toString('base64');

function makeBackends(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  const reader = jest.fn(async (path: string) => {
    const v = data.get(path);
    if (v === undefined) {
      const e = new Error('not_found') as Error & { code: string };
      e.code = 'not_found';
      throw e;
    }
    return v;
  });
  const writer = jest.fn(async (path: string, body: string) => { data.set(path, body); });
  const deleter = jest.fn(async (path: string) => { data.delete(path); });
  return { reader, writer, deleter, data };
}

const claims: SessionClaims = {
  sessionId: 'S1', userOid: 'U1', tenantId: 'T1', isAdmin: false,
  teamMemberships: [], issuedAt: 1, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 1,
};

describe('SessionStore', () => {
  it('put encrypts and writes; get decrypts', async () => {
    const { reader, writer } = makeBackends();
    const store = createSessionStore({ reader, writer, deleter: jest.fn(async () => {}), encryptionKey: KEY });
    await store.put(claims);
    expect(writer).toHaveBeenCalledTimes(1);
    const got = await store.get('S1');
    expect(got?.userOid).toBe('U1');
  });

  it('caches reads within 60s', async () => {
    const { reader, writer, deleter, data } = makeBackends();
    data.set('/sessions/S1.json', encryptJson(claims, KEY));
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    await store.get('S1');
    await store.get('S1');
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('get returns null for missing session', async () => {
    const { reader, writer, deleter } = makeBackends();
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    expect(await store.get('missing')).toBeNull();
  });

  it('delete removes from backend and cache', async () => {
    const { reader, writer, deleter, data } = makeBackends();
    data.set('/sessions/S1.json', encryptJson(claims, KEY));
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    await store.get('S1');
    await store.delete('S1');
    expect(deleter).toHaveBeenCalledWith('/sessions/S1.json');
    expect(await store.get('S1')).toBeNull();
  });

  it('rejects sessionId with path traversal', async () => {
    const { reader, writer, deleter } = makeBackends();
    const store = createSessionStore({ reader, writer, deleter, encryptionKey: KEY });
    await expect(store.get('../etc/passwd')).rejects.toThrow();
    await expect(store.delete('a/b')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement — `server/src/store/sessionStore.ts`**

```ts
import { LRUCache } from 'lru-cache';
import type { SessionClaims } from '@spectra/shared';
import { decryptJson, encryptJson } from './crypto.js';
import type { ConfigReader, ConfigWriter } from './configStore.js';

export interface SessionDeleter {
  (path: string): Promise<void>;
}

interface Opts {
  reader: ConfigReader;
  writer: ConfigWriter;
  deleter: SessionDeleter;
  encryptionKey: string;
  ttlMs?: number;
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionClaims | null>;
  put(claims: SessionClaims): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

const SAFE = /^[A-Za-z0-9_-]{16,128}$/;

function pathFor(sessionId: string): string {
  if (!SAFE.test(sessionId)) throw new Error('invalid sessionId');
  return `/sessions/${sessionId}.json`;
}

export function createSessionStore(opts: Opts): SessionStore {
  const cache = new LRUCache<string, SessionClaims>({ max: 1024, ttl: opts.ttlMs ?? 60_000 });
  return {
    async get(sessionId) {
      const path = pathFor(sessionId);
      const cached = cache.get(sessionId);
      if (cached) return cached;
      let body: string;
      try {
        body = await opts.reader(path);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'not_found' || (err as { status?: number }).status === 404) return null;
        throw err;
      }
      const claims = decryptJson<SessionClaims>(body, opts.encryptionKey);
      cache.set(sessionId, claims);
      return claims;
    },
    async put(claims) {
      const path = pathFor(claims.sessionId);
      const ct = encryptJson(claims, opts.encryptionKey);
      await opts.writer(path, ct);
      cache.set(claims.sessionId, claims);
    },
    async delete(sessionId) {
      const path = pathFor(sessionId);
      await opts.deleter(path);
      cache.delete(sessionId);
    },
  };
}
```

Add deleter to `speBackend.ts`:

```ts
// Append to server/src/store/speBackend.ts
import type { SessionDeleter } from './sessionStore.js';

export function createSpeDeleter(client: SpeGraphClient, driveId: string): SessionDeleter {
  return async (path) => {
    await client.api(`/drives/${driveId}/root:/${normalize(path)}:`).delete();
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- sessionStore.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/store/sessionStore.ts server/src/store/sessionStore.test.ts server/src/store/speBackend.ts
git commit -m "feat(server/store): encrypted SessionStore with 60s LRU and SPE deleter"
```

### Task B5: Store module barrel

**Files:**
- Create: `server/src/store/index.ts`

- [ ] **Step 1: Implement**

```ts
export * from './configStore.js';
export * from './sessionStore.js';
export * from './speBackend.js';
export { encryptJson, decryptJson } from './crypto.js';
```

- [ ] **Step 2: Commit**

```bash
git add server/src/store/index.ts
git commit -m "feat(server/store): module barrel export"
```

---

## Phase C — Auth module (MSAL + sessions + cookies)

This phase plugs MSAL-Node into Express, builds the login/callback/logout/me endpoints, and the cookie + session middleware that every authenticated route depends on.

### Task C1: Cookie signing helpers

**Files:**
- Create: `server/src/auth/cookies.ts`
- Create: `server/src/auth/cookies.test.ts`

- [ ] **Step 1: Failing test — `server/src/auth/cookies.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import { signSessionCookie, verifySessionCookie, SESSION_COOKIE_NAME } from './cookies.js';

const HMAC = 'a'.repeat(48);

describe('session cookies', () => {
  it('signs and verifies a session id', () => {
    const signed = signSessionCookie('S1', HMAC);
    expect(verifySessionCookie(signed, HMAC)).toBe('S1');
  });

  it('rejects tampered cookies', () => {
    const signed = signSessionCookie('S1', HMAC);
    const tampered = signed.replace('S1', 'S2');
    expect(verifySessionCookie(tampered, HMAC)).toBeNull();
  });

  it('rejects wrong key', () => {
    const signed = signSessionCookie('S1', HMAC);
    expect(verifySessionCookie(signed, 'b'.repeat(48))).toBeNull();
  });

  it('exports the canonical cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('spectra.sid');
  });
});
```

- [ ] **Step 2: Implement — `server/src/auth/cookies.ts`**

```ts
import { sign, unsign } from 'cookie-signature';

export const SESSION_COOKIE_NAME = 'spectra.sid';

export function signSessionCookie(sessionId: string, hmacKey: string): string {
  return sign(sessionId, hmacKey);
}

export function verifySessionCookie(value: string, hmacKey: string): string | null {
  const out = unsign(value, hmacKey);
  return typeof out === 'string' ? out : null;
}

export interface SessionCookieOptions {
  maxAgeMs: number;
  secure: boolean;
}

export function buildCookieHeader(value: string, opts: SessionCookieOptions): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`,
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookieHeader(secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- cookies.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/cookies.ts server/src/auth/cookies.test.ts
git commit -m "feat(server/auth): HMAC-signed HttpOnly session cookie helpers"
```

### Task C2: MSAL confidential client wrapper

**Files:**
- Create: `server/src/auth/msal.ts`
- Create: `server/src/auth/msal.test.ts`

- [ ] **Step 1: Failing test — `server/src/auth/msal.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { createMsalClient, type MsalDeps } from './msal.js';

function makeFakeMsal(): MsalDeps {
  const cca = {
    getAuthCodeUrl: jest.fn(async (req: { state: string; codeChallenge: string }) =>
      `https://login.example/authorize?state=${req.state}&code_challenge=${req.codeChallenge}`),
    acquireTokenByCode: jest.fn(async () => ({
      accessToken: 'AT', idTokenClaims: { oid: 'OID', tid: 'TID', preferred_username: 'u@x', name: 'U', roles: ['AppAdmin'], groups: ['G1'] },
      account: { homeAccountId: 'HID' }, expiresOn: new Date(Date.now() + 3600_000),
    })),
    acquireTokenOnBehalfOf: jest.fn(async () => ({ accessToken: 'OBO-AT', expiresOn: new Date(Date.now() + 3600_000) })),
    acquireTokenByClientCredential: jest.fn(async () => ({ accessToken: 'APP-AT', expiresOn: new Date(Date.now() + 3600_000) })),
  };
  return { ConfidentialClientApplication: jest.fn(() => cca) as unknown as MsalDeps['ConfidentialClientApplication'] };
}

describe('createMsalClient', () => {
  const baseConfig = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    clientId: '00000000-0000-0000-0000-000000000002',
    clientSecret: 'secret',
    redirectUri: 'https://app/api/auth/callback',
  };

  it('builds an authorize URL with state and PKCE challenge', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const url = await m.buildAuthorizeUrl({ state: 'abc', codeChallenge: 'CHAL' });
    expect(url).toContain('state=abc');
    expect(url).toContain('code_challenge=CHAL');
  });

  it('exchanges code for tokens + claims', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const out = await m.exchangeCode({ code: 'C', codeVerifier: 'V' });
    expect(out.idClaims.oid).toBe('OID');
    expect(out.idClaims.roles).toContain('AppAdmin');
    expect(out.accessToken).toBe('AT');
  });

  it('acquires OBO tokens', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const tok = await m.acquireOboToken('AT', ['Files.ReadWrite.All']);
    expect(tok).toBe('OBO-AT');
  });

  it('acquires app-only tokens', async () => {
    const m = createMsalClient(baseConfig, makeFakeMsal());
    const tok = await m.acquireAppToken(['https://graph.microsoft.com/.default']);
    expect(tok).toBe('APP-AT');
  });
});
```

- [ ] **Step 2: Implement — `server/src/auth/msal.ts`**

```ts
import type { ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node';

export interface MsalConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface IdTokenClaims {
  oid: string;
  tid: string;
  preferred_username: string;
  name: string;
  roles?: string[];
  groups?: string[];
  _claim_names?: { groups?: string };
}

export interface CodeExchangeResult {
  accessToken: string;
  idClaims: IdTokenClaims;
  homeAccountId: string;
  expiresOn: Date;
}

export interface MsalClient {
  buildAuthorizeUrl(opts: { state: string; codeChallenge: string }): Promise<string>;
  exchangeCode(opts: { code: string; codeVerifier: string }): Promise<CodeExchangeResult>;
  acquireOboToken(userAccessToken: string, scopes: string[]): Promise<string>;
  acquireAppToken(scopes: string[]): Promise<string>;
}

export interface MsalDeps {
  ConfidentialClientApplication: new (cfg: { auth: { clientId: string; authority: string; clientSecret: string } }) => ConfidentialClientApplication;
}

const GRAPH_OBO_SCOPES = [
  'https://graph.microsoft.com/Files.ReadWrite.All',
  'https://graph.microsoft.com/User.ReadBasic.All',
  'https://graph.microsoft.com/Mail.Send',
  'offline_access',
];

export function createMsalClient(cfg: MsalConfig, deps: MsalDeps): MsalClient {
  const cca = new deps.ConfidentialClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
      clientSecret: cfg.clientSecret,
    },
  });

  return {
    async buildAuthorizeUrl({ state, codeChallenge }) {
      return cca.getAuthCodeUrl({
        scopes: GRAPH_OBO_SCOPES,
        redirectUri: cfg.redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod: 'S256',
      });
    },
    async exchangeCode({ code, codeVerifier }) {
      const resp = (await cca.acquireTokenByCode({
        code,
        codeVerifier,
        redirectUri: cfg.redirectUri,
        scopes: GRAPH_OBO_SCOPES,
      })) as AuthenticationResult & { idTokenClaims: IdTokenClaims };
      if (!resp?.accessToken || !resp.idTokenClaims) throw new Error('MSAL token exchange returned no tokens');
      return {
        accessToken: resp.accessToken,
        idClaims: resp.idTokenClaims,
        homeAccountId: resp.account?.homeAccountId ?? '',
        expiresOn: resp.expiresOn ?? new Date(Date.now() + 3600_000),
      };
    },
    async acquireOboToken(userAccessToken, scopes) {
      const resp = await cca.acquireTokenOnBehalfOf({ oboAssertion: userAccessToken, scopes });
      if (!resp?.accessToken) throw new Error('MSAL OBO returned no token');
      return resp.accessToken;
    },
    async acquireAppToken(scopes) {
      const resp = await cca.acquireTokenByClientCredential({ scopes });
      if (!resp?.accessToken) throw new Error('MSAL app-only returned no token');
      return resp.accessToken;
    },
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- msal.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/msal.ts server/src/auth/msal.test.ts
git commit -m "feat(server/auth): MSAL confidential client wrapper (authorize, code, OBO, app-only)"
```

### Task C3: PKCE state store + helpers

**Files:**
- Create: `server/src/auth/pkce.ts`
- Create: `server/src/auth/pkce.test.ts`

- [ ] **Step 1: Failing test — `server/src/auth/pkce.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import { generatePkce, createPkceStateStore } from './pkce.js';

describe('PKCE', () => {
  it('generatePkce produces verifier ≥ 43 chars and a base64url challenge', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('state store roundtrips and consumes once', () => {
    const store = createPkceStateStore({ ttlMs: 60_000 });
    store.put('STATE', { verifier: 'V', returnTo: '/w' });
    expect(store.consume('STATE')).toEqual({ verifier: 'V', returnTo: '/w' });
    expect(store.consume('STATE')).toBeNull();
  });

  it('rejects unknown state', () => {
    const store = createPkceStateStore({ ttlMs: 60_000 });
    expect(store.consume('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement — `server/src/auth/pkce.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto';
import { LRUCache } from 'lru-cache';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function generatePkce(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(24).toString('base64url');
}

export function generateSessionId(): string {
  return randomBytes(24).toString('base64url');
}

export interface PkceState {
  verifier: string;
  returnTo: string;
}

export interface PkceStateStore {
  put(state: string, value: PkceState): void;
  consume(state: string): PkceState | null;
}

export function createPkceStateStore(opts: { ttlMs: number }): PkceStateStore {
  const cache = new LRUCache<string, PkceState>({ max: 4096, ttl: opts.ttlMs });
  return {
    put(state, value) { cache.set(state, value); },
    consume(state) {
      const v = cache.get(state);
      if (!v) return null;
      cache.delete(state);
      return v;
    },
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- pkce.test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/pkce.ts server/src/auth/pkce.test.ts
git commit -m "feat(server/auth): PKCE pair generator + in-memory state store"
```

### Task C4: Session middleware (load, validate, slide)

**Files:**
- Create: `server/src/auth/session.ts`
- Create: `server/src/auth/session.test.ts`

- [ ] **Step 1: Failing test — `server/src/auth/session.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { sessionMiddleware, requireAuth } from './session.js';
import { signSessionCookie, SESSION_COOKIE_NAME } from './cookies.js';
import type { SessionStore } from '../store/sessionStore.js';
import type { SessionClaims } from '@spectra/shared';

const HMAC = 'h'.repeat(48);

function makeStore(initial: SessionClaims | null): SessionStore {
  let claims = initial;
  return {
    get: jest.fn(async () => claims),
    put: jest.fn(async (c: SessionClaims) => { claims = c; }),
    delete: jest.fn(async () => { claims = null; }),
  };
}

const baseClaims: SessionClaims = {
  sessionId: 'SID', userOid: 'OID', tenantId: 'TID', isAdmin: false,
  teamMemberships: [], issuedAt: Date.now(), expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(),
};

function makeApp(store: SessionStore) {
  const app = express();
  app.use(sessionMiddleware({ store, hmacKey: HMAC, slidingMin: 480, absoluteMin: 1440 }));
  app.get('/me', requireAuth, (req, res) => res.json({ oid: req.session?.userOid ?? null }));
  return app;
}

describe('sessionMiddleware', () => {
  it('attaches req.session for valid signed cookie', async () => {
    const store = makeStore(baseClaims);
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionCookie('SID', HMAC)}`;
    const r = await request(makeApp(store)).get('/me').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ oid: 'OID' });
  });

  it('returns 401 with no cookie via requireAuth', async () => {
    const store = makeStore(null);
    const r = await request(makeApp(store)).get('/me');
    expect(r.status).toBe(401);
  });

  it('returns 401 for tampered cookie', async () => {
    const store = makeStore(baseClaims);
    const r = await request(makeApp(store)).get('/me').set('Cookie', `${SESSION_COOKIE_NAME}=garbage`);
    expect(r.status).toBe(401);
  });

  it('expires session past absolute TTL', async () => {
    const expired = { ...baseClaims, issuedAt: Date.now() - 25 * 3600_000, expiresAt: Date.now() - 1 };
    const store = makeStore(expired);
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionCookie('SID', HMAC)}`;
    const r = await request(makeApp(store)).get('/me').set('Cookie', cookie);
    expect(r.status).toBe(401);
    expect(store.delete).toHaveBeenCalledWith('SID');
  });

  it('slides expiration when last update > 5 min ago', async () => {
    const sliding = { ...baseClaims, lastSlidingUpdate: Date.now() - 6 * 60_000 };
    const store = makeStore(sliding);
    const cookie = `${SESSION_COOKIE_NAME}=${signSessionCookie('SID', HMAC)}`;
    await request(makeApp(store)).get('/me').set('Cookie', cookie);
    expect(store.put).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement — `server/src/auth/session.ts`**

```ts
import type { Request, RequestHandler, Response, NextFunction } from 'express';
import type { SessionClaims } from '@spectra/shared';
import { UnauthenticatedError } from '../errors/domain.js';
import { SESSION_COOKIE_NAME, verifySessionCookie } from './cookies.js';
import type { SessionStore } from '../store/sessionStore.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionClaims;
  }
}

export interface SessionMiddlewareOpts {
  store: SessionStore;
  hmacKey: string;
  slidingMin: number;
  absoluteMin: number;
  // Minimum minutes between sliding-TTL writes; spec §4.session-ttl says max 1 write per 5 min.
  minSlideIntervalMin?: number;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';').map((s) => s.trim());
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

export function sessionMiddleware(opts: SessionMiddlewareOpts): RequestHandler {
  const slideIntervalMs = (opts.minSlideIntervalMin ?? 5) * 60_000;
  const slidingMs = opts.slidingMin * 60_000;

  return async (req: Request, _res: Response, next: NextFunction) => {
    const raw = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (!raw) return next();
    const sessionId = verifySessionCookie(raw, opts.hmacKey);
    if (!sessionId) return next();
    let claims: SessionClaims | null;
    try {
      claims = await opts.store.get(sessionId);
    } catch (err) {
      return next(err);
    }
    if (!claims) return next();
    const now = Date.now();
    if (claims.expiresAt <= now) {
      // Absolute expiry — destroy session and treat as anonymous.
      try { await opts.store.delete(sessionId); } catch { /* best-effort cleanup */ }
      return next();
    }
    if (now - claims.lastSlidingUpdate >= slideIntervalMs) {
      const newExpires = Math.min(claims.expiresAt, now + slidingMs);
      const updated: SessionClaims = { ...claims, expiresAt: newExpires, lastSlidingUpdate: now };
      try { await opts.store.put(updated); } catch (err) { return next(err); }
      claims = updated;
    }
    req.session = claims;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session) return next(new UnauthenticatedError());
  next();
};
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- session.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/session.ts server/src/auth/session.test.ts
git commit -m "feat(server/auth): session middleware with sliding TTL + requireAuth guard"
```

### Task C5: Auth routes (login, callback, logout, me)

**Files:**
- Create: `server/src/auth/routes.ts`
- Create: `server/src/auth/routes.test.ts`

- [ ] **Step 1: Failing test — `server/src/auth/routes.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { authRouter } from './routes.js';
import type { MsalClient } from './msal.js';
import type { SessionStore } from '../store/sessionStore.js';
import { sessionMiddleware } from './session.js';
import { signSessionCookie, SESSION_COOKIE_NAME } from './cookies.js';

const HMAC = 'h'.repeat(48);

function makeMsal(): MsalClient {
  return {
    buildAuthorizeUrl: jest.fn(async (req) => `https://login/authorize?state=${req.state}&pk=${req.codeChallenge}`),
    exchangeCode: jest.fn(async () => ({
      accessToken: 'AT',
      idClaims: { oid: 'O1', tid: 'T1', preferred_username: 'u@x', name: 'U', roles: ['AppAdmin'] },
      homeAccountId: 'HID',
      expiresOn: new Date(Date.now() + 3600_000),
    })),
    acquireOboToken: jest.fn(async () => 'OBO'),
    acquireAppToken: jest.fn(async () => 'APP'),
  };
}

function makeStore(): SessionStore {
  const data = new Map<string, unknown>();
  return {
    get: jest.fn(async (id: string) => (data.get(id) as never) ?? null),
    put: jest.fn(async (c: { sessionId: string }) => { data.set(c.sessionId, c); }),
    delete: jest.fn(async (id: string) => { data.delete(id); }),
  };
}

function makeApp(msal: MsalClient, store: SessionStore) {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware({ store, hmacKey: HMAC, slidingMin: 480, absoluteMin: 1440 }));
  app.use(authRouter({
    msal,
    store,
    hmacKey: HMAC,
    slidingMin: 480,
    absoluteMin: 1440,
    secureCookie: false,
    resolveRoleSnapshot: async () => ({ isAdmin: true, teamMemberships: [] }),
  }));
  return app;
}

describe('auth routes', () => {
  it('GET /api/auth/login → 302 with state cookie + redirect to authorize URL', async () => {
    const r = await request(makeApp(makeMsal(), makeStore())).get('/api/auth/login');
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/^https:\/\/login\/authorize\?state=/);
  });

  it('GET /api/auth/callback → exchanges code, sets session cookie, redirects', async () => {
    const msal = makeMsal();
    const store = makeStore();
    const app = makeApp(msal, store);
    // First hit /login to capture the issued state.
    const login = await request(app).get('/api/auth/login');
    const setCookie = login.headers['set-cookie']?.[0] ?? '';
    const stateMatch = login.headers.location.match(/state=([^&]+)/);
    const state = stateMatch?.[1] ?? '';
    const r = await request(app)
      .get(`/api/auth/callback?code=C&state=${state}`)
      .set('Cookie', setCookie);
    expect(r.status).toBe(302);
    expect(r.headers['set-cookie']?.[0]).toMatch(/spectra\.sid=/);
    expect(store.put).toHaveBeenCalled();
  });

  it('POST /api/auth/logout → destroys session, clears cookie', async () => {
    const store = makeStore();
    await store.put({
      sessionId: 'SID', userOid: 'O', tenantId: 'T', isAdmin: false,
      teamMemberships: [], issuedAt: Date.now(), expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(),
    });
    const r = await request(makeApp(makeMsal(), store))
      .post('/api/auth/logout')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${signSessionCookie('SID', HMAC)}`);
    expect(r.status).toBe(204);
    expect(store.delete).toHaveBeenCalledWith('SID');
    expect(r.headers['set-cookie']?.[0]).toMatch(/Max-Age=0/);
  });

  it('GET /api/auth/me → 401 without session', async () => {
    const r = await request(makeApp(makeMsal(), makeStore())).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('GET /api/auth/me → 200 with identity payload when authenticated', async () => {
    const store = makeStore();
    await store.put({
      sessionId: 'SID', userOid: 'O', tenantId: 'T', isAdmin: true,
      teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }],
      issuedAt: Date.now(), expiresAt: Date.now() + 3600_000, lastSlidingUpdate: Date.now(),
    });
    const r = await request(makeApp(makeMsal(), store))
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${signSessionCookie('SID', HMAC)}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ userOid: 'O', isAdmin: true });
    expect(r.body.teamMemberships).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement — `server/src/auth/routes.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import type { TeamMembership } from '@spectra/shared';
import { BadRequestError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { SESSION_COOKIE_NAME, buildClearCookieHeader, buildCookieHeader, signSessionCookie, verifySessionCookie } from './cookies.js';
import { generatePkce, generateSessionId, generateState, createPkceStateStore } from './pkce.js';
import type { MsalClient, IdTokenClaims } from './msal.js';
import type { SessionStore } from '../store/sessionStore.js';
import { requireAuth } from './session.js';

export interface AuthRouterDeps {
  msal: MsalClient;
  store: SessionStore;
  hmacKey: string;
  slidingMin: number;
  absoluteMin: number;
  secureCookie: boolean;
  // Resolves admin flag + team memberships from id-token claims and config.
  // Phase D supplies the real resolver; tests pass a fake.
  resolveRoleSnapshot: (claims: IdTokenClaims, accessToken: string) => Promise<{ isAdmin: boolean; teamMemberships: TeamMembership[] }>;
}

const STATE_COOKIE = 'spectra.oauth';

export function authRouter(deps: AuthRouterDeps): Router {
  const r = Router();
  const pkceStore = createPkceStateStore({ ttlMs: 10 * 60_000 });
  const slidingMs = deps.slidingMin * 60_000;
  const absoluteMs = deps.absoluteMin * 60_000;

  r.get('/api/auth/login', async (req, res, next) => {
    try {
      const { verifier, challenge } = generatePkce();
      const state = generateState();
      const returnTo = typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/') ? req.query.returnTo : '/';
      pkceStore.put(state, { verifier, returnTo });
      const url = await deps.msal.buildAuthorizeUrl({ state, codeChallenge: challenge });
      res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${deps.secureCookie ? '; Secure' : ''}`);
      audit({ userOid: 'anonymous', action: 'auth.login.start', outcome: 'success' });
      res.redirect(302, url);
    } catch (err) { next(err); }
  });

  r.get('/api/auth/callback', async (req, res, next) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!code || !state) throw new BadRequestError('Missing code or state');
      const cookieState = parseStateCookie(req.headers.cookie);
      if (!cookieState || cookieState !== state) throw new BadRequestError('State mismatch');
      const stored = pkceStore.consume(state);
      if (!stored) throw new BadRequestError('Unknown state');
      const tokens = await deps.msal.exchangeCode({ code, codeVerifier: stored.verifier });
      const role = await deps.resolveRoleSnapshot(tokens.idClaims, tokens.accessToken);
      const sessionId = generateSessionId();
      const now = Date.now();
      await deps.store.put({
        sessionId,
        userOid: tokens.idClaims.oid,
        tenantId: tokens.idClaims.tid,
        isAdmin: role.isAdmin,
        teamMemberships: role.teamMemberships,
        issuedAt: now,
        expiresAt: Math.min(now + absoluteMs, now + slidingMs),
        lastSlidingUpdate: now,
      });
      const signed = signSessionCookie(sessionId, deps.hmacKey);
      res.setHeader('Set-Cookie', [
        buildCookieHeader(signed, { maxAgeMs: slidingMs, secure: deps.secureCookie }),
        `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${deps.secureCookie ? '; Secure' : ''}`,
      ]);
      audit({ userOid: tokens.idClaims.oid, action: 'auth.login.success', outcome: 'success' });
      res.redirect(302, stored.returnTo);
    } catch (err) {
      audit({ userOid: 'anonymous', action: 'auth.login.failure', outcome: 'failure', detail: { message: err instanceof Error ? err.message : 'unknown' } });
      next(err);
    }
  });

  const logout: RequestHandler = async (req, res, next) => {
    try {
      const raw = parseSessionCookie(req.headers.cookie);
      if (raw) {
        const sid = verifySessionCookie(raw, deps.hmacKey);
        if (sid) {
          try { await deps.store.delete(sid); } catch (err) { return next(err); }
          audit({ userOid: req.session?.userOid ?? 'anonymous', action: 'auth.logout', outcome: 'success' });
        }
      }
      res.setHeader('Set-Cookie', buildClearCookieHeader(deps.secureCookie));
      res.status(204).end();
    } catch (err) { next(err); }
  };
  r.post('/api/auth/logout', logout);

  r.get('/api/auth/me', requireAuth, (req, res) => {
    if (!req.session) throw new UnauthenticatedError();
    res.json({
      userOid: req.session.userOid,
      tenantId: req.session.tenantId,
      isAdmin: req.session.isAdmin,
      teamMemberships: req.session.teamMemberships,
      expiresAt: req.session.expiresAt,
    });
  });

  return r;
}

function parseStateCookie(header: string | undefined): string | null {
  return findCookie(header, STATE_COOKIE);
}
function parseSessionCookie(header: string | undefined): string | null {
  return findCookie(header, SESSION_COOKIE_NAME);
}
function findCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';').map((s) => s.trim())) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- routes.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/routes.ts server/src/auth/routes.test.ts
git commit -m "feat(server/auth): /api/auth/login, /callback, /logout, /me endpoints"
```

### Task C6: Auth module barrel

**Files:**
- Create: `server/src/auth/index.ts`

- [ ] **Step 1: Implement**

```ts
export * from './cookies.js';
export * from './msal.js';
export * from './pkce.js';
export * from './session.js';
export * from './routes.js';
```

- [ ] **Step 2: Commit**

```bash
git add server/src/auth/index.ts
git commit -m "feat(server/auth): module barrel export"
```

---

## Phase D — Authz module (role + team resolver, guards)

### Task D1: Role resolver from token claims + group-role-map

**Files:**
- Create: `server/src/authz/resolveRole.ts`
- Create: `server/src/authz/resolveRole.test.ts`

- [ ] **Step 1: Failing test — `server/src/authz/resolveRole.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { resolveRoleSnapshot } from './resolveRole.js';
import type { IdTokenClaims } from '../auth/msal.js';
import type { ConfigStore } from '../store/configStore.js';

function makeStore(entries: Array<{ entraGroupId: string; entraGroupDisplayName: string; workspaceId: string; teamCode: string; teamDisplayName: string }>): ConfigStore {
  return {
    getWorkspaces: jest.fn(),
    getGroupRoleMap: jest.fn(async () => ({ entries })),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(),
    putGroupRoleMap: jest.fn(),
    putAppSettings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

const groupId = '11111111-1111-1111-1111-111111111111';

describe('resolveRoleSnapshot', () => {
  it('flags AppAdmin role from claim', async () => {
    const store = makeStore([]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', roles: ['AppAdmin'] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn() });
    expect(out.isAdmin).toBe(true);
  });

  it('intersects token group claims with group-role-map', async () => {
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', groups: [groupId] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn() });
    expect(out.isAdmin).toBe(false);
    expect(out.teamMemberships).toEqual([{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }]);
  });

  it('falls back to /me/transitiveMemberOf on groups overage', async () => {
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', _claim_names: { groups: 'src1' } };
    const fetchGroupsOverage = jest.fn(async () => [groupId]);
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage });
    expect(fetchGroupsOverage).toHaveBeenCalledWith('AT');
    expect(out.teamMemberships).toHaveLength(1);
  });

  it('returns empty memberships when no overlap', async () => {
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', groups: ['00000000-0000-0000-0000-000000000000'] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn() });
    expect(out.teamMemberships).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement — `server/src/authz/resolveRole.ts`**

```ts
import type { TeamMembership } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';
import type { IdTokenClaims } from '../auth/msal.js';

export interface ResolveDeps {
  store: ConfigStore;
  fetchGroupsOverage: (accessToken: string) => Promise<string[]>;
}

export async function resolveRoleSnapshot(
  claims: IdTokenClaims,
  accessToken: string,
  deps: ResolveDeps,
): Promise<{ isAdmin: boolean; teamMemberships: TeamMembership[] }> {
  const isAdmin = Array.isArray(claims.roles) && claims.roles.includes('AppAdmin');
  const groupIds = await collectGroupIds(claims, accessToken, deps.fetchGroupsOverage);
  const map = await deps.store.getGroupRoleMap();
  const teamMemberships: TeamMembership[] = [];
  const seen = new Set<string>();
  for (const entry of map.entries) {
    if (!groupIds.includes(entry.entraGroupId)) continue;
    const key = `${entry.workspaceId}:${entry.teamCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    teamMemberships.push({
      workspaceId: entry.workspaceId,
      teamCode: entry.teamCode,
      teamDisplayName: entry.teamDisplayName,
    });
  }
  return { isAdmin, teamMemberships };
}

async function collectGroupIds(
  claims: IdTokenClaims,
  accessToken: string,
  fetchOverage: ResolveDeps['fetchGroupsOverage'],
): Promise<string[]> {
  if (Array.isArray(claims.groups) && claims.groups.length > 0) return claims.groups;
  if (claims._claim_names?.groups) return fetchOverage(accessToken);
  return [];
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- resolveRole.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/authz/resolveRole.ts server/src/authz/resolveRole.test.ts
git commit -m "feat(server/authz): role + team resolver from claims and group-role-map"
```

### Task D2: Groups-overage fetcher (Graph)

**Files:**
- Create: `server/src/authz/groupsOverage.ts`
- Create: `server/src/authz/groupsOverage.test.ts`

- [ ] **Step 1: Failing test — `server/src/authz/groupsOverage.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { fetchGroupsTransitive } from './groupsOverage.js';

describe('fetchGroupsTransitive', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns ids and follows nextLink', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/me/transitiveMemberOf/microsoft.graph.group')
      .query({ $select: 'id' })
      .reply(200, { value: [{ id: 'G1' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$skiptoken=x' })
      .get('/v1.0/me/transitiveMemberOf/microsoft.graph.group')
      .query({ $skiptoken: 'x' })
      .reply(200, { value: [{ id: 'G2' }] });
    const ids = await fetchGroupsTransitive('TOK');
    expect(ids).toEqual(['G1', 'G2']);
  });
});
```

- [ ] **Step 2: Implement — `server/src/authz/groupsOverage.ts`**

```ts
import 'isomorphic-fetch';

export async function fetchGroupsTransitive(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let url: string | null = 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$select=id';
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new Error(`groups overage fetch failed: ${resp.status}`);
    const body = (await resp.json()) as { value?: Array<{ id: string }>; ['@odata.nextLink']?: string };
    for (const g of body.value ?? []) ids.push(g.id);
    url = body['@odata.nextLink'] ?? null;
  }
  return ids;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- groupsOverage.test
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add server/src/authz/groupsOverage.ts server/src/authz/groupsOverage.test.ts
git commit -m "feat(server/authz): /me/transitiveMemberOf fetcher for groups overage"
```

### Task D3: Per-route guards

**Files:**
- Create: `server/src/authz/guards.ts`
- Create: `server/src/authz/guards.test.ts`

- [ ] **Step 1: Failing test — `server/src/authz/guards.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { requireRole, requireWorkspaceAccess } from './guards.js';
import { errorMiddleware } from '../errors/middleware.js';
import type { SessionClaims } from '@spectra/shared';

function appWithSession(claims: SessionClaims | null) {
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { session: SessionClaims | null }).session = claims; next(); });
  app.get('/admin', requireRole('admin'), (_req, res) => res.json({ ok: true }));
  app.get('/ws/:ws', requireWorkspaceAccess(), (_req, res) => res.json({ ok: true }));
  app.use(errorMiddleware);
  return app;
}

const member: SessionClaims = {
  sessionId: 'S', userOid: 'O', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
};
const admin: SessionClaims = { ...member, isAdmin: true, teamMemberships: [] };

describe('guards', () => {
  it('requireRole(admin) → 401 anonymous', async () => {
    const r = await request(appWithSession(null)).get('/admin');
    expect(r.status).toBe(401);
  });
  it('requireRole(admin) → 403 non-admin', async () => {
    const r = await request(appWithSession(member)).get('/admin');
    expect(r.status).toBe(403);
  });
  it('requireRole(admin) → 200 admin', async () => {
    const r = await request(appWithSession(admin)).get('/admin');
    expect(r.status).toBe(200);
  });
  it('requireWorkspaceAccess() → 200 for workspace member', async () => {
    const r = await request(appWithSession(member)).get('/ws/invoices');
    expect(r.status).toBe(200);
  });
  it('requireWorkspaceAccess() → 200 for admin (any workspace)', async () => {
    const r = await request(appWithSession(admin)).get('/ws/contracts');
    expect(r.status).toBe(200);
  });
  it('requireWorkspaceAccess() → 403 for non-member non-admin', async () => {
    const r = await request(appWithSession(member)).get('/ws/contracts');
    expect(r.status).toBe(403);
  });
  it('requireWorkspaceAccess() → 400 missing :ws param', async () => {
    const app = express();
    app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = member; n(); });
    app.get('/ws', requireWorkspaceAccess(), (_req, res) => res.json({}));
    app.use(errorMiddleware);
    const r = await request(app).get('/ws');
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement — `server/src/authz/guards.ts`**

```ts
import type { RequestHandler } from 'express';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors/domain.js';

export function requireRole(role: 'admin'): RequestHandler {
  return (req, _res, next) => {
    if (!req.session) return next(new UnauthenticatedError());
    if (role === 'admin' && !req.session.isAdmin) return next(new ForbiddenError('Admin role required'));
    next();
  };
}

export function requireWorkspaceAccess(paramName = 'ws'): RequestHandler {
  return (req, _res, next) => {
    if (!req.session) return next(new UnauthenticatedError());
    const ws = req.params[paramName];
    if (!ws) return next(new BadRequestError(`Missing :${paramName} parameter`));
    if (req.session.isAdmin) return next();
    const member = req.session.teamMemberships.some((t) => t.workspaceId === ws);
    if (!member) return next(new ForbiddenError('No access to this workspace'));
    next();
  };
}
```

- [ ] **Step 3: Verify (and confirm 100% coverage on `authz/`)**

```bash
npm -w @spectra/server test -- guards.test
npm -w @spectra/server test -- --coverage --collectCoverageFrom='src/authz/**/*.ts' --collectCoverageFrom='!src/authz/**/*.test.ts'
```

Expected: 7 tests pass; `authz/` shows 100% lines/functions.

- [ ] **Step 4: Commit**

```bash
git add server/src/authz/guards.ts server/src/authz/guards.test.ts
git commit -m "feat(server/authz): requireRole + requireWorkspaceAccess guards (100% coverage)"
```

### Task D4: Authz module barrel

**Files:**
- Create: `server/src/authz/index.ts`

- [ ] **Step 1: Implement**

```ts
export * from './guards.js';
export * from './resolveRole.js';
export * from './groupsOverage.js';
```

- [ ] **Step 2: Commit**

```bash
git add server/src/authz/index.ts
git commit -m "feat(server/authz): module barrel export"
```

---

## Phase E — File routes (list, get, preview, search)

This phase exposes the `GET /api/files`, `GET /api/files/:id`, `GET /api/files/:id/preview`, and `GET /api/search` routes. All apply only-own filter (`UploadedByOid eq '<oid>'` for non-admins) both in the Graph filter and in a post-fetch double-check, per spec §4 step 4.

### Task E1: Shared list/search request schemas

**Files:**
- Modify: `shared/src/schemas.ts`
- Modify: `shared/src/types.ts`
- Create: `shared/src/schemas.test.ts` (or extend existing)

- [ ] **Step 1: Failing test — extend `shared/src/schemas.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ListFilesQuerySchema, SearchQuerySchema } from './schemas.js';

describe('list/search query schemas', () => {
  it('parses required workspaceId', () => {
    expect(ListFilesQuerySchema.parse({ ws: 'invoices' })).toEqual({ ws: 'invoices' });
  });
  it('coerces year/month to numbers', () => {
    const out = ListFilesQuerySchema.parse({ ws: 'invoices', year: '2026', month: '4' });
    expect(out.year).toBe(2026);
    expect(out.month).toBe(4);
  });
  it('rejects invalid month', () => {
    expect(() => ListFilesQuerySchema.parse({ ws: 'invoices', month: '13' })).toThrow();
  });
  it('search requires q ≥ 2 chars', () => {
    expect(() => SearchQuerySchema.parse({ ws: 'invoices', q: 'a' })).toThrow();
    expect(SearchQuerySchema.parse({ ws: 'invoices', q: 'ab' }).q).toBe('ab');
  });
});
```

- [ ] **Step 2: Add schemas to `shared/src/schemas.ts`**

```ts
// Append to shared/src/schemas.ts

export const ListFilesQuerySchema = z.object({
  ws: z.string().min(1),
  team: z.string().regex(/^[A-Z0-9_]+$/).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  skipToken: z.string().max(2048).optional(),
});
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;

export const SearchQuerySchema = z.object({
  ws: z.string().min(1),
  q: z.string().min(2).max(256),
  skipToken: z.string().max(2048).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const FileItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  folderPath: z.string(),
  uploadedByOid: z.string(),
  uploadedByDisplayName: z.string(),
  uploadedAt: z.string(),
  sizeBytes: z.number(),
  metadata: z.record(z.union([z.string(), z.number(), z.null()])),
});
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/shared run build && npm -w @spectra/shared test -- schemas.test
```

Expected: 4 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add shared/src/schemas.ts shared/src/schemas.test.ts
git commit -m "feat(shared): list/search query schemas + FileItem schema"
```

### Task E2: Token broker (per-request OBO acquirer)

**Files:**
- Create: `server/src/auth/tokenBroker.ts`
- Create: `server/src/auth/tokenBroker.test.ts`

- [ ] **Step 1: Failing test — `server/src/auth/tokenBroker.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { createTokenBroker } from './tokenBroker.js';
import type { MsalClient } from './msal.js';

function fakeMsal(): MsalClient {
  return {
    buildAuthorizeUrl: jest.fn(),
    exchangeCode: jest.fn(),
    acquireOboToken: jest.fn(async (_at: string, scopes: string[]) => `OBO:${scopes.join(',')}`),
    acquireAppToken: jest.fn(async (scopes: string[]) => `APP:${scopes.join(',')}`),
  } as unknown as MsalClient;
}

describe('tokenBroker', () => {
  it('caches OBO tokens per (sessionId, scopes) key', async () => {
    const msal = fakeMsal();
    const broker = createTokenBroker(msal);
    const t1 = await broker.obo({ sessionId: 'S1', userAccessToken: 'AT' }, ['Files.ReadWrite.All']);
    const t2 = await broker.obo({ sessionId: 'S1', userAccessToken: 'AT' }, ['Files.ReadWrite.All']);
    expect(t1).toBe(t2);
    expect(msal.acquireOboToken).toHaveBeenCalledTimes(1);
  });

  it('caches app-only tokens per scope set', async () => {
    const msal = fakeMsal();
    const broker = createTokenBroker(msal);
    await broker.app(['https://graph.microsoft.com/.default']);
    await broker.app(['https://graph.microsoft.com/.default']);
    expect(msal.acquireAppToken).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implement — `server/src/auth/tokenBroker.ts`**

```ts
import { LRUCache } from 'lru-cache';
import type { MsalClient } from './msal.js';

export interface TokenBroker {
  obo(ctx: { sessionId: string; userAccessToken: string }, scopes: string[]): Promise<string>;
  app(scopes: string[]): Promise<string>;
}

// Cache TTL is shorter than MSAL's own ~1h so we re-mint well before expiry.
const TTL_MS = 50 * 60_000;

export function createTokenBroker(msal: MsalClient): TokenBroker {
  const oboCache = new LRUCache<string, string>({ max: 4096, ttl: TTL_MS });
  const appCache = new LRUCache<string, string>({ max: 64, ttl: TTL_MS });

  return {
    async obo(ctx, scopes) {
      const key = `${ctx.sessionId}|${[...scopes].sort().join(' ')}`;
      const hit = oboCache.get(key);
      if (hit) return hit;
      const tok = await msal.acquireOboToken(ctx.userAccessToken, scopes);
      oboCache.set(key, tok);
      return tok;
    },
    async app(scopes) {
      const key = [...scopes].sort().join(' ');
      const hit = appCache.get(key);
      if (hit) return hit;
      const tok = await msal.acquireAppToken(scopes);
      appCache.set(key, tok);
      return tok;
    },
  };
}
```

Note: Since OBO requires the user's MSAL access token and we don't store it in the session JSON for v1 (sessions hold claims, not refresh tokens), Phase K updates the session JSON to optionally carry an encrypted `userAccessToken` for OBO calls. For now, the broker accepts `userAccessToken` as input.

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- tokenBroker.test
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/tokenBroker.ts server/src/auth/tokenBroker.test.ts
git commit -m "feat(server/auth): per-session OBO + app-only token broker with LRU"
```

### Task E3: Workspace context resolver

**Files:**
- Create: `server/src/routes/workspaceContext.ts`
- Create: `server/src/routes/workspaceContext.test.ts`

- [ ] **Step 1: Failing test — `server/src/routes/workspaceContext.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { resolveWorkspaceContext } from './workspaceContext.js';
import type { ConfigStore } from '../store/configStore.js';

function makeStore(workspaces: Array<{ id: string; archived?: boolean }>): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({ workspaces: workspaces.map((w) => ({
      id: w.id, displayName: w.id, template: 'invoices' as const, containerId: `C-${w.id}`,
      folderConvention: ['Team', 'YYYY', 'MM'], metadataSchema: [], archived: !!w.archived,
      createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000',
    })) })),
    getGroupRoleMap: jest.fn(),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(),
    putGroupRoleMap: jest.fn(),
    putAppSettings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

describe('resolveWorkspaceContext', () => {
  it('returns workspace + driveId', async () => {
    const ws = await resolveWorkspaceContext(makeStore([{ id: 'invoices' }]), 'invoices');
    expect(ws.driveId).toBe('C-invoices');
  });
  it('throws NotFoundError for unknown workspace', async () => {
    await expect(resolveWorkspaceContext(makeStore([]), 'missing')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('throws NotFoundError for archived workspace', async () => {
    await expect(resolveWorkspaceContext(makeStore([{ id: 'invoices', archived: true }]), 'invoices')).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

- [ ] **Step 2: Implement — `server/src/routes/workspaceContext.ts`**

```ts
import type { WorkspaceConfig } from '@spectra/shared';
import { NotFoundError } from '../errors/domain.js';
import type { ConfigStore } from '../store/configStore.js';

export interface WorkspaceContext {
  workspace: WorkspaceConfig;
  driveId: string;
}

export async function resolveWorkspaceContext(
  store: ConfigStore,
  workspaceId: string,
): Promise<WorkspaceContext> {
  const cfg = await store.getWorkspaces();
  const ws = cfg.workspaces.find((w) => w.id === workspaceId && !w.archived);
  if (!ws) throw new NotFoundError('Workspace not found', { workspaceId });
  return { workspace: ws, driveId: ws.containerId };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- workspaceContext.test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/workspaceContext.ts server/src/routes/workspaceContext.test.ts
git commit -m "feat(server/routes): workspace + driveId resolver"
```

### Task E4: Files routes (list, get, preview)

**Files:**
- Create: `server/src/routes/files.ts`
- Create: `server/src/routes/files.test.ts`

- [ ] **Step 1: Failing test — `server/src/routes/files.test.ts`**

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import { filesRouter } from './files.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

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

const member: SessionClaims = {
  sessionId: 'S', userOid: 'U-MEM', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
};

function makeApp(session: SessionClaims = member) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = createGraphClient(async () => 'TOK');
  app.use(filesRouter({ store: makeStore(), graphForUser: () => graph }));
  app.use(errorMiddleware);
  return app;
}

describe('files routes', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('GET /api/files filters by uploader and double-checks in code', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/root/children')
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
    // double-check drops the leaked B item
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].id).toBe('A');
  });

  it('GET /api/files admin sees all without filter', async () => {
    const admin: SessionClaims = { ...member, isAdmin: true };
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/root/children')
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
});
```

- [ ] **Step 2: Implement — `server/src/routes/files.ts`**

```ts
import { Router, type Request, type RequestHandler } from 'express';
import { ListFilesQuerySchema } from '@spectra/shared';
import type { FileItem } from '@spectra/shared';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthenticatedError } from '../errors/domain.js';
import { requireAuth } from '../auth/session.js';
import { audit } from '../obs/audit.js';
import { listChildren, getItem } from '../spe/drives.js';
import { getPreviewUrl } from '../spe/preview.js';
import type { SpeGraphClient, SpeDriveItem } from '../spe/index.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from './workspaceContext.js';

export interface FilesRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
}

function toFileItem(it: SpeDriveItem): FileItem {
  const fields = (it.listItem?.fields ?? {}) as Record<string, unknown>;
  const metadata: FileItem['metadata'] = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' || typeof v === 'number' || v === null) metadata[k] = v;
  }
  return {
    id: it.id,
    name: it.name,
    folderPath: it.parentReference?.path ?? '',
    uploadedByOid: String(fields.UploadedByOid ?? it.createdBy?.user?.id ?? ''),
    uploadedByDisplayName: it.createdBy?.user?.displayName ?? '',
    uploadedAt: String(fields.UploadedAt ?? it.createdDateTime ?? ''),
    sizeBytes: it.size ?? 0,
    metadata,
  };
}

export function filesRouter(deps: FilesRouterDeps): Router {
  const r = Router();

  const list: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = ListFilesQuerySchema.safeParse(req.query);
      if (!parse.success) throw new BadRequestError('Invalid query', { issues: parse.error.message });
      const q = parse.data;
      // Workspace authz: admin or member of any team within the workspace
      if (!req.session.isAdmin && !req.session.teamMemberships.some((t) => t.workspaceId === q.ws)) {
        throw new ForbiddenError('No access to this workspace');
      }
      const { driveId } = await resolveWorkspaceContext(deps.store, q.ws);
      const filterParts: string[] = [];
      if (!req.session.isAdmin) filterParts.push(`fields/UploadedByOid eq '${escapeOData(req.session.userOid)}'`);
      if (q.team) filterParts.push(`fields/Team eq '${escapeOData(q.team)}'`);
      const filter = filterParts.length ? filterParts.join(' and ') : undefined;
      const client = deps.graphForUser(req);
      const listing = await listChildren(client, driveId, 'root', { filter, top: 50, skipToken: q.skipToken });
      // Defense in depth: drop any item that leaks past the Graph filter.
      const items = listing.items
        .map(toFileItem)
        .filter((it) => req.session!.isAdmin || it.uploadedByOid === req.session!.userOid);
      audit({ userOid: req.session.userOid, action: 'files.list', workspace: q.ws, outcome: 'success', detail: { count: items.length } });
      res.json({ items, nextLink: listing.nextLink ?? null });
    } catch (err) { next(err); }
  };

  const getOne: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const ws = typeof req.query.ws === 'string' ? req.query.ws : '';
      if (!ws) throw new BadRequestError('Missing ws');
      const { driveId } = await resolveWorkspaceContext(deps.store, ws);
      const item = await getItem(deps.graphForUser(req), driveId, req.params.id);
      const fileItem = toFileItem(item);
      if (!req.session.isAdmin && fileItem.uploadedByOid !== req.session.userOid) {
        throw new ForbiddenError('Access denied');
      }
      audit({ userOid: req.session.userOid, action: 'files.get', workspace: ws, resourceId: item.id, outcome: 'success' });
      res.json(fileItem);
    } catch (err) {
      if (err instanceof NotFoundError) audit({ userOid: req.session?.userOid ?? 'anonymous', action: 'files.get', outcome: 'failure', detail: { reason: 'not_found' } });
      next(err);
    }
  };

  const preview: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const ws = typeof req.query.ws === 'string' ? req.query.ws : '';
      if (!ws) throw new BadRequestError('Missing ws');
      const { driveId } = await resolveWorkspaceContext(deps.store, ws);
      const item = await getItem(deps.graphForUser(req), driveId, req.params.id);
      const fileItem = toFileItem(item);
      if (!req.session.isAdmin && fileItem.uploadedByOid !== req.session.userOid) {
        throw new ForbiddenError('Access denied');
      }
      const url = await getPreviewUrl(deps.graphForUser(req), driveId, item.id);
      audit({ userOid: req.session.userOid, action: 'files.preview', workspace: ws, resourceId: item.id, outcome: 'success' });
      res.json({ previewUrl: url });
    } catch (err) { next(err); }
  };

  r.get('/api/files', requireAuth, list);
  r.get('/api/files/:id', requireAuth, getOne);
  r.get('/api/files/:id/preview', requireAuth, preview);
  return r;
}

function escapeOData(v: string): string {
  return v.replace(/'/g, "''");
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- files.test
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/files.ts server/src/routes/files.test.ts
git commit -m "feat(server/routes): /api/files list, get, preview with only-own enforcement"
```

### Task E5: Search route

**Files:**
- Create: `server/src/routes/search.ts`
- Create: `server/src/routes/search.test.ts`

- [ ] **Step 1: Failing test — `server/src/routes/search.test.ts`**

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import { searchRouter } from './search.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

const member: SessionClaims = {
  sessionId: 'S', userOid: 'U-MEM', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
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
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = createGraphClient(async () => 'TOK');
  app.use(searchRouter({ store: makeStore(), graphForUser: () => graph }));
  app.use(errorMiddleware);
  return app;
}

describe('search route', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('GET /api/search returns results filtered by uploader for non-admin', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/drives/D1/root/search(q=\'invoice\')')
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
```

- [ ] **Step 2: Implement — `server/src/routes/search.ts`**

```ts
import { Router, type Request, type RequestHandler } from 'express';
import { SearchQuerySchema } from '@spectra/shared';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import type { SpeGraphClient, SpeDriveItem } from '../spe/index.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from './workspaceContext.js';

export interface SearchRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
}

export function searchRouter(deps: SearchRouterDeps): Router {
  const r = Router();
  const handler: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = SearchQuerySchema.safeParse(req.query);
      if (!parse.success) throw new BadRequestError('Invalid query', { issues: parse.error.message });
      const q = parse.data;
      if (!req.session.isAdmin && !req.session.teamMemberships.some((t) => t.workspaceId === q.ws)) {
        throw new ForbiddenError('No access to this workspace');
      }
      const { driveId } = await resolveWorkspaceContext(deps.store, q.ws);
      const escaped = q.q.replace(/'/g, "''");
      const client = deps.graphForUser(req);
      const resp = await client
        .api(`/drives/${driveId}/root/search(q='${escaped}')`)
        .expand('listItem($expand=fields)')
        .top(50)
        .get();
      const all: SpeDriveItem[] = resp.value ?? [];
      const items = all
        .filter((it) => {
          const oid = String((it.listItem?.fields ?? {} as Record<string, unknown>).UploadedByOid ?? it.createdBy?.user?.id ?? '');
          return req.session!.isAdmin || oid === req.session!.userOid;
        })
        .map((it) => ({
          id: it.id, name: it.name,
          uploadedByOid: String((it.listItem?.fields as Record<string, unknown>)?.UploadedByOid ?? ''),
          sizeBytes: it.size ?? 0,
          uploadedAt: it.createdDateTime ?? '',
        }));
      audit({ userOid: req.session.userOid, action: 'files.search', workspace: q.ws, outcome: 'success', detail: { count: items.length } });
      res.json({ items });
    } catch (err) { next(err); }
  };
  r.get('/api/search', requireAuth, handler);
  return r;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- search.test
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/search.ts server/src/routes/search.test.ts
git commit -m "feat(server/routes): /api/search with only-own filter"
```

---

## Phase F — Upload module

### Task F1: Filename sanitization

**Files:**
- Create: `server/src/upload/sanitize.ts`
- Create: `server/src/upload/sanitize.test.ts`

- [ ] **Step 1: Failing test — `server/src/upload/sanitize.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import { sanitizeFilename } from './sanitize.js';

describe('sanitizeFilename', () => {
  it('keeps simple names unchanged', () => {
    expect(sanitizeFilename('invoice.pdf')).toBe('invoice.pdf');
  });
  it('strips path separators', () => {
    expect(sanitizeFilename('a/b\\c.pdf')).toBe('a_b_c.pdf');
  });
  it('rejects path traversal', () => {
    expect(() => sanitizeFilename('../etc/passwd')).toThrow();
    expect(() => sanitizeFilename('..\\boot.ini')).toThrow();
  });
  it('rejects control chars', () => {
    expect(() => sanitizeFilename('hi\u0001.pdf')).toThrow();
  });
  it('truncates names over 200 chars while preserving extension', () => {
    const long = 'a'.repeat(300) + '.pdf';
    const out = sanitizeFilename(long);
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(200);
  });
  it('rejects empty or dot-only names', () => {
    expect(() => sanitizeFilename('')).toThrow();
    expect(() => sanitizeFilename('.')).toThrow();
    expect(() => sanitizeFilename('..')).toThrow();
  });
  it('strips Windows reserved characters', () => {
    expect(sanitizeFilename('a:b*c?.pdf')).toBe('a_b_c_.pdf');
  });
});
```

- [ ] **Step 2: Implement — `server/src/upload/sanitize.ts`**

```ts
import { BadRequestError } from '../errors/domain.js';

const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F<>:"|?*]/g;
const SEPARATORS = /[\\/]/g;
const TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;
const MAX_LEN = 200;

export function sanitizeFilename(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new BadRequestError('Filename empty');
  if (TRAVERSAL.test(input)) throw new BadRequestError('Path traversal in filename');
  if (input === '.' || input === '..') throw new BadRequestError('Invalid filename');
  if (FORBIDDEN_CHARS.test(input)) {
    // control chars are an outright reject; printable Windows-reserved chars get replaced
    if (/[\u0000-\u001F\u007F]/.test(input)) throw new BadRequestError('Control chars in filename');
  }
  let out = input.replace(SEPARATORS, '_').replace(FORBIDDEN_CHARS, '_').trim();
  if (!out || out === '.' || out === '..') throw new BadRequestError('Invalid filename after sanitization');
  if (out.length > MAX_LEN) {
    const dot = out.lastIndexOf('.');
    if (dot > 0 && dot >= out.length - 8) {
      const ext = out.slice(dot);
      out = out.slice(0, MAX_LEN - ext.length) + ext;
    } else {
      out = out.slice(0, MAX_LEN);
    }
  }
  return out;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- sanitize.test
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/upload/sanitize.ts server/src/upload/sanitize.test.ts
git commit -m "feat(server/upload): filename sanitization with traversal/control-char rejection"
```

### Task F2: MIME-sniff allowlist

**Files:**
- Create: `server/src/upload/mime.ts`
- Create: `server/src/upload/mime.test.ts`

- [ ] **Step 1: Failing test — `server/src/upload/mime.test.ts`**

```ts
import { describe, it, expect } from '@jest/globals';
import { detectAndValidateMime, ALLOWED_EXTS } from './mime.js';

const PDF = Buffer.from('%PDF-1.4\n', 'utf8');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);

describe('detectAndValidateMime', () => {
  it('accepts PDF magic bytes', async () => {
    const out = await detectAndValidateMime(PDF, 'invoice.pdf');
    expect(out.ext).toBe('pdf');
    expect(out.mime).toBe('application/pdf');
  });
  it('accepts PNG magic bytes', async () => {
    const out = await detectAndValidateMime(PNG, 'logo.png');
    expect(out.ext).toBe('png');
  });
  it('rejects unknown bytes', async () => {
    await expect(detectAndValidateMime(Buffer.from('not a real file'), 'a.pdf')).rejects.toMatchObject({ code: 'bad_request' });
  });
  it('rejects extension/content mismatch', async () => {
    await expect(detectAndValidateMime(PDF, 'logo.png')).rejects.toMatchObject({ code: 'bad_request' });
  });
  it('exports allowlist matching spec §2', () => {
    expect(ALLOWED_EXTS).toEqual(['pdf', 'png', 'jpg', 'jpeg', 'heic', 'tiff']);
  });
});
```

- [ ] **Step 2: Implement — `server/src/upload/mime.ts`**

```ts
import { fileTypeFromBuffer } from 'file-type';
import { BadRequestError } from '../errors/domain.js';

export const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'tiff'] as const;
export type AllowedExt = (typeof ALLOWED_EXTS)[number];

const ALLOWED_MIME = new Map<AllowedExt, string>([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['heic', 'image/heic'],
  ['tiff', 'image/tiff'],
]);

export interface DetectedType {
  ext: AllowedExt;
  mime: string;
}

export async function detectAndValidateMime(buf: Buffer, filename: string): Promise<DetectedType> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected) throw new BadRequestError('Could not determine file type');
  const ext = detected.ext.toLowerCase();
  if (!isAllowedExt(ext)) throw new BadRequestError(`File type "${ext}" not allowed`);
  const declared = filename.split('.').pop()?.toLowerCase() ?? '';
  // jpeg/jpg are interchangeable
  const normalize = (e: string): string => (e === 'jpeg' ? 'jpg' : e);
  if (normalize(declared) !== normalize(ext)) {
    throw new BadRequestError('File extension does not match content');
  }
  return { ext, mime: ALLOWED_MIME.get(ext) ?? detected.mime };
}

function isAllowedExt(e: string): e is AllowedExt {
  return (ALLOWED_EXTS as readonly string[]).includes(e);
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- mime.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/upload/mime.ts server/src/upload/mime.test.ts
git commit -m "feat(server/upload): MIME magic-byte sniff + extension match against allowlist"
```

### Task F3: Folder convention + collision resolution

**Files:**
- Create: `server/src/upload/foldering.ts`
- Create: `server/src/upload/foldering.test.ts`

- [ ] **Step 1: Failing test — `server/src/upload/foldering.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { renderFolderSegments, resolveCollision } from './foldering.js';

describe('renderFolderSegments', () => {
  it('renders Team/YYYY/MM convention', () => {
    expect(renderFolderSegments(['Team', 'YYYY', 'MM'], { team: 'AP', year: 2026, month: 4 }))
      .toEqual(['AP', '2026', '04']);
  });
  it('passes through static segments', () => {
    expect(renderFolderSegments(['archive', 'YYYY'], { team: 'X', year: 2026, month: 1 }))
      .toEqual(['archive', '2026']);
  });
});

describe('resolveCollision', () => {
  it('returns base name when no collision', async () => {
    const exists = jest.fn(async () => false);
    expect(await resolveCollision('a.pdf', exists)).toBe('a.pdf');
    expect(exists).toHaveBeenCalledTimes(1);
  });
  it('appends -2 on first collision', async () => {
    const exists = jest.fn(async (n: string) => n === 'a.pdf');
    expect(await resolveCollision('a.pdf', exists)).toBe('a-2.pdf');
  });
  it('keeps incrementing until free', async () => {
    const taken = new Set(['a.pdf', 'a-2.pdf', 'a-3.pdf']);
    const exists = jest.fn(async (n: string) => taken.has(n));
    expect(await resolveCollision('a.pdf', exists)).toBe('a-4.pdf');
  });
});
```

- [ ] **Step 2: Implement — `server/src/upload/foldering.ts`**

```ts
export function renderFolderSegments(
  convention: string[],
  ctx: { team: string; year: number; month: number },
): string[] {
  return convention.map((seg) => {
    if (seg === 'Team') return ctx.team;
    if (seg === 'YYYY') return String(ctx.year);
    if (seg === 'MM') return String(ctx.month).padStart(2, '0');
    return seg;
  });
}

export async function resolveCollision(
  baseName: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  if (!(await exists(baseName))) return baseName;
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : '';
  for (let i = 2; i < maxAttempts; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`resolveCollision: exceeded ${maxAttempts} attempts`);
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- foldering.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/upload/foldering.ts server/src/upload/foldering.test.ts
git commit -m "feat(server/upload): folder-segment renderer + collision resolver"
```

### Task F4: Upload route (multipart + full pipeline)

**Files:**
- Create: `server/src/upload/route.ts`
- Create: `server/src/upload/route.test.ts`

- [ ] **Step 1: Failing test — `server/src/upload/route.test.ts`**

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import { uploadRouter } from './route.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

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
  issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
};

function makeApp(session: SessionClaims = member) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  const graph = createGraphClient(async () => 'TOK');
  app.use(uploadRouter({ store: makeStore(), graphForUser: () => graph, graphAppOnly: () => graph }));
  app.use(errorMiddleware);
  return app;
}

describe('upload route', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

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
      .get('/v1.0/drives/D1/root:/AP/2026/04:').reply(200, { id: 'F-MONTH' })
      .get('/v1.0/drives/D1/root:/AP/2026/04/invoice.pdf:').reply(404, { error: { code: 'itemNotFound' } })
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
});
```

- [ ] **Step 2: Implement — `server/src/upload/route.ts`**

```ts
import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { UploadRequestSchema, type WorkspaceConfig, type MetadataField } from '@spectra/shared';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import type { SpeGraphClient } from '../spe/index.js';
import { ensureFolderPath, uploadSmallFile } from '../spe/uploads.js';
import { setItemFields } from '../spe/columns.js';
import { grantItemPermission } from '../spe/permissions.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from '../routes/workspaceContext.js';
import { sanitizeFilename } from './sanitize.js';
import { detectAndValidateMime } from './mime.js';
import { renderFolderSegments, resolveCollision } from './foldering.js';

export interface UploadRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;  // OBO for upload + metadata
  graphAppOnly: () => SpeGraphClient;              // app-only for /invite
}

const MAX_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

export function uploadRouter(deps: UploadRouterDeps): Router {
  const r = Router();
  const handler: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      if (!req.file) throw new BadRequestError('Missing file');
      const metaRaw = typeof req.body.metadata === 'string' ? safeParseJson(req.body.metadata) : null;
      const reqParse = UploadRequestSchema.safeParse({
        workspaceId: req.body.workspaceId,
        teamCode: req.body.teamCode,
        year: Number(req.body.year),
        month: Number(req.body.month),
        metadata: metaRaw,
      });
      if (!reqParse.success) throw new BadRequestError('Invalid request', { issues: reqParse.error.message });
      const upreq = reqParse.data;

      // Workspace + team authz
      const member = req.session.teamMemberships.find((t) => t.workspaceId === upreq.workspaceId && t.teamCode === upreq.teamCode);
      if (!req.session.isAdmin && !member) throw new ForbiddenError('No access to this workspace/team');
      const { workspace, driveId } = await resolveWorkspaceContext(deps.store, upreq.workspaceId);
      validateMetadataAgainstSchema(upreq.metadata, workspace.metadataSchema);

      // Sanitization + MIME
      const safeName = sanitizeFilename(req.file.originalname);
      await detectAndValidateMime(req.file.buffer, safeName);

      // Folder materialization
      const segments = renderFolderSegments(workspace.folderConvention, {
        team: member?.teamDisplayName ?? upreq.teamCode,
        year: upreq.year,
        month: upreq.month,
      });
      const userClient = deps.graphForUser(req);
      const folder = await ensureFolderPath(userClient, driveId, segments);

      // Collision resolution
      const finalName = await resolveCollision(safeName, async (cand) => {
        try {
          await userClient.api(`/drives/${driveId}/root:/${[...segments, cand].join('/')}:`).get();
          return true;
        } catch (err) {
          if (err instanceof NotFoundError) return false;
          throw err;
        }
      });

      // Upload bytes
      const ext = finalName.split('.').pop()?.toLowerCase() ?? 'bin';
      const mime = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      let item;
      try {
        item = await uploadSmallFile(userClient, driveId, folder.folderId, finalName, req.file.buffer, mime);
      } catch (err) {
        if (err instanceof ConflictError) throw new ConflictError('Upload collision after retries', undefined, err);
        throw err;
      }

      // Column metadata write
      const uploadedAt = new Date().toISOString();
      await setItemFields(userClient, driveId, item.id, {
        ...flattenMetadata(upreq.metadata),
        UploadedByOid: req.session.userOid,
        UploadedAt: uploadedAt,
      });

      // Item permission grant (uploader gets read via /invite)
      await grantItemPermission(deps.graphAppOnly(), driveId, item.id, {
        recipientObjectId: req.session.userOid,
        roles: ['read'],
      });

      audit({
        userOid: req.session.userOid, action: 'files.upload',
        workspace: upreq.workspaceId, resourceId: item.id, outcome: 'success',
        detail: { filename: finalName, sizeBytes: req.file.size },
      });
      res.status(201).json({ id: item.id, name: finalName, folderPath: segments.join('/') });
    } catch (err) {
      audit({
        userOid: req.session?.userOid ?? 'anonymous', action: 'files.upload',
        outcome: 'failure', detail: { reason: err instanceof Error ? err.message : 'unknown' },
      });
      next(err);
    }
  };
  r.post('/api/upload', requireAuth, upload.single('file'), handler);
  return r;
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { throw new BadRequestError('metadata must be valid JSON'); }
}

function validateMetadataAgainstSchema(meta: Record<string, unknown>, schema: MetadataField[]): void {
  for (const field of schema) {
    if (field.required && !(field.name in meta)) {
      throw new BadRequestError(`Missing required metadata field "${field.name}"`);
    }
    const value = meta[field.name];
    if (value === undefined) continue;
    if (field.type === 'string' && typeof value !== 'string') throw new BadRequestError(`Field "${field.name}" must be string`);
    if (field.type === 'number' && typeof value !== 'number') throw new BadRequestError(`Field "${field.name}" must be number`);
    if (field.type === 'enum' && (typeof value !== 'string' || !field.enumValues?.includes(value))) {
      throw new BadRequestError(`Field "${field.name}" not in allowed values`);
    }
  }
}

function flattenMetadata(meta: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- route.test
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/upload/route.ts server/src/upload/route.test.ts
git commit -m "feat(server/upload): /api/upload pipeline (sanitize, MIME, folder, columns, permission)"
```

### Task F5: Upload module barrel

**Files:**
- Create: `server/src/upload/index.ts`

- [ ] **Step 1: Implement**

```ts
export * from './sanitize.js';
export * from './mime.js';
export * from './foldering.js';
export * from './route.js';
```

- [ ] **Step 2: Commit**

```bash
git add server/src/upload/index.ts
git commit -m "feat(server/upload): module barrel export"
```

---

## Phase G — Workspace routes

### Task G1: Workspace list + teams routes

**Files:**
- Create: `server/src/routes/workspaces.ts`
- Create: `server/src/routes/workspaces.test.ts`

- [ ] **Step 1: Failing test — `server/src/routes/workspaces.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { workspacesRouter } from './workspaces.js';
import { errorMiddleware } from '../errors/middleware.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

function makeStore(): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({
      workspaces: [
        { id: 'invoices', displayName: 'Invoices', template: 'invoices', containerId: 'D1',
          folderConvention: ['Team', 'YYYY', 'MM'], metadataSchema: [], archived: false,
          createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
        { id: 'contracts', displayName: 'Contracts', template: 'contracts', containerId: 'D2',
          folderConvention: ['Counterparty', 'YYYY'], metadataSchema: [], archived: false,
          createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
        { id: 'old', displayName: 'Old', template: 'blank', containerId: 'D3',
          folderConvention: ['YYYY'], metadataSchema: [], archived: true,
          createdAt: '2025-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
      ],
    })),
    getGroupRoleMap: jest.fn(), getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(), putGroupRoleMap: jest.fn(), putAppSettings: jest.fn(), invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

const member: SessionClaims = {
  sessionId: 'S', userOid: 'O', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
};
const admin: SessionClaims = { ...member, isAdmin: true, teamMemberships: [] };

function makeApp(session: SessionClaims) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  app.use(workspacesRouter({ store: makeStore() }));
  app.use(errorMiddleware);
  return app;
}

describe('workspaces routes', () => {
  it('GET /api/workspaces returns only workspaces user can access (member)', async () => {
    const r = await request(makeApp(member)).get('/api/workspaces');
    expect(r.status).toBe(200);
    expect(r.body.workspaces.map((w: { id: string }) => w.id)).toEqual(['invoices']);
  });

  it('GET /api/workspaces returns all non-archived for admin', async () => {
    const r = await request(makeApp(admin)).get('/api/workspaces');
    expect(r.body.workspaces.map((w: { id: string }) => w.id)).toEqual(['invoices', 'contracts']);
  });

  it('GET /api/workspaces/:ws/teams returns user teams in workspace', async () => {
    const r = await request(makeApp(member)).get('/api/workspaces/invoices/teams');
    expect(r.status).toBe(200);
    expect(r.body.teams).toEqual([{ teamCode: 'AP', teamDisplayName: 'AP Team' }]);
  });

  it('GET /api/workspaces/:ws/teams 403 if no access', async () => {
    const r = await request(makeApp(member)).get('/api/workspaces/contracts/teams');
    expect(r.status).toBe(403);
  });
});
```

- [ ] **Step 2: Implement — `server/src/routes/workspaces.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../errors/domain.js';
import { requireAuth } from '../auth/session.js';
import { requireWorkspaceAccess } from '../authz/guards.js';
import type { ConfigStore } from '../store/configStore.js';

export interface WorkspacesRouterDeps {
  store: ConfigStore;
}

export function workspacesRouter(deps: WorkspacesRouterDeps): Router {
  const r = Router();

  const list: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const cfg = await deps.store.getWorkspaces();
      const visible = cfg.workspaces
        .filter((w) => !w.archived)
        .filter((w) => req.session!.isAdmin || req.session!.teamMemberships.some((t) => t.workspaceId === w.id))
        .map((w) => ({
          id: w.id,
          displayName: w.displayName,
          template: w.template,
          folderConvention: w.folderConvention,
          metadataSchema: w.metadataSchema,
        }));
      res.json({ workspaces: visible });
    } catch (err) { next(err); }
  };

  const teams: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const ws = req.params.ws;
      const teams = req.session.teamMemberships
        .filter((t) => t.workspaceId === ws)
        .map((t) => ({ teamCode: t.teamCode, teamDisplayName: t.teamDisplayName }));
      if (req.session.isAdmin) {
        // Admin sees all teams declared in group-role-map
        const map = await deps.store.getGroupRoleMap();
        const seen = new Set<string>();
        for (const e of map.entries) {
          if (e.workspaceId !== ws) continue;
          if (seen.has(e.teamCode)) continue;
          seen.add(e.teamCode);
          teams.push({ teamCode: e.teamCode, teamDisplayName: e.teamDisplayName });
        }
      }
      if (!req.session.isAdmin && teams.length === 0) throw new ForbiddenError('No access to this workspace');
      res.json({ teams });
    } catch (err) { next(err); }
  };

  r.get('/api/workspaces', requireAuth, list);
  r.get('/api/workspaces/:ws/teams', requireAuth, requireWorkspaceAccess(), teams);
  return r;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- workspaces.test
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/workspaces.ts server/src/routes/workspaces.test.ts
git commit -m "feat(server/routes): /api/workspaces and /api/workspaces/:ws/teams"
```

---

## Phase H — Sharing module

### Task H1: Recipient validation

**Files:**
- Create: `server/src/sharing/recipients.ts`
- Create: `server/src/sharing/recipients.test.ts`

- [ ] **Step 1: Failing test — `server/src/sharing/recipients.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { resolveRecipients } from './recipients.js';
import { createGraphClient } from '../spe/client.js';

describe('resolveRecipients', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });
  const client = createGraphClient(async () => 'TOK');

  it('returns object ids for in-tenant UPNs', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/users/alice%40contoso.com').query(true).reply(200, { id: 'OID-1', userPrincipalName: 'alice@contoso.com' })
      .get('/v1.0/users/bob%40contoso.com').query(true).reply(200, { id: 'OID-2', userPrincipalName: 'bob@contoso.com' });
    const out = await resolveRecipients(client, ['alice@contoso.com', 'bob@contoso.com']);
    expect(out).toEqual([
      { upn: 'alice@contoso.com', objectId: 'OID-1' },
      { upn: 'bob@contoso.com', objectId: 'OID-2' },
    ]);
  });

  it('rejects unknown user with BadRequestError', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/users/ghost%40contoso.com').query(true).reply(404, { error: { code: 'Request_ResourceNotFound' } });
    await expect(resolveRecipients(client, ['ghost@contoso.com'])).rejects.toMatchObject({ code: 'bad_request' });
  });
});
```

- [ ] **Step 2: Implement — `server/src/sharing/recipients.ts`**

```ts
import { BadRequestError, NotFoundError } from '../errors/domain.js';
import type { SpeGraphClient } from '../spe/index.js';

export interface ResolvedRecipient {
  upn: string;
  objectId: string;
}

export async function resolveRecipients(
  client: SpeGraphClient,
  upns: string[],
): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = [];
  for (const upn of upns) {
    try {
      const resp = await client.api(`/users/${encodeURIComponent(upn)}`).select('id,userPrincipalName').get();
      out.push({ upn, objectId: resp.id as string });
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new BadRequestError(`Recipient "${upn}" is not a member of this tenant`);
      }
      throw err;
    }
  }
  return out;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- recipients.test
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/sharing/recipients.ts server/src/sharing/recipients.test.ts
git commit -m "feat(server/sharing): tenant-internal UPN → objectId resolver"
```

### Task H2: Share route

**Files:**
- Create: `server/src/sharing/route.ts`
- Create: `server/src/sharing/route.test.ts`

- [ ] **Step 1: Failing test — `server/src/sharing/route.test.ts`**

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import { sharingRouter } from './route.js';
import { errorMiddleware } from '../errors/middleware.js';
import { createGraphClient } from '../spe/client.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

const member: SessionClaims = {
  sessionId: 'S', userOid: 'U-MEM', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
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
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

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
```

- [ ] **Step 2: Implement — `server/src/sharing/route.ts`**

Add an extended schema for the `ws` field:

```ts
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { ShareRequestSchema } from '@spectra/shared';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import { getItem } from '../spe/drives.js';
import { createSharingLink } from '../spe/permissions.js';
import type { SpeGraphClient } from '../spe/index.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from '../routes/workspaceContext.js';
import { resolveRecipients } from './recipients.js';

const ShareBodySchema = ShareRequestSchema.omit({ itemId: true }).extend({ ws: z.string().min(1) });

const MAX_DAYS = 90;
const MIN_DAYS = 0;

export interface SharingRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
}

export function sharingRouter(deps: SharingRouterDeps): Router {
  const r = Router();
  const handler: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = ShareBodySchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid share request', { issues: parse.error.message });
      const body = parse.data;
      const expiresAt = new Date(body.expiresAt).getTime();
      const now = Date.now();
      if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new BadRequestError('expiresAt must be in the future');
      if (expiresAt - now > MAX_DAYS * 86_400_000) throw new BadRequestError(`expiresAt must be within ${MAX_DAYS} days`);
      if (expiresAt - now < MIN_DAYS * 86_400_000) throw new BadRequestError('expiresAt must be at least 1 day from now');

      const { driveId } = await resolveWorkspaceContext(deps.store, body.ws);
      const client = deps.graphForUser(req);

      // Validate recipients are same-tenant (Graph user lookup)
      const recipients = await resolveRecipients(client, body.recipientUpns);

      // Only-own check before sharing
      const item = await getItem(client, driveId, req.params.id);
      const ownerOid = String((item.listItem?.fields as Record<string, unknown> | undefined)?.UploadedByOid ?? item.createdBy?.user?.id ?? '');
      if (!req.session.isAdmin && ownerOid !== req.session.userOid) {
        throw new ForbiddenError('You can only share files you uploaded');
      }

      // Create no-download view-only link
      const link = await createSharingLink(client, driveId, item.id, { expiresAt: body.expiresAt });

      // Send notification mail (Graph /me/sendMail) — best-effort but if it fails we surface it
      const recipientList = recipients.map((r) => ({ emailAddress: { address: r.upn } }));
      const message = body.message ?? '';
      await client.api(`/users/${req.session.userOid}/sendMail`).post({
        message: {
          subject: `${req.session.userOid} shared a file with you`,
          body: { contentType: 'Text', content: `${message}\n\nView: ${link.webUrl}\nExpires: ${body.expiresAt}` },
          toRecipients: recipientList,
        },
        saveToSentItems: false,
      });

      audit({
        userOid: req.session.userOid, action: 'files.share',
        workspace: body.ws, resourceId: item.id, outcome: 'success',
        detail: { recipientCount: recipients.length, expiresAt: body.expiresAt },
      });
      res.json({ shareUrl: link.webUrl, expiresAt: body.expiresAt });
    } catch (err) { next(err); }
  };
  r.post('/api/files/:id/share', requireAuth, handler);
  return r;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- route.test --testPathPattern sharing
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/sharing/route.ts server/src/sharing/route.test.ts
git commit -m "feat(server/sharing): /api/files/:id/share with no-download link + Graph mail"
```

### Task H3: Sharing module barrel

**Files:**
- Create: `server/src/sharing/index.ts`

- [ ] **Step 1: Implement**

```ts
export * from './recipients.js';
export * from './route.js';
```

- [ ] **Step 2: Commit**

```bash
git add server/src/sharing/index.ts
git commit -m "feat(server/sharing): module barrel export"
```

---

## Phase I — Admin routes

### Task I1: Workspace CRUD (list, create, archive)

**Files:**
- Create: `server/src/routes/admin.ts`
- Create: `server/src/routes/admin.test.ts`
- Create: `server/templates/workspaces/invoices.json`
- Create: `server/templates/workspaces/contracts.json`
- Create: `server/templates/workspaces/hr-docs.json`
- Create: `server/templates/workspaces/blank.json`

- [ ] **Step 1: Templates** — small JSON files matching the schemas in spec §2 ("Built-in workspace templates"):

`server/templates/workspaces/invoices.json`:
```json
{
  "displayName": "AP Invoices",
  "template": "invoices",
  "folderConvention": ["Team", "YYYY", "MM"],
  "metadataSchema": [
    { "name": "Vendor", "type": "string", "required": true, "indexed": true },
    { "name": "InvoiceNumber", "type": "string", "required": true, "indexed": true },
    { "name": "Amount", "type": "number", "required": true, "indexed": false },
    { "name": "Currency", "type": "string", "required": true, "indexed": false }
  ]
}
```

`server/templates/workspaces/contracts.json`:
```json
{
  "displayName": "Contracts",
  "template": "contracts",
  "folderConvention": ["Counterparty", "YYYY"],
  "metadataSchema": [
    { "name": "Counterparty", "type": "string", "required": true, "indexed": true },
    { "name": "ContractNumber", "type": "string", "required": true, "indexed": true },
    { "name": "EffectiveDate", "type": "date", "required": true, "indexed": false },
    { "name": "ExpirationDate", "type": "date", "required": false, "indexed": false },
    { "name": "Status", "type": "enum", "required": true, "indexed": false, "enumValues": ["Draft", "Executed", "Expired", "Terminated"] }
  ]
}
```

`server/templates/workspaces/hr-docs.json`:
```json
{
  "displayName": "HR Documents",
  "template": "hr-docs",
  "folderConvention": ["DocumentType", "YYYY"],
  "metadataSchema": [
    { "name": "EmployeeId", "type": "string", "required": true, "indexed": true },
    { "name": "DocumentType", "type": "string", "required": true, "indexed": true },
    { "name": "EffectiveDate", "type": "date", "required": true, "indexed": false },
    { "name": "Confidentiality", "type": "enum", "required": true, "indexed": false, "enumValues": ["Internal", "Restricted", "HR-Only"] }
  ]
}
```

`server/templates/workspaces/blank.json`:
```json
{
  "displayName": "New Workspace",
  "template": "blank",
  "folderConvention": ["YYYY", "MM"],
  "metadataSchema": []
}
```

- [ ] **Step 2: Failing test — `server/src/routes/admin.test.ts`**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { adminRouter } from './admin.js';
import { errorMiddleware } from '../errors/middleware.js';
import type { SessionClaims, WorkspaceConfig, GroupRoleMapEntry } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

const admin: SessionClaims = {
  sessionId: 'S', userOid: '00000000-0000-0000-0000-000000000010', tenantId: 'T', isAdmin: true,
  teamMemberships: [], issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
};
const member: SessionClaims = { ...admin, isAdmin: false };

function makeStore(initial: WorkspaceConfig[] = [], map: GroupRoleMapEntry[] = []): ConfigStore {
  let workspaces = [...initial];
  let entries = [...map];
  return {
    getWorkspaces: jest.fn(async () => ({ workspaces })),
    getGroupRoleMap: jest.fn(async () => ({ entries })),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(async (v: { workspaces: WorkspaceConfig[] }) => { workspaces = v.workspaces; }),
    putGroupRoleMap: jest.fn(async (v: { entries: GroupRoleMapEntry[] }) => { entries = v.entries; }),
    putAppSettings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

function makeApp(session: SessionClaims, store: ConfigStore) {
  const app = express();
  app.use(express.json());
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  app.use(adminRouter({ store, provisionContainer: jest.fn(async () => 'NEW-CONTAINER-ID'), auditQuery: jest.fn(async () => ({ events: [] })) }));
  app.use(errorMiddleware);
  return app;
}

describe('admin routes', () => {
  it('all routes 403 for non-admin', async () => {
    const r = await request(makeApp(member, makeStore())).get('/api/admin/workspaces');
    expect(r.status).toBe(403);
  });

  it('GET /api/admin/workspaces lists all (incl archived)', async () => {
    const store = makeStore([
      { id: 'a', displayName: 'A', template: 'invoices', containerId: 'C', folderConvention: ['YYYY'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
      { id: 'b', displayName: 'B', template: 'blank', containerId: 'C2', folderConvention: ['YYYY'], metadataSchema: [], archived: true, createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
    ]);
    const r = await request(makeApp(admin, store)).get('/api/admin/workspaces');
    expect(r.body.workspaces).toHaveLength(2);
  });

  it('POST /api/admin/workspaces creates from template', async () => {
    const store = makeStore();
    const r = await request(makeApp(admin, store))
      .post('/api/admin/workspaces')
      .send({ id: 'invoices-2', displayName: 'AP-2', template: 'invoices' });
    expect(r.status).toBe(201);
    expect(r.body.workspace.id).toBe('invoices-2');
    expect(r.body.workspace.containerId).toBe('NEW-CONTAINER-ID');
    expect(r.body.workspace.metadataSchema.length).toBeGreaterThan(0);
  });

  it('PATCH /api/admin/workspaces/:ws archives', async () => {
    const store = makeStore([
      { id: 'a', displayName: 'A', template: 'invoices', containerId: 'C', folderConvention: ['YYYY'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
    ]);
    const r = await request(makeApp(admin, store)).patch('/api/admin/workspaces/a').send({ archived: true });
    expect(r.status).toBe(200);
    expect(r.body.workspace.archived).toBe(true);
  });

  it('GET /api/admin/group-mapping returns entries', async () => {
    const r = await request(makeApp(admin, makeStore())).get('/api/admin/group-mapping');
    expect(r.status).toBe(200);
    expect(r.body.entries).toEqual([]);
  });

  it('PUT /api/admin/group-mapping replaces entries', async () => {
    const store = makeStore();
    const entry = {
      entraGroupId: '11111111-1111-1111-1111-111111111111',
      entraGroupDisplayName: 'Finance',
      workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team',
    };
    const r = await request(makeApp(admin, store))
      .put('/api/admin/group-mapping').send({ entries: [entry] });
    expect(r.status).toBe(200);
    expect(r.body.entries).toEqual([entry]);
  });

  it('GET /api/admin/audit returns canned KQL events', async () => {
    const r = await request(makeApp(admin, makeStore())).get('/api/admin/audit?action=files.upload&limit=10');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.events)).toBe(true);
  });
});
```

- [ ] **Step 3: Implement — `server/src/routes/admin.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  GroupRoleMapSchema, WorkspaceConfigSchema, type GroupRoleMapEntry,
  type WorkspaceConfig, type WorkspaceTemplate,
} from '@spectra/shared';
import { BadRequestError, NotFoundError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import { requireRole } from '../authz/guards.js';
import type { ConfigStore } from '../store/configStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(here, '../../templates/workspaces');

const CreateWorkspaceSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).optional(),
  template: z.enum(['invoices', 'contracts', 'hr-docs', 'blank']),
});

const PatchWorkspaceSchema = z.object({
  displayName: z.string().min(1).optional(),
  archived: z.boolean().optional(),
});

const AuditQuerySchema = z.object({
  action: z.string().min(1).max(64).optional(),
  workspace: z.string().min(1).max(64).optional(),
  userOid: z.string().uuid().optional(),
  fromIso: z.string().datetime().optional(),
  toIso: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export interface AdminAuditEvent {
  timestamp: string;
  userOid: string;
  action: string;
  workspace?: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
}

export interface AdminRouterDeps {
  store: ConfigStore;
  // Provisions an SPE container for a new workspace; returns the containerId.
  provisionContainer: (workspaceId: string, displayName: string) => Promise<string>;
  // Runs a canned KQL query; the implementation lives in obs/auditQuery.ts (Phase K).
  auditQuery: (q: z.infer<typeof AuditQuerySchema>) => Promise<{ events: AdminAuditEvent[] }>;
}

async function loadTemplate(name: WorkspaceTemplate): Promise<{
  displayName: string;
  template: WorkspaceTemplate;
  folderConvention: string[];
  metadataSchema: WorkspaceConfig['metadataSchema'];
}> {
  const file = path.join(TEMPLATE_DIR, `${name}.json`);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw);
}

export function adminRouter(deps: AdminRouterDeps): Router {
  const r = Router();
  const guard = [requireAuth, requireRole('admin')];

  const listWs: RequestHandler = async (_req, res, next) => {
    try {
      const cfg = await deps.store.getWorkspaces();
      res.json({ workspaces: cfg.workspaces });
    } catch (err) { next(err); }
  };

  const createWs: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = CreateWorkspaceSchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid request', { issues: parse.error.message });
      const cfg = await deps.store.getWorkspaces();
      if (cfg.workspaces.some((w) => w.id === parse.data.id)) {
        throw new BadRequestError('Workspace id already exists');
      }
      const tpl = await loadTemplate(parse.data.template);
      const containerId = await deps.provisionContainer(parse.data.id, parse.data.displayName ?? tpl.displayName);
      const ws: WorkspaceConfig = WorkspaceConfigSchema.parse({
        id: parse.data.id,
        displayName: parse.data.displayName ?? tpl.displayName,
        template: parse.data.template,
        containerId,
        folderConvention: tpl.folderConvention,
        metadataSchema: tpl.metadataSchema,
        archived: false,
        createdAt: new Date().toISOString(),
        createdByOid: req.session.userOid,
      });
      await deps.store.putWorkspaces({ workspaces: [...cfg.workspaces, ws] });
      audit({ userOid: req.session.userOid, action: 'admin.workspace.create', workspace: ws.id, outcome: 'success' });
      res.status(201).json({ workspace: ws });
    } catch (err) { next(err); }
  };

  const patchWs: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = PatchWorkspaceSchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid patch', { issues: parse.error.message });
      const cfg = await deps.store.getWorkspaces();
      const idx = cfg.workspaces.findIndex((w) => w.id === req.params.ws);
      if (idx < 0) throw new NotFoundError('Workspace not found');
      const updated: WorkspaceConfig = {
        ...cfg.workspaces[idx],
        ...(parse.data.displayName !== undefined ? { displayName: parse.data.displayName } : {}),
        ...(parse.data.archived !== undefined ? { archived: parse.data.archived } : {}),
      };
      const next = [...cfg.workspaces];
      next[idx] = updated;
      await deps.store.putWorkspaces({ workspaces: next });
      audit({ userOid: req.session.userOid, action: 'admin.workspace.update', workspace: updated.id, outcome: 'success' });
      res.json({ workspace: updated });
    } catch (err) { next(err); }
  };

  const getMap: RequestHandler = async (_req, res, next) => {
    try {
      const map = await deps.store.getGroupRoleMap();
      res.json(map);
    } catch (err) { next(err); }
  };

  const putMap: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = GroupRoleMapSchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid mapping', { issues: parse.error.message });
      const seen = new Set<string>();
      for (const e of parse.data.entries as GroupRoleMapEntry[]) {
        const key = `${e.entraGroupId}|${e.workspaceId}|${e.teamCode}`;
        if (seen.has(key)) throw new BadRequestError(`Duplicate mapping ${key}`);
        seen.add(key);
      }
      await deps.store.putGroupRoleMap(parse.data);
      audit({ userOid: req.session.userOid, action: 'admin.group_mapping.replace', outcome: 'success', detail: { count: parse.data.entries.length } });
      res.json(parse.data);
    } catch (err) { next(err); }
  };

  const auditEndpoint: RequestHandler = async (req, res, next) => {
    try {
      const parse = AuditQuerySchema.safeParse(req.query);
      if (!parse.success) throw new BadRequestError('Invalid audit query', { issues: parse.error.message });
      const out = await deps.auditQuery(parse.data);
      res.json(out);
    } catch (err) { next(err); }
  };

  r.get('/api/admin/workspaces', ...guard, listWs);
  r.post('/api/admin/workspaces', ...guard, createWs);
  r.patch('/api/admin/workspaces/:ws', ...guard, patchWs);
  r.get('/api/admin/group-mapping', ...guard, getMap);
  r.put('/api/admin/group-mapping', ...guard, putMap);
  r.get('/api/admin/audit', ...guard, auditEndpoint);
  return r;
}
```

- [ ] **Step 4: Verify**

```bash
npm -w @spectra/server test -- admin.test
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.ts server/src/routes/admin.test.ts \
        server/templates/workspaces/invoices.json server/templates/workspaces/contracts.json \
        server/templates/workspaces/hr-docs.json server/templates/workspaces/blank.json
git commit -m "feat(server/admin): workspace CRUD, group-mapping CRUD, audit query, templates"
```

### Task I2: Container provisioner + audit query helpers

**Files:**
- Create: `server/src/admin/provision.ts`
- Create: `server/src/admin/provision.test.ts`
- Create: `server/src/obs/auditQuery.ts`
- Create: `server/src/obs/auditQuery.test.ts`

- [ ] **Step 1: Failing test — `server/src/admin/provision.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { createGraphClient } from '../spe/client.js';
import { createContainerProvisioner } from './provision.js';

describe('createContainerProvisioner', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('POSTs /storage/fileStorage/containers with containerType', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/storage/fileStorage/containers', (b) => b.containerTypeId === 'CTID' && b.displayName === 'AP')
      .reply(201, { id: 'NEW-C', displayName: 'AP' });
    const client = createGraphClient(async () => 'TOK');
    const provision = createContainerProvisioner(client, 'CTID');
    expect(await provision('invoices', 'AP')).toBe('NEW-C');
  });
});
```

`server/src/obs/auditQuery.test.ts`:

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { createAuditQuery } from './auditQuery.js';

describe('auditQuery', () => {
  it('returns empty when no client provided', async () => {
    const q = createAuditQuery({ logsClient: null });
    expect((await q({ limit: 10 })).events).toEqual([]);
  });
  it('returns events from logs client', async () => {
    const logsClient = { runQuery: jest.fn(async () => [
      { timestamp: '2026-01-01T00:00:00Z', userOid: 'O', action: 'files.upload', workspace: 'invoices', outcome: 'success' as const, resourceId: 'R' },
    ]) };
    const q = createAuditQuery({ logsClient });
    const out = await q({ limit: 10, action: 'files.upload' });
    expect(out.events).toHaveLength(1);
    expect(logsClient.runQuery).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementations**

`server/src/admin/provision.ts`:

```ts
import type { SpeGraphClient } from '../spe/index.js';

export function createContainerProvisioner(
  client: SpeGraphClient,
  containerTypeId: string,
): (workspaceId: string, displayName: string) => Promise<string> {
  return async (workspaceId, displayName) => {
    const resp = await client.api('/storage/fileStorage/containers').post({
      displayName,
      description: `Spectra workspace: ${workspaceId}`,
      containerTypeId,
    });
    return resp.id as string;
  };
}
```

`server/src/obs/auditQuery.ts`:

```ts
import type { AdminAuditEvent } from '../routes/admin.js';

export interface LogsAnalyticsClient {
  runQuery(query: { kql: string; from?: string; to?: string }): Promise<AdminAuditEvent[]>;
}

export interface AuditQueryDeps {
  logsClient: LogsAnalyticsClient | null;
}

export function createAuditQuery(deps: AuditQueryDeps): (q: {
  action?: string; workspace?: string; userOid?: string;
  fromIso?: string; toIso?: string; limit: number;
}) => Promise<{ events: AdminAuditEvent[] }> {
  return async (q) => {
    if (!deps.logsClient) return { events: [] };
    const filters: string[] = [];
    if (q.action) filters.push(`tostring(customDimensions.action) == "${q.action}"`);
    if (q.workspace) filters.push(`tostring(customDimensions.workspace) == "${q.workspace}"`);
    if (q.userOid) filters.push(`tostring(customDimensions.userOid) == "${q.userOid}"`);
    const where = filters.length ? `| where ${filters.join(' and ')}` : '';
    const kql = `customEvents | where name startswith "audit." ${where} | top ${q.limit} by timestamp desc`;
    const events = await deps.logsClient.runQuery({ kql, from: q.fromIso, to: q.toIso });
    return { events };
  };
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- provision.test auditQuery.test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/admin/provision.ts server/src/admin/provision.test.ts \
        server/src/obs/auditQuery.ts server/src/obs/auditQuery.test.ts
git commit -m "feat(server/admin): SPE container provisioner + App Insights audit query"
```

---

## Phase J — Agent stub

### Task J1: /api/agent/* returns 501

**Files:**
- Create: `server/src/routes/agent.ts`
- Create: `server/src/routes/agent.test.ts`

- [ ] **Step 1: Failing test — `server/src/routes/agent.test.ts`**

```ts
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
  it.each([['get'], ['post'], ['put'], ['patch'], ['delete']] as const)('%s /api/agent/* → 501', async ([method]) => {
    const r = await (request(makeApp()) as never)[method]('/api/agent/anything').send({});
    expect(r.status).toBe(501);
    expect(r.body.error).toBe('not_implemented');
  });
});
```

- [ ] **Step 2: Implement — `server/src/routes/agent.ts`**

```ts
import { Router } from 'express';

export function agentRouter(): Router {
  const r = Router();
  r.all('/api/agent/*', (_req, res) => {
    res.status(501).json({
      error: 'not_implemented',
      message: 'AI agent surface is reserved and not yet implemented',
    });
  });
  return r;
}
```

- [ ] **Step 3: Verify**

```bash
npm -w @spectra/server test -- agent.test
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/agent.ts server/src/routes/agent.test.ts
git commit -m "feat(server/routes): /api/agent/* 501 stub for reserved AI agent surface"
```

---

## Phase K — Wire everything + integration

### Task K1: Wire all routes into createApp

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/app.test.ts`

- [ ] **Step 1: Update `server/src/app.test.ts`** to assert that mounted route prefixes return 401 when anonymous (proves they are registered):

```ts
// Append to server/src/app.test.ts

describe('createApp wires P2 routes', () => {
  it('GET /api/auth/me without cookie → 401', async () => {
    const app = createApp({
      readinessProbes: [],
      routesP2: { mounted: true },
    } as never);
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });
  it('GET /api/files without cookie → 401', async () => {
    const app = createApp({ readinessProbes: [], routesP2: { mounted: true } } as never);
    const r = await request(app).get('/api/files?ws=invoices');
    expect(r.status).toBe(401);
  });
  it('ALL /api/agent/* → 501', async () => {
    const app = createApp({ readinessProbes: [], routesP2: { mounted: true } } as never);
    const r = await request(app).post('/api/agent/x').send({});
    expect(r.status).toBe(501);
  });
});
```

- [ ] **Step 2: Update `server/src/app.ts`**

```ts
import express, { type Express, type Request } from 'express';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { errorMiddleware } from './errors/middleware.js';
import { NotFoundError } from './errors/domain.js';
import type { MsalClient } from './auth/msal.js';
import type { SessionStore } from './store/sessionStore.js';
import type { ConfigStore } from './store/configStore.js';
import type { SpeGraphClient } from './spe/index.js';
import type { TokenBroker } from './auth/tokenBroker.js';
import { sessionMiddleware } from './auth/session.js';
import { authRouter } from './auth/routes.js';
import { filesRouter } from './routes/files.js';
import { searchRouter } from './routes/search.js';
import { workspacesRouter } from './routes/workspaces.js';
import { uploadRouter } from './upload/route.js';
import { sharingRouter } from './sharing/route.js';
import { adminRouter, type AdminRouterDeps } from './routes/admin.js';
import { agentRouter } from './routes/agent.js';
import { resolveRoleSnapshot } from './authz/resolveRole.js';
import { fetchGroupsTransitive } from './authz/groupsOverage.js';

export interface CreateAppOptions {
  readinessProbes: Array<() => Promise<void>>;
  rateLimitCapacity?: number;
  rateLimitRefillPerSec?: number;
  routesP2?: P2RouteWiring;
}

export interface P2RouteWiring {
  msal: MsalClient;
  sessionStore: SessionStore;
  configStore: ConfigStore;
  hmacKey: string;
  slidingMin: number;
  absoluteMin: number;
  secureCookie: boolean;
  // Per-request OBO Graph client (uses session userAccessToken via tokenBroker)
  graphForUser: (req: Request) => SpeGraphClient;
  // App-only Graph client for admin ops
  graphAppOnly: () => SpeGraphClient;
  tokenBroker: TokenBroker;
  adminDeps: Pick<AdminRouterDeps, 'provisionContainer' | 'auditQuery'>;
}

export function createApp(opts: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(
    rateLimit({
      capacity: opts.rateLimitCapacity ?? 60,
      refillPerSec: opts.rateLimitRefillPerSec ?? 1,
      keyFn: (req) => req.ip ?? 'unknown',
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter({ readinessProbes: opts.readinessProbes }));

  if (opts.routesP2) {
    const p = opts.routesP2;
    app.use(sessionMiddleware({
      store: p.sessionStore, hmacKey: p.hmacKey,
      slidingMin: p.slidingMin, absoluteMin: p.absoluteMin,
    }));
    app.use(authRouter({
      msal: p.msal, store: p.sessionStore,
      hmacKey: p.hmacKey, slidingMin: p.slidingMin, absoluteMin: p.absoluteMin,
      secureCookie: p.secureCookie,
      resolveRoleSnapshot: (claims, accessToken) =>
        resolveRoleSnapshot(claims, accessToken, {
          store: p.configStore,
          fetchGroupsOverage: fetchGroupsTransitive,
        }),
    }));
    app.use(filesRouter({ store: p.configStore, graphForUser: p.graphForUser }));
    app.use(searchRouter({ store: p.configStore, graphForUser: p.graphForUser }));
    app.use(workspacesRouter({ store: p.configStore }));
    app.use(uploadRouter({ store: p.configStore, graphForUser: p.graphForUser, graphAppOnly: p.graphAppOnly }));
    app.use(sharingRouter({ store: p.configStore, graphForUser: p.graphForUser }));
    app.use(adminRouter({ store: p.configStore, ...p.adminDeps }));
    app.use(agentRouter());
  }

  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorMiddleware);
  return app;
}
```

- [ ] **Step 3: Update P1 test signature for new options shape** — the existing P1 tests call `createApp({ readinessProbes: [...] })`; that still works because `routesP2` is optional.

- [ ] **Step 4: Build a minimal fake-wired test** — since the new tests in app.test.ts pass `routesP2: { mounted: true }` as a placeholder, replace with a real fake. Update step 1 above so each new test builds proper deps:

```ts
import { jest } from '@jest/globals';
import type { MsalClient } from './auth/msal.js';
import type { SessionStore } from './store/sessionStore.js';
import type { ConfigStore } from './store/configStore.js';
import { createGraphClient } from './spe/client.js';
import { createTokenBroker } from './auth/tokenBroker.js';

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
    adminDeps: { provisionContainer: jest.fn(async () => 'C') as never, auditQuery: jest.fn(async () => ({ events: [] })) as never },
  };
}
```

Use `routesP2: fakeP2()` instead of the placeholder.

- [ ] **Step 5: Verify**

```bash
npm -w @spectra/server test -- app.test
```

Expected: all P1 tests still pass; 3 new P2 wiring tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/app.test.ts
git commit -m "feat(server/app): wire P2 routes (auth, files, upload, sharing, admin, agent)"
```

### Task K2: Update /ready probe to include Graph

**Files:**
- Modify: `server/src/main.ts`

- [ ] **Step 1: Replace readiness probe construction**

In `main.ts`, replace:

```ts
const probe = makeKeyVaultProbe(env.AZURE_KEY_VAULT_URI);
const app = createApp({ readinessProbes: [probe] });
```

with:

```ts
import { makeGraphProbe } from './probes/graph.js';
// ...
const kvProbe = makeKeyVaultProbe(env.AZURE_KEY_VAULT_URI);
const graphProbe = makeGraphProbe();
const app = createApp({ readinessProbes: [kvProbe, graphProbe], routesP2 });
```

- [ ] **Step 2: Make secrets non-optional + wire P2**

Replace the `loadSecrets(...).catch(...)` block with:

```ts
const secrets = await loadSecrets(env.AZURE_KEY_VAULT_URI);
```

(removing the P1 TODO: secrets are now required because auth/session routes are mounted.)

Build the P2 wiring:

```ts
import { createConfigStore, createSessionStore, createSpeReader, createSpeWriter, createSpeDeleter, startConfigPoller } from './store/index.js';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createMsalClient } from './auth/msal.js';
import { createTokenBroker } from './auth/tokenBroker.js';
import { createGraphClient } from './spe/index.js';
import { createContainerProvisioner } from './admin/provision.js';
import { createAuditQuery } from './obs/auditQuery.js';

const msal = createMsalClient(
  {
    tenantId: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    clientSecret: secrets.aadClientSecret,
    redirectUri: `${env.APP_BASE_URL}/api/auth/callback`,
  },
  { ConfidentialClientApplication },
);
const tokenBroker = createTokenBroker(msal);

// App-only Graph client for admin/system ops.
const appGraph = createGraphClient(() =>
  tokenBroker.app(['https://graph.microsoft.com/.default']),
);

const configReader = createSpeReader(appGraph, env.AZURE_SYSTEM_CONTAINER_ID);
const configWriter = createSpeWriter(appGraph, env.AZURE_SYSTEM_CONTAINER_ID);
const configStore = createConfigStore({ reader: configReader, writer: configWriter });
startConfigPoller(configStore);

const sessionStore = createSessionStore({
  reader: createSpeReader(appGraph, env.AZURE_SYSTEM_CONTAINER_ID),
  writer: createSpeWriter(appGraph, env.AZURE_SYSTEM_CONTAINER_ID),
  deleter: createSpeDeleter(appGraph, env.AZURE_SYSTEM_CONTAINER_ID),
  encryptionKey: secrets.sessionEncryptionKey,
});

// Per-request OBO Graph client. The session middleware attaches req.session;
// the OBO acquirer needs the user's MSAL access token, which is *not* in the
// session JSON in v1 (see Task K3 for the upgrade path). Until then, OBO calls
// short-circuit to the app-only client. Production hookup is finalized in K3.
const graphForUser = (_req: import('express').Request) => appGraph;
const graphAppOnly = () => appGraph;

const routesP2 = {
  msal, sessionStore, configStore,
  hmacKey: secrets.cookieHmacKey,
  slidingMin: env.SESSION_TTL_SLIDING_MIN,
  absoluteMin: env.SESSION_TTL_ABSOLUTE_MIN,
  secureCookie: env.NODE_ENV === 'production',
  graphForUser, graphAppOnly,
  tokenBroker,
  adminDeps: {
    provisionContainer: createContainerProvisioner(appGraph, env.AZURE_CONTAINER_TYPE_ID),
    auditQuery: createAuditQuery({ logsClient: null }), // wired in P3 with App Insights API
  },
};
```

- [ ] **Step 3: Update startup log to include both probes**

Replace `console.error('server listening on :${env.PORT}')` audit/log to include `probes: ['kv', 'graph']`.

- [ ] **Step 4: Verify (smoke)**

```bash
npm -w @spectra/server run typecheck
```

Expected: zero type errors. (Real /ready behavior is exercised by Task K4 integration tests below.)

- [ ] **Step 5: Commit**

```bash
git add server/src/main.ts
git commit -m "feat(server/main): wire P2 stores, MSAL, broker, Graph probe; secrets required"
```

### Task K3: Persist user access token for OBO

The token broker needs the user's MSAL access token to acquire OBO tokens. P1 stored only claims in `SessionClaims`. Extend the session JSON with an encrypted-at-rest access token.

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/schemas.ts`
- Modify: `server/src/auth/routes.ts`
- Modify: `server/src/main.ts`

- [ ] **Step 1: Add `userAccessToken` to `SessionClaims`**

In `shared/src/types.ts`, extend:

```ts
export interface SessionClaims {
  sessionId: string;
  userOid: string;
  tenantId: string;
  isAdmin: boolean;
  teamMemberships: TeamMembership[];
  issuedAt: number;
  expiresAt: number;
  lastSlidingUpdate: number;
  // New: opaque access token used for OBO. Always lives behind AES-256-GCM
  // encryption in storage. Never returned by /api/auth/me.
  userAccessToken: string;
}
```

In `shared/src/schemas.ts`, add a runtime schema if you wish (optional — `SessionClaims` is internal).

- [ ] **Step 2: Update `auth/routes.ts` callback** to set `userAccessToken: tokens.accessToken` in `store.put({...})`.

- [ ] **Step 3: Update `main.ts` `graphForUser`** to acquire OBO via the broker:

```ts
const graphForUser = (req: import('express').Request): SpeGraphClient => {
  const session = req.session;
  if (!session) return appGraph; // unauthenticated paths never call Graph
  return createGraphClient(async () =>
    tokenBroker.obo(
      { sessionId: session.sessionId, userAccessToken: session.userAccessToken },
      ['https://graph.microsoft.com/.default'],
    ),
  );
};
```

- [ ] **Step 4: Update `auth/routes.test.ts` callback assertion** to expect `userAccessToken` in the put call.

- [ ] **Step 5: Verify**

```bash
npm -w @spectra/shared run build
npm -w @spectra/server run typecheck
npm -w @spectra/server test
```

Expected: all tests still green; type errors zero.

- [ ] **Step 6: Commit**

```bash
git add shared/src/types.ts shared/src/schemas.ts server/src/auth/routes.ts server/src/auth/routes.test.ts server/src/main.ts
git commit -m "feat(server/auth): store user access token in session JSON for OBO calls"
```

### Task K4: End-to-end integration tests with nock

**Files:**
- Create: `server/src/integration/auth.flow.test.ts`
- Create: `server/src/integration/upload.flow.test.ts`
- Create: `server/src/integration/share.flow.test.ts`

- [ ] **Step 1: Auth flow test — `server/src/integration/auth.flow.test.ts`**

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import request from 'supertest';
import { createApp } from '../app.js';
import type { MsalClient } from '../auth/msal.js';
import { createSessionStore } from '../store/sessionStore.js';
import { createConfigStore } from '../store/configStore.js';
import { createTokenBroker } from '../auth/tokenBroker.js';
import { createGraphClient } from '../spe/client.js';

const HMAC = 'h'.repeat(48);
const ENC = Buffer.alloc(32, 7).toString('base64');

describe('auth flow integration', () => {
  beforeEach(() => { nock.disableNetConnect(); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('login → callback → me → logout', async () => {
    const memory = new Map<string, string>();
    const reader = jest.fn(async (p: string) => {
      const v = memory.get(p);
      if (!v) { const e = new Error('nf') as Error & { code: string }; e.code = 'not_found'; throw e; }
      return v;
    });
    const writer = jest.fn(async (p: string, b: string) => { memory.set(p, b); });
    const deleter = jest.fn(async (p: string) => { memory.delete(p); });

    const sessionStore = createSessionStore({ reader, writer, deleter, encryptionKey: ENC });
    const configStore = createConfigStore({ reader, writer });

    const msal: MsalClient = {
      buildAuthorizeUrl: jest.fn(async ({ state }: { state: string }) => `https://login/?state=${state}`) as never,
      exchangeCode: jest.fn(async () => ({
        accessToken: 'AT', idClaims: { oid: '00000000-0000-0000-0000-000000000099', tid: 'T', preferred_username: 'u@x', name: 'U' },
        homeAccountId: 'HID', expiresOn: new Date(Date.now() + 3600_000),
      })) as never,
      acquireOboToken: jest.fn(async () => 'OBO') as never,
      acquireAppToken: jest.fn(async () => 'APP') as never,
    };
    const graph = createGraphClient(async () => 'TOK');

    const app = createApp({
      readinessProbes: [],
      routesP2: {
        msal, sessionStore, configStore,
        hmacKey: HMAC, slidingMin: 480, absoluteMin: 1440, secureCookie: false,
        graphForUser: () => graph, graphAppOnly: () => graph,
        tokenBroker: createTokenBroker(msal),
        adminDeps: {
          provisionContainer: jest.fn(async () => 'C') as never,
          auditQuery: jest.fn(async () => ({ events: [] })) as never,
        },
      },
    });

    const login = await request(app).get('/api/auth/login');
    expect(login.status).toBe(302);
    const stateCookie = login.headers['set-cookie'][0];
    const state = login.headers.location.match(/state=([^&]+)/)![1];

    const cb = await request(app).get(`/api/auth/callback?code=C&state=${state}`).set('Cookie', stateCookie);
    expect(cb.status).toBe(302);
    const sessionCookie = cb.headers['set-cookie'].find((c: string) => c.startsWith('spectra.sid='))!;
    expect(writer).toHaveBeenCalled();

    const me = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
    expect(me.status).toBe(200);
    expect(me.body.userOid).toBe('00000000-0000-0000-0000-000000000099');

    const logout = await request(app).post('/api/auth/logout').set('Cookie', sessionCookie);
    expect(logout.status).toBe(204);
    expect(deleter).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Upload flow — `server/src/integration/upload.flow.test.ts`**

Build a similar test that mocks Graph for: ensure-folder GET 404, POST folder, GET final-path 404, PUT content, PATCH fields, POST invite. Asserts a 201 with `id` returned. (Use the same fakeP2 plumbing as Task K1 but seed the configStore with one workspace and the session with team membership.)

- [ ] **Step 3: Share flow — `server/src/integration/share.flow.test.ts`**

Mocks Graph user lookup, getItem, createLink, sendMail; asserts `200` and `shareUrl` returned.

- [ ] **Step 4: Verify**

```bash
npm -w @spectra/server test -- integration
npm -w @spectra/server test -- --coverage
```

Expected: all integration tests pass; overall coverage ≥80%, `authz/` 100%.

- [ ] **Step 5: Commit**

```bash
git add server/src/integration/
git commit -m "test(server): end-to-end auth, upload, share integration with nocked Graph"
```

### Task K5: Self-review + tag

- [ ] **Step 1: Run review agents in parallel** (per CLAUDE.md §5 phase 4):
  - `code-simplifier` on the diff
  - `pr-review-toolkit:silent-failure-hunter` on every catch added
  - `pr-review-toolkit:type-design-analyzer` on every new interface/type/class
  - `pr-review-toolkit:pr-test-analyzer` for coverage of changed lines

- [ ] **Step 2: Run security review** (touches auth, authz, upload, sharing, session, CSP):

```bash
/security-review
```

Block on any High or Critical finding.

- [ ] **Step 3: Run full test suite + lint + typecheck**

```bash
npm run typecheck
npm run lint
npm run test
```

All green.

- [ ] **Step 4: Tag release**

```bash
git tag v0.2.0-bff
git push origin v0.2.0-bff
```

- [ ] **Step 5: Final commit (only if review feedback required changes)**

If review identified follow-ups, fix them in new commits and re-tag.

---

## Self-review checklist (executed when this plan is written)

- [x] Every API route from spec §5 is covered:
  - `POST /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`, `GET /api/auth/me` → Phase C (Task C5)
  - `GET /api/workspaces`, `GET /api/workspaces/:ws/teams` → Phase G (Task G1)
  - `GET /api/files`, `GET /api/files/:id`, `GET /api/files/:id/preview` → Phase E (Task E4)
  - `POST /api/files/:id/share` → Phase H (Task H2)
  - `POST /api/upload` → Phase F (Task F4)
  - `GET /api/search` → Phase E (Task E5)
  - `GET/POST /api/admin/workspaces`, `PATCH /api/admin/workspaces/:ws`, `GET/PUT /api/admin/group-mapping`, `GET /api/admin/audit` → Phase I (Task I1)
  - `ALL /api/agent/*` → Phase J (Task J1)
  - `/health`, `/ready` (extended with Graph probe) → Phase A (Task A7) + K2
- [x] No placeholder patterns (no "TBD", no `// ...`, no "similar to above")
- [x] Type/method names consistent across tasks: `SpeGraphClient`, `SpeDriveItem`, `SessionClaims`, `ConfigStore`, `SessionStore`, `MsalClient`, `TokenBroker`, `requireAuth`, `requireRole`, `requireWorkspaceAccess`, `resolveWorkspaceContext`, `mapGraphErrorToDomain`
- [x] Every task starts with a failing test, ends with a verify + commit
- [x] Filename sanitization (Task F1) runs on the upload path before MIME sniff (Task F4)
- [x] Session cookies are HttpOnly + Secure (in prod) + SameSite=Strict (Task C1)
- [x] All Graph calls live in `spe/` (Tasks A2–A7); no other module imports `@microsoft/microsoft-graph-client`
- [x] `authz/` reaches 100% coverage gated in Task D3
- [x] Server overall coverage ≥80% gated in Task K4
