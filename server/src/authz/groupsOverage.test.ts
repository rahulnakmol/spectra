import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import nodeFetch from 'node-fetch';
import { fetchGroupsTransitive } from './groupsOverage.js';
import { UpstreamError } from '../errors/domain.js';

let originalFetch: typeof global.fetch;

describe('fetchGroupsTransitive', () => {
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

  it('returns ids and follows nextLink', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/me/transitiveMemberOf/microsoft.graph.group')
      .query({ $select: 'id' })
      .reply(200, { value: [{ id: 'G1' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$skiptoken=x' })
      .get('/v1.0/me/transitiveMemberOf/microsoft.graph.group')
      .query({ $skiptoken: 'x' })
      .reply(200, { value: [{ id: 'G2' }] });
    const ids = await fetchGroupsTransitive('TOK');
    expect(ids).toEqual(['G1', 'G2']);
  });

  it('throws UpstreamError on non-OK response', async () => {
    nock('https://graph.microsoft.com')
      .get('/v1.0/me/transitiveMemberOf/microsoft.graph.group')
      .query({ $select: 'id' })
      .reply(503, {});
    await expect(fetchGroupsTransitive('TOK')).rejects.toBeInstanceOf(UpstreamError);
  });
});
