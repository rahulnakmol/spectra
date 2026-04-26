import { Router, type Request, type RequestHandler } from 'express';
import { ListFilesQuerySchema } from '@spectra/shared';
import type { FileItem } from '@spectra/shared';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthenticatedError } from '../errors/domain.js';
import { requireAuth } from '../auth/session.js';
import { audit } from '../obs/audit.js';
import { listChildren, getItem } from '../spe/drives.js';
import { getPreviewUrl } from '../spe/preview.js';
import type { SpeGraphClient, SpeDriveItem } from '../spe/index.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from './workspaceContext.js';

export interface FilesRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
}

function toFileItem(it: SpeDriveItem): FileItem {
  const fields = (it.listItem?.fields ?? {}) as Record<string, unknown>;
  const metadata: FileItem['metadata'] = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' || typeof v === 'number' || v === null) metadata[k] = v;
  }
  return {
    id: it.id,
    name: it.name,
    folderPath: it.parentReference?.path ?? '',
    uploadedByOid: String(fields['UploadedByOid'] ?? it.createdBy?.user?.id ?? ''),
    uploadedByDisplayName: it.createdBy?.user?.displayName ?? '',
    uploadedAt: String(fields['UploadedAt'] ?? it.createdDateTime ?? ''),
    sizeBytes: it.size ?? 0,
    metadata,
  };
}

function escapeOData(v: string): string {
  return v.replace(/'/g, "''");
}

export function filesRouter(deps: FilesRouterDeps): Router {
  const r = Router();

  const list: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = ListFilesQuerySchema.safeParse(req.query);
      if (!parse.success) throw new BadRequestError('Invalid query', { issues: parse.error.message });
      const q = parse.data;
      if (!req.session.isAdmin && !req.session.teamMemberships.some((t) => t.workspaceId === q.ws)) {
        throw new ForbiddenError('No access to this workspace');
      }
      const { driveId } = await resolveWorkspaceContext(deps.store, q.ws);
      const filterParts: string[] = [];
      if (!req.session.isAdmin) filterParts.push(`fields/UploadedByOid eq '${escapeOData(req.session.userOid)}'`);
      if (q.team) filterParts.push(`fields/Team eq '${escapeOData(q.team)}'`);
      const filter = filterParts.length ? filterParts.join(' and ') : undefined;
      const client = deps.graphForUser(req);
      const listing = await listChildren(client, driveId, 'root', {
        top: 50,
        ...(filter !== undefined ? { filter } : {}),
        ...(q.skipToken !== undefined ? { skipToken: q.skipToken } : {}),
      });
      const items = listing.items
        .map(toFileItem)
        .filter((it) => req.session!.isAdmin || it.uploadedByOid === req.session!.userOid);
      audit({ userOid: req.session.userOid, action: 'files.list', workspace: q.ws, outcome: 'success', detail: { count: items.length } });
      res.json({ items, nextLink: listing.nextLink ?? null });
    } catch (err) { next(err); }
  };

  const getOne: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const ws = typeof req.query['ws'] === 'string' ? req.query['ws'] : '';
      if (!ws) throw new BadRequestError('Missing ws');
      const { driveId } = await resolveWorkspaceContext(deps.store, ws);
      const item = await getItem(deps.graphForUser(req), driveId, req.params['id'] ?? '');
      const fileItem = toFileItem(item);
      if (!req.session.isAdmin && fileItem.uploadedByOid !== req.session.userOid) {
        throw new ForbiddenError('Access denied');
      }
      audit({ userOid: req.session.userOid, action: 'files.get', workspace: ws, resourceId: item.id, outcome: 'success' });
      res.json(fileItem);
    } catch (err) {
      if (err instanceof NotFoundError) {
        audit({ userOid: (req.session as { userOid?: string } | undefined)?.userOid ?? 'anonymous', action: 'files.get', outcome: 'failure', detail: { reason: 'not_found' } });
      }
      next(err);
    }
  };

  const preview: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const ws = typeof req.query['ws'] === 'string' ? req.query['ws'] : '';
      if (!ws) throw new BadRequestError('Missing ws');
      const { driveId } = await resolveWorkspaceContext(deps.store, ws);
      const item = await getItem(deps.graphForUser(req), driveId, req.params['id'] ?? '');
      const fileItem = toFileItem(item);
      if (!req.session.isAdmin && fileItem.uploadedByOid !== req.session.userOid) {
        throw new ForbiddenError('Access denied');
      }
      const url = await getPreviewUrl(deps.graphForUser(req), driveId, item.id);
      audit({ userOid: req.session.userOid, action: 'files.preview', workspace: ws, resourceId: item.id, outcome: 'success' });
      res.json({ previewUrl: url });
    } catch (err) { next(err); }
  };

  r.get('/api/files', requireAuth, list);
  r.get('/api/files/:id/preview', requireAuth, preview);
  r.get('/api/files/:id', requireAuth, getOne);
  return r;
}
