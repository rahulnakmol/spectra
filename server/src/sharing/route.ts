import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { ShareRequestSchema } from '@spectra/shared';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors/domain.js';
import { mapGraphErrorToDomain, type GraphLikeError } from '../spe/types.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import { getItem } from '../spe/drives.js';
import { createSharingLink } from '../spe/permissions.js';
import type { SpeGraphClient } from '../spe/index.js';
import type { ConfigStore } from '../store/configStore.js';
import { resolveWorkspaceContext } from '../routes/workspaceContext.js';
import { resolveRecipients } from './recipients.js';

const ShareBodySchema = ShareRequestSchema.omit({ itemId: true }).extend({ ws: z.string().min(1) });

const MAX_DAYS = 90;

export interface SharingRouterDeps {
  store: ConfigStore;
  graphForUser: (req: Request) => SpeGraphClient;
}

export function sharingRouter(deps: SharingRouterDeps): Router {
  const r = Router();
  const handler: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = ShareBodySchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid share request', { issues: parse.error.message });
      const body = parse.data;
      const expiresAt = new Date(body.expiresAt).getTime();
      const now = Date.now();
      if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new BadRequestError('expiresAt must be in the future');
      if (expiresAt - now > MAX_DAYS * 86_400_000) throw new BadRequestError(`expiresAt must be within ${MAX_DAYS} days`);

      const { driveId } = await resolveWorkspaceContext(deps.store, body.ws);
      const client = deps.graphForUser(req);

      const recipients = await resolveRecipients(client, body.recipientUpns);

      const item = await getItem(client, driveId, req.params['id'] ?? '');
      const fields = (item.listItem?.fields ?? {}) as Record<string, unknown>;
      const ownerOid = typeof fields['UploadedByOid'] === 'string' ? fields['UploadedByOid'] : undefined;
      if (!req.session.isAdmin && ownerOid !== req.session.userOid) {
        throw new ForbiddenError('You can only share files you uploaded');
      }

      const link = await createSharingLink(client, driveId, item.id, { expiresAt: body.expiresAt });

      audit({
        userOid: req.session.userOid, action: 'files.share',
        workspace: body.ws, resourceId: item.id, outcome: 'success',
        detail: { recipientCount: recipients.length, expiresAt: body.expiresAt },
      });

      const recipientList = recipients.map((rec) => ({ emailAddress: { address: rec.upn } }));
      const message = body.message ?? '';
      await client.api(`/users/${req.session.userOid}/sendMail`).post({
        message: {
          subject: `A file has been shared with you`,
          body: { contentType: 'Text', content: `${message}\n\nView: ${link.webUrl}\nExpires: ${body.expiresAt}` },
          toRecipients: recipientList,
        },
        saveToSentItems: false,
      });

      res.json({ shareUrl: link.webUrl, expiresAt: body.expiresAt });
    } catch (rawErr) {
      const err = (rawErr !== null && typeof rawErr === 'object' && 'statusCode' in rawErr)
        ? mapGraphErrorToDomain(rawErr as GraphLikeError)
        : rawErr;
      const ws = typeof req.body?.ws === 'string' ? req.body.ws : undefined;
      const rid = req.params['id'];
      audit({
        userOid: req.session?.userOid ?? 'unknown',
        action: 'files.share',
        ...(rid !== undefined ? { resourceId: rid } : {}),
        ...(ws !== undefined ? { workspace: ws } : {}),
        outcome: 'failure',
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
      next(err);
    }
  };
  r.post('/api/files/:id/share', requireAuth, handler);
  return r;
}
