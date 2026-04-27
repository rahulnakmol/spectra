import { describe, it, expect } from '@jest/globals';
import { mapGraphErrorToDomain } from './types.js';
import { NotFoundError, ForbiddenError, ConflictError, UpstreamError, BadRequestError } from '../errors/domain.js';

describe('mapGraphErrorToDomain', () => {
  it('maps 404 to NotFoundError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 404, message: 'itemNotFound' });
    expect(e).toBeInstanceOf(NotFoundError);
  });
  it('maps 403 to ForbiddenError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 403, message: 'accessDenied' });
    expect(e).toBeInstanceOf(ForbiddenError);
  });
  it('maps 409 to ConflictError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 409, message: 'nameAlreadyExists' });
    expect(e).toBeInstanceOf(ConflictError);
  });
  it('maps 400 to BadRequestError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 400, message: 'invalidRequest' });
    expect(e).toBeInstanceOf(BadRequestError);
  });
  it('maps 5xx to UpstreamError', () => {
    const e = mapGraphErrorToDomain({ statusCode: 503, message: 'serviceUnavailable' });
    expect(e).toBeInstanceOf(UpstreamError);
  });
  it('maps 429 to UpstreamError with retry-after detail', () => {
    const e = mapGraphErrorToDomain({ statusCode: 429, message: 'tooManyRequests', headers: { 'retry-after': '30' } });
    expect(e).toBeInstanceOf(UpstreamError);
    expect((e as UpstreamError).detail?.retryAfterSec).toBe(30);
  });
  it('falls through unknown to UpstreamError', () => {
    const e = mapGraphErrorToDomain({ statusCode: undefined, message: 'unknown' });
    expect(e).toBeInstanceOf(UpstreamError);
  });

  it('maps 429 to UpstreamError with retry-after from Headers object (.get method)', () => {
    const headers = { get: (name: string) => name === 'retry-after' ? '45' : null };
    const e = mapGraphErrorToDomain({ statusCode: 429, message: 'throttled', headers });
    expect(e).toBeInstanceOf(UpstreamError);
    expect((e as UpstreamError).detail?.retryAfterSec).toBe(45);
  });

  it('maps 429 with no retry-after header to UpstreamError without retryAfterSec', () => {
    const e = mapGraphErrorToDomain({ statusCode: 429, message: 'throttled', headers: undefined });
    expect(e).toBeInstanceOf(UpstreamError);
    expect((e as UpstreamError).detail?.retryAfterSec).toBeUndefined();
  });

  it('maps 429 with non-numeric retry-after to UpstreamError without retryAfterSec', () => {
    const e = mapGraphErrorToDomain({ statusCode: 429, message: 'throttled', headers: { 'retry-after': 'soon' } });
    expect(e).toBeInstanceOf(UpstreamError);
    expect((e as UpstreamError).detail?.retryAfterSec).toBeUndefined();
  });

  it('maps 429 with Headers .get returning null to UpstreamError without retryAfterSec', () => {
    const headers = { get: (_name: string) => null };
    const e = mapGraphErrorToDomain({ statusCode: 429, message: 'throttled', headers });
    expect(e).toBeInstanceOf(UpstreamError);
    expect((e as UpstreamError).detail?.retryAfterSec).toBeUndefined();
  });
});
