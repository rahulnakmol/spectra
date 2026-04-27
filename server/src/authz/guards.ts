import type { RequestHandler } from 'express';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors/domain.js';

export function requireRole(role: 'admin'): RequestHandler {
  return (req, _res, next) => {
    if (!req.session) return next(new UnauthenticatedError());
    if (role === 'admin' && !req.session.isAdmin) return next(new ForbiddenError('Admin role required'));
    next();
  };
}

export function requireWorkspaceAccess(paramName = 'ws'): RequestHandler {
  return (req, _res, next) => {
    if (!req.session) return next(new UnauthenticatedError());
    const ws = req.params[paramName];
    if (!ws) return next(new BadRequestError(`Missing :${paramName} parameter`));
    if (req.session.isAdmin) return next();
    const isMember = req.session.teamMemberships.some((t) => t.workspaceId === ws);
    if (!isMember) return next(new ForbiddenError('No access to this workspace'));
    next();
  };
}
