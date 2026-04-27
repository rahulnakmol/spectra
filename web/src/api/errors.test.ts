import { describe, it, expect } from 'vitest';
import { ApiError } from './errors';

describe('ApiError', () => {
  it('constructs with all fields', () => {
    const err = new ApiError(400, 'BAD_REQUEST', 'bad request', { field: 'x' });
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('bad request');
    expect(err.details).toEqual({ field: 'x' });
    expect(err.name).toBe('ApiError');
  });

  it('isApiError returns true for ApiError instances', () => {
    const err = new ApiError(500, 'SERVER_ERROR', 'server error');
    expect(ApiError.isApiError(err)).toBe(true);
  });

  it('isApiError returns false for plain errors', () => {
    expect(ApiError.isApiError(new Error('plain'))).toBe(false);
    expect(ApiError.isApiError('string')).toBe(false);
    expect(ApiError.isApiError(null)).toBe(false);
  });
});
