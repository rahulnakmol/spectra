export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends DomainError {
  constructor(publicMessage: string, detail?: Record<string, unknown>) {
    super('bad_request', publicMessage, 400, publicMessage, detail);
  }
}
export class UnauthenticatedError extends DomainError {
  constructor(publicMessage = 'Authentication required') {
    super('unauthenticated', publicMessage, 401, publicMessage);
  }
}
export class ForbiddenError extends DomainError {
  constructor(publicMessage = 'Access denied') {
    super('forbidden', publicMessage, 403, publicMessage);
  }
}
export class NotFoundError extends DomainError {
  constructor(publicMessage = 'Resource not found') {
    super('not_found', publicMessage, 404, publicMessage);
  }
}
export class ConflictError extends DomainError {
  constructor(publicMessage: string, detail?: Record<string, unknown>) {
    super('conflict', publicMessage, 409, publicMessage, detail);
  }
}
export class UpstreamError extends DomainError {
  constructor(publicMessage = 'Upstream service unavailable') {
    super('upstream', publicMessage, 502, publicMessage);
  }
}
