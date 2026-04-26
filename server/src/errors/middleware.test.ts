import { describe, it, expect, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { errorMiddleware } from './middleware.js';
import { BadRequestError } from './domain.js';

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
});
