import type { SpeGraphClient } from './client.js';
import { UpstreamError } from '../errors/domain.js';

export interface SharingLinkResult {
  webUrl: string;
  permissionId: string;
  expirationDateTime?: string;
}

export async function createSharingLink(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
  opts: { expiresAt: string },
): Promise<SharingLinkResult> {
  const resp = await client.api(`/drives/${driveId}/items/${itemId}/createLink`).post({
    type: 'view',
    scope: 'organization',
    preventsDownload: true,
    expirationDateTime: opts.expiresAt,
    retainInheritedPermissions: true,
  }) as { link?: { webUrl?: string }; id?: string; expirationDateTime?: string };
  const webUrl = resp.link?.webUrl;
  const permissionId = resp.id;
  if (typeof webUrl !== 'string' || typeof permissionId !== 'string') {
    throw new UpstreamError('createSharingLink response missing link.webUrl or id');
  }
  const result: SharingLinkResult = { webUrl, permissionId };
  if (resp.expirationDateTime !== undefined) {
    result.expirationDateTime = resp.expirationDateTime;
  }
  return result;
}

export async function grantItemPermission(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
  opts: { recipientObjectId: string; roles: Array<'read' | 'write'> },
): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}/invite`).post({
    requireSignIn: true,
    sendInvitation: false,
    roles: opts.roles,
    recipients: [{ objectId: opts.recipientObjectId }],
  });
}
