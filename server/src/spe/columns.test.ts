import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { setItemFields } from './columns.js';

describe('setItemFields', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
    nock.disableNetConnect();
  });
  afterEach(() => { global.fetch = originalFetch; nock.cleanAll(); nock.enableNetConnect(); });

  it('PATCHes listItem/fields', async () => {
    const scope = nock('https://graph.microsoft.com')
      .patch('/v1.0/drives/D/items/I/listItem/fields', { Vendor: 'Acme', InvoiceNumber: 'INV-1' })
      .reply(200, { Vendor: 'Acme', InvoiceNumber: 'INV-1' });
    const client = createGraphClient(async () => 't');
    await setItemFields(client, 'D', 'I', { Vendor: 'Acme', InvoiceNumber: 'INV-1' });
    expect(scope.isDone()).toBe(true);
  });
});
