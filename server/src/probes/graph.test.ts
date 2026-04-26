import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { makeGraphProbe } from './graph.js';

describe('makeGraphProbe', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as unknown as typeof fetch;
    nock.disableNetConnect();
  });
  afterEach(() => { global.fetch = originalFetch; nock.cleanAll(); nock.enableNetConnect(); });

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
