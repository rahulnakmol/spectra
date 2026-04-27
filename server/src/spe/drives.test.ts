import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { listChildren, getItem, deleteItem, downloadItemStream } from './drives.js';

describe('drives wrappers', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
    nock.disableNetConnect();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    nock.cleanAll();
    nock.enableNetConnect();
  });

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
    expect(out.listItem?.fields?.['Vendor']).toBe('Acme');
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
