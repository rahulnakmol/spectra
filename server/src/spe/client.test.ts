import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from './client.js';

// Node 20+ ships built-in fetch (undici), which nock cannot intercept.
// Override global.fetch with node-fetch v2 so nock's http interceptors work.
let originalFetch: typeof globalThis.fetch;
beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = nodeFetch as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

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
