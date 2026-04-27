import { describe, it, expect } from 'vitest';
import { createQueryClient } from './queryClient';
import { ApiError } from '../api/errors';

describe('createQueryClient', () => {
  it('returns a QueryClient instance', () => {
    const qc = createQueryClient();
    expect(qc).toBeDefined();
  });

  it('retry returns false for 4xx ApiErrors', () => {
    const qc = createQueryClient();
    const opts = qc.getDefaultOptions();
    const retry = opts.queries?.retry;
    if (typeof retry !== 'function') throw new Error('retry is not a function');
    const err = new ApiError(404, 'NOT_FOUND', 'not found');
    expect(retry(0, err)).toBe(false);
  });

  it('retry returns true for non-ApiErrors up to count 2', () => {
    const qc = createQueryClient();
    const opts = qc.getDefaultOptions();
    const retry = opts.queries?.retry;
    if (typeof retry !== 'function') throw new Error('retry is not a function');
    expect(retry(0, new Error('network error'))).toBe(true);
    expect(retry(1, new Error('network error'))).toBe(true);
    expect(retry(2, new Error('network error'))).toBe(false);
  });

  it('retry returns false for 5xx ApiError after count 2', () => {
    const qc = createQueryClient();
    const opts = qc.getDefaultOptions();
    const retry = opts.queries?.retry;
    if (typeof retry !== 'function') throw new Error('retry is not a function');
    const err = new ApiError(500, 'SERVER_ERROR', 'server error');
    expect(retry(0, err)).toBe(true);
    expect(retry(2, err)).toBe(false);
  });
});
