import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { errorMiddleware } from './middleware.js';
import {
  BadRequestError, UnauthenticatedError, ForbiddenError,
  NotFoundError, ConflictError, UpstreamError,
} from './domain.js';

type MockedResponse = {
  status: jest.MockedFunction<(code: number) => MockedResponse>;
  json: jest.MockedFunction<(body: unknown) => MockedResponse>;
};

function mockRes(): Response {
  const res: MockedResponse = {
    status: jest.fn<(code: number) => MockedResponse>(),
    json: jest.fn<(body: unknown) => MockedResponse>(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
}

describe('errorMiddleware', () => {
  it('maps a DomainError to its HTTP status and public message', () => {
    const res = mockRes();
    errorMiddleware(
      new BadRequestError('Missing field X'),
      {} as Request,
      res,
      jest.fn() as unknown as NextFunction,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'bad_request',
      message: 'Missing field X',
    });
  });

  it('maps an unknown error to 500 without exposing details', () => {
    const res = mockRes();
    errorMiddleware(
      new Error('internal stack leak'),
      {} as Request,
      res,
      jest.fn() as unknown as NextFunction,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'internal',
      message: 'An unexpected error occurred',
    });
  });

  it('maps UnauthenticatedError to 401', () => {
    const res = mockRes();
    errorMiddleware(new UnauthenticatedError(), {} as Request, res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthenticated', message: 'Authentication required' });
  });

  it('maps ForbiddenError to 403', () => {
    const res = mockRes();
    errorMiddleware(new ForbiddenError('Access denied'), {} as Request, res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps NotFoundError to 404', () => {
    const res = mockRes();
    errorMiddleware(new NotFoundError('Resource not found'), {} as Request, res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps ConflictError to 409', () => {
    const res = mockRes();
    errorMiddleware(new ConflictError('Already exists'), {} as Request, res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps UpstreamError to 502', () => {
    const res = mockRes();
    errorMiddleware(new UpstreamError('Service down'), {} as Request, res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('handles non-Error thrown values (string, object)', () => {
    const res = mockRes();
    errorMiddleware('something bad', {} as Request, res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  describe('when App Insights client is available', () => {
    let trackException: jest.MockedFunction<(opts: { exception: Error }) => void>;

    beforeEach(async () => {
      const appInsights = await import('applicationinsights');
      trackException = jest.fn();
      (appInsights.default as unknown as { defaultClient: unknown }).defaultClient = { trackException };
    });

    afterEach(async () => {
      const appInsights = await import('applicationinsights');
      (appInsights.default as unknown as { defaultClient: unknown }).defaultClient = undefined;
    });

    it('tracks exceptions via App Insights when client is set', () => {
      const res = mockRes();
      const err = new Error('boom');
      errorMiddleware(err, {} as Request, res, jest.fn() as unknown as NextFunction);
      expect(trackException).toHaveBeenCalledWith({ exception: err });
    });

    it('wraps non-Error values in an Error for App Insights tracking', () => {
      const res = mockRes();
      errorMiddleware('raw string error', {} as Request, res, jest.fn() as unknown as NextFunction);
      expect(trackException).toHaveBeenCalledWith(
        expect.objectContaining({ exception: expect.any(Error) }),
      );
    });
  });
});
