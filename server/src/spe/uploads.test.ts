import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nodeFetch from 'node-fetch';
import nock from 'nock';
import { createGraphClient } from './client.js';
import { ensureFolderPath, uploadSmallFile } from './uploads.js';

describe('uploads wrappers', () => {
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
