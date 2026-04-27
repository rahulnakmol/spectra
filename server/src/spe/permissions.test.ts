import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { createSharingLink, grantItemPermission } from './permissions.js';

describe('permissions wrappers', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
    nock.disableNetConnect();
  });
  afterEach(() => { global.fetch = originalFetch; nock.cleanAll(); nock.enableNetConnect(); });
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
