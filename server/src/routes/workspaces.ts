import { Router, type RequestHandler } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../errors/domain.js';
import { requireAuth } from '../auth/session.js';
import { requireWorkspaceAccess } from '../authz/guards.js';
import type { ConfigStore } from '../store/configStore.js';

export interface WorkspacesRouterDeps {
  store: ConfigStore;
}

export function workspacesRouter(deps: WorkspacesRouterDeps): Router {
  const r = Router();

  const list: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const cfg = await deps.store.getWorkspaces();
      const visible = cfg.workspaces
        .filter((w) => !w.archived)
        .filter((w) => req.session!.isAdmin || req.session!.teamMemberships.some((t) => t.workspaceId === w.id))
        .map((w) => ({
          id: w.id,
          displayName: w.displayName,
          template: w.template,
          folderConvention: w.folderConvention,
          metadataSchema: w.metadataSchema,
        }));
      res.json({ workspaces: visible });
    } catch (err) { next(err); }
  };

  const teams: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const ws = req.params['ws'] ?? '';
      const userTeams = req.session.teamMemberships
        .filter((t) => t.workspaceId === ws)
        .map((t) => ({ teamCode: t.teamCode, teamDisplayName: t.teamDisplayName }));
      if (req.session.isAdmin) {
        const map = await deps.store.getGroupRoleMap();
        const seen = new Set<string>();
        for (const e of map.entries) {
          if (e.workspaceId !== ws) continue;
          if (seen.has(e.teamCode)) continue;
          seen.add(e.teamCode);
          userTeams.push({ teamCode: e.teamCode, teamDisplayName: e.teamDisplayName });
        }
      }
      if (!req.session.isAdmin && userTeams.length === 0) throw new ForbiddenError('No access to this workspace');
      res.json({ teams: userTeams });
    } catch (err) { next(err); }
  };

  r.get('/api/workspaces', requireAuth, list);
  r.get('/api/workspaces/:ws/teams', requireAuth, requireWorkspaceAccess(), teams);
  return r;
}
