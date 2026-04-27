import { Router, type Request, type RequestHandler } from 'express';
import { SearchQuerySchema } from '@spectra/shared';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import type { SpeGraphClient, SpeDriveItem } from '../spe/index.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from './workspaceContext.js';

export interface SearchRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
}

export function searchRouter(deps: SearchRouterDeps): Router {
  const r = Router();
  const handler: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = SearchQuerySchema.safeParse(req.query);
      if (!parse.success) throw new BadRequestError('Invalid query', { issues: parse.error.message });
      const q = parse.data;
      if (!req.session.isAdmin && !req.session.teamMemberships.some((t) => t.workspaceId === q.ws)) {
        throw new ForbiddenError('No access to this workspace');
      }
      const { driveId } = await resolveWorkspaceContext(deps.store, q.ws);
      const encoded = encodeURIComponent(q.q);
      const client = deps.graphForUser(req);
      const resp = await client
        .api(`/drives/${driveId}/root/search(q='${encoded}')`)
        .expand('listItem($expand=fields)')
        .top(50)
        .get() as { value?: SpeDriveItem[] };
      const all: SpeDriveItem[] = resp.value ?? [];
      const items = all
        .filter((it) => {
          const fields = (it.listItem?.fields ?? {}) as Record<string, unknown>;
          const oid = String(fields['UploadedByOid'] ?? it.createdBy?.user?.id ?? '');
          return req.session!.isAdmin || oid === req.session!.userOid;
        })
        .map((it) => {
          const fields = (it.listItem?.fields ?? {}) as Record<string, unknown>;
          return {
            id: it.id, name: it.name,
            uploadedByOid: String(fields['UploadedByOid'] ?? ''),
            sizeBytes: it.size ?? 0,
            uploadedAt: it.createdDateTime ?? '',
          };
        });
      audit({ userOid: req.session.userOid, action: 'files.search', workspace: q.ws, outcome: 'success', detail: { count: items.length } });
      res.json({ items });
    } catch (err) { next(err); }
  };
  r.get('/api/search', requireAuth, handler);
  return r;
}
