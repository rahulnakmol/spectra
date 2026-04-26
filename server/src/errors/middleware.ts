import type { ErrorRequestHandler } from 'express';
import { DomainError } from './domain.js';
import { getAppInsightsClient } from '../obs/appInsights.js';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  const client = getAppInsightsClient();
  if (client) {
    client.trackException({
      exception: err instanceof Error ? err : new Error(String(err)),
    });
  }

  if (err instanceof DomainError) {
    res.status(err.status).json({ error: err.code, message: err.publicMessage });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'internal', message: 'An unexpected error occurred' });
};
