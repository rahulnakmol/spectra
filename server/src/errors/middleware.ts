import type { ErrorRequestHandler } from 'express';
import { DomainError } from './domain.js';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof DomainError) {
    res.status(err.status).json({ error: err.code, message: err.publicMessage });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'internal', message: 'An unexpected error occurred' });
};
