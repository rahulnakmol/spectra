import { BadRequestError, ConflictError, DomainError, ForbiddenError, NotFoundError, UpstreamError } from '../errors/domain.js';

export interface GraphLikeError {
  statusCode?: number | undefined;
  message?: string | undefined;
  code?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export interface GraphTokenAcquirer {
  (): Promise<string>;
}

export interface SpeDriveItem {
  id: string;
  name: string;
  parentReference?: { path?: string; driveId?: string };
  size?: number;
  createdBy?: { user?: { id?: string; displayName?: string } };
  createdDateTime?: string;
  listItem?: { fields?: Record<string, unknown> };
}

export interface SpeListing {
  items: SpeDriveItem[];
  nextLink?: string;
}

export function mapGraphErrorToDomain(err: GraphLikeError): DomainError {
  const status = err.statusCode ?? 0;
  const msg = err.message ?? err.code ?? 'graph_error';
  if (status === 404) return new NotFoundError('Resource not found', { upstream: msg });
  if (status === 403) return new ForbiddenError('Access denied', { upstream: msg });
  if (status === 409) return new ConflictError('Conflict', { upstream: msg });
  if (status === 400) return new BadRequestError('Bad request', { upstream: msg });
  if (status === 429) {
    const ra = err.headers?.['retry-after'];
    const retryAfterSec = ra ? Number.parseInt(ra, 10) : undefined;
    return new UpstreamError('Upstream throttled', {
      upstream: msg,
      ...(Number.isFinite(retryAfterSec) ? { retryAfterSec: retryAfterSec! } : {}),
    });
  }
  return new UpstreamError('Upstream error', { upstream: msg, status });
}
