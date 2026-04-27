import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { getPreviewUrl } from './preview.js';

describe('getPreviewUrl', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
    nock.disableNetConnect();
  });
  afterEach(() => { global.fetch = originalFetch; nock.cleanAll(); nock.enableNetConnect(); });

  it('returns getUrl from /preview', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/drives/D/items/I/preview')
      .reply(200, { getUrl: 'https://contoso.sharepoint.com/embed/xyz', postUrl: null });
    const client = createGraphClient(async () => 't');
    const url = await getPreviewUrl(client, 'D', 'I');
    expect(url).toBe('https://contoso.sharepoint.com/embed/xyz');
  });

  it('throws when Graph /preview returns no getUrl', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/drives/D/items/I/preview')
      .reply(200, { postUrl: 'https://something.else' }); // no getUrl
    const client = createGraphClient(async () => 't');
    await expect(getPreviewUrl(client, 'D', 'I')).rejects.toThrow('Graph /preview returned no getUrl');
  });

  it('throws when Graph /preview returns null getUrl', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/drives/D/items/I/preview')
      .reply(200, { getUrl: null });
    const client = createGraphClient(async () => 't');
    await expect(getPreviewUrl(client, 'D', 'I')).rejects.toThrow('Graph /preview returned no getUrl');
  });
});
