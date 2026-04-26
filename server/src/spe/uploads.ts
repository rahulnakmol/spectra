import type { SpeGraphClient } from './client.js';
import type { SpeDriveItem } from './types.js';
import { NotFoundError } from '../errors/domain.js';

export async function ensureFolderPath(
  client: SpeGraphClient,
  driveId: string,
  segments: string[],
): Promise<{ folderId: string }> {
  // Fast path: try the full path first.
  try {
    const item = (await client.api(`/drives/${driveId}/root:/${segments.join('/')}:`).get()) as SpeDriveItem;
    return { folderId: item.id };
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  // Slow path: full path doesn't exist — create each segment in sequence from root.
  let parentId: string | undefined;
  for (const seg of segments) {
    const created = (await client
      .api(parentId ? `/drives/${driveId}/items/${parentId}/children` : `/drives/${driveId}/root/children`)
      .post({ name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })) as SpeDriveItem;
    parentId = created.id;
  }
  if (!parentId) throw new Error('ensureFolderPath: empty segments');
  return { folderId: parentId };
}

export async function uploadSmallFile(
  client: SpeGraphClient,
  driveId: string,
  parentItemId: string,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<SpeDriveItem> {
  return (await client
    .api(`/drives/${driveId}/items/${parentItemId}:/${filename}:/content`)
    .header('Content-Type', contentType)
    .put(body)) as SpeDriveItem;
}

export interface UploadSession {
  uploadUrl: string;
  expirationDateTime: string;
}

export async function createUploadSession(
  client: SpeGraphClient,
  driveId: string,
  parentItemId: string,
  filename: string,
): Promise<UploadSession> {
  const resp = await client
    .api(`/drives/${driveId}/items/${parentItemId}:/${filename}:/createUploadSession`)
    .post({
      item: { '@microsoft.graph.conflictBehavior': 'fail', name: filename },
    });
  return { uploadUrl: resp.uploadUrl as string, expirationDateTime: resp.expirationDateTime as string };
}
