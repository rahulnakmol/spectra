export type DomainErrorCode = 'bad_request' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'upstream';

export abstract class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly status: number,
    readonly publicMessage: string,
    readonly detail?: Record<string, string | number | boolean | null>,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends DomainError {
  constructor(publicMessage: string, detail?: Record<string, string | number | boolean | null>, cause?: unknown) {
    super('bad_request', publicMessage, 400, publicMessage, detail, cause);
  }
}
export class UnauthenticatedError extends DomainError {
  constructor(publicMessage = 'Authentication required', detail?: Record<string, string | number | boolean | null>, cause?: unknown) {
    super('unauthenticated', publicMessage, 401, publicMessage, detail, cause);
  }
}
export class ForbiddenError extends DomainError {
  constructor(publicMessage = 'Access denied', detail?: Record<string, string | number | boolean | null>, cause?: unknown) {
    super('forbidden', publicMessage, 403, publicMessage, detail, cause);
  }
}
export class NotFoundError extends DomainError {
  constructor(publicMessage = 'Resource not found', detail?: Record<string, string | number | boolean | null>, cause?: unknown) {
    super('not_found', publicMessage, 404, publicMessage, detail, cause);
  }
}
export class ConflictError extends DomainError {
  constructor(publicMessage: string, detail?: Record<string, string | number | boolean | null>, cause?: unknown) {
    super('conflict', publicMessage, 409, publicMessage, detail, cause);
  }
}
export class UpstreamError extends DomainError {
  constructor(publicMessage = 'Upstream service unavailable', detail?: Record<string, string | number | boolean | null>, cause?: unknown) {
    super('upstream', publicMessage, 502, publicMessage, detail, cause);
  }
}
