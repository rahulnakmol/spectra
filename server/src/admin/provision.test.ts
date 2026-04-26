import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from '../spe/client.js';
import { createContainerProvisioner } from './provision.js';

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

describe('createContainerProvisioner', () => {
  beforeEach(() => { nock.disableNetConnect(); nock.enableNetConnect('127.0.0.1'); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('POSTs /storage/fileStorage/containers with containerType', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/storage/fileStorage/containers', (b) => b.containerTypeId === 'CTID' && b.displayName === 'AP' && b.description === 'Spectra workspace: invoices')
      .reply(201, { id: 'NEW-C', displayName: 'AP' });
    const client = createGraphClient(async () => 'TOK');
    const provision = createContainerProvisioner(client, 'CTID');
    expect(await provision('invoices', 'AP')).toBe('NEW-C');
  });

  it('throws UpstreamError when response has no id', async () => {
    nock('https://graph.microsoft.com')
      .post('/v1.0/storage/fileStorage/containers')
      .reply(201, { displayName: 'AP' }); // no id field
    const client = createGraphClient(async () => 'TOK');
    const provision = createContainerProvisioner(client, 'CTID');
    await expect(provision('invoices', 'AP')).rejects.toThrow('Container provision returned no id');
  });
});
