import { Router, type Request, type RequestHandler, type ErrorRequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { UploadRequestSchema, type MetadataField } from '@spectra/shared';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import type { SpeGraphClient } from '../spe/index.js';
import { ensureFolderPath, uploadSmallFile } from '../spe/uploads.js';
import { setItemFields } from '../spe/columns.js';
import { grantItemPermission } from '../spe/permissions.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from '../routes/workspaceContext.js';
import { sanitizeFilename } from './sanitize.js';
import { detectAndValidateMime } from './mime.js';
import { renderFolderSegments, resolveCollision } from './foldering.js';

export interface UploadRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
  graphAppOnly: () => SpeGraphClient;
}

const MAX_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

export function uploadRouter(deps: UploadRouterDeps): Router {
  const r = Router();
  const handler: RequestHandler = async (req, res, next) => {
    let upreqWorkspaceId: string | undefined;
    try {
      if (!req.session) throw new UnauthenticatedError();
      if (!req.file) throw new BadRequestError('Missing file');
      const metaRaw = typeof req.body['metadata'] === 'string' ? safeParseJson(req.body['metadata'] as string) : null;
      const reqParse = UploadRequestSchema.safeParse({
        workspaceId: req.body['workspaceId'],
        teamCode: req.body['teamCode'],
        year: Number(req.body['year']),
        month: Number(req.body['month']),
        metadata: metaRaw,
      });
      if (!reqParse.success) throw new BadRequestError('Invalid request', { issues: reqParse.error.message });
      const upreq = reqParse.data;
      upreqWorkspaceId = upreq.workspaceId;

      const teamMember = req.session.teamMemberships.find(
        (t) => t.workspaceId === upreq.workspaceId && t.teamCode === upreq.teamCode,
      );
      if (!req.session.isAdmin && !teamMember) throw new ForbiddenError('No access to this workspace/team');
      const { workspace, driveId } = await resolveWorkspaceContext(deps.store, upreq.workspaceId);
      validateMetadataAgainstSchema(upreq.metadata, workspace.metadataSchema);

      const safeName = sanitizeFilename(req.file.originalname);
      const { mime } = await detectAndValidateMime(req.file.buffer, safeName);

      const segments = renderFolderSegments(workspace.folderConvention, {
        team: teamMember?.teamDisplayName ?? upreq.teamCode,
        year: upreq.year,
        month: upreq.month,
      });
      const userClient = deps.graphForUser(req);
      const folder = await ensureFolderPath(userClient, driveId, segments);

      const finalName = await resolveCollision(safeName, async (cand) => {
        try {
          await userClient.api(`/drives/${driveId}/root:/${[...segments, cand].join('/')}:`).get();
          return true;
        } catch (err) {
          if (err instanceof NotFoundError) return false;
          throw err;
        }
      });

      let item;
      try {
        item = await uploadSmallFile(userClient, driveId, folder.folderId, finalName, req.file.buffer, mime);
      } catch (err) {
        if (err instanceof ConflictError) throw new ConflictError('Upload collision after retries', undefined, err);
        throw err;
      }

      const uploadedAt = new Date().toISOString();
      await setItemFields(userClient, driveId, item.id, {
        ...flattenMetadata(upreq.metadata),
        UploadedByOid: req.session.userOid,
        UploadedAt: uploadedAt,
      });

      await grantItemPermission(deps.graphAppOnly(), driveId, item.id, {
        recipientObjectId: req.session.userOid,
        roles: ['read'],
      });

      audit({
        userOid: req.session.userOid,
        action: 'files.upload',
        workspace: upreq.workspaceId,
        resourceId: item.id,
        outcome: 'success',
        detail: { filename: finalName, sizeBytes: req.file.size },
      });
      res.status(201).json({ id: item.id, name: finalName, folderPath: segments.join('/') });
    } catch (err) {
      audit({
        userOid: req.session?.userOid ?? 'anonymous',
        action: 'files.upload',
        outcome: 'failure',
        ...(upreqWorkspaceId !== undefined ? { workspace: upreqWorkspaceId } : {}),
        detail: { reason: err instanceof Error ? err.message : 'unknown' },
      });
      next(err);
    }
  };
  const multerErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new BadRequestError('File exceeds maximum allowed size of 25 MB'));
    }
    next(err);
  };

  r.post('/api/upload', requireAuth, upload.single('file'), multerErrorHandler, handler);
  return r;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new BadRequestError('metadata must be valid JSON');
  }
}

function validateMetadataAgainstSchema(meta: Record<string, unknown>, schema: MetadataField[]): void {
  for (const field of schema) {
    if (field.required && !(field.name in meta)) {
      throw new BadRequestError(`Missing required metadata field "${field.name}"`);
    }
    const value = meta[field.name];
    if (value === undefined) continue;
    if (field.type === 'string' && typeof value !== 'string') throw new BadRequestError(`Field "${field.name}" must be string`);
    if (field.type === 'number' && typeof value !== 'number') throw new BadRequestError(`Field "${field.name}" must be number`);
    if (field.type === 'date' && (typeof value !== 'string' || isNaN(Date.parse(value)))) {
      throw new BadRequestError(`Field "${field.name}" must be an ISO date string`);
    }
    if (
      field.type === 'enum' &&
      (typeof value !== 'string' || !(field.enumValues?.includes(value) ?? false))
    ) {
      throw new BadRequestError(`Field "${field.name}" not in allowed values`);
    }
  }
}

function flattenMetadata(meta: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}
