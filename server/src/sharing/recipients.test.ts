import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { resolveRecipients } from './recipients.js';
import { createGraphClient } from '../spe/client.js';

let originalFetch: typeof global.fetch;

describe('resolveRecipients', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof global.fetch;
    nock.disableNetConnect();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    nock.cleanAll();
    nock.enableNetConnect();
  });

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
