import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { createGraphClient } from '../spe/client.js';
import { createSpeReader, createSpeWriter } from './speBackend.js';

describe('speBackend', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
    nock.disableNetConnect();
  });
  afterEach(() => { global.fetch = originalFetch; nock.cleanAll(); nock.enableNetConnect(); });
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
