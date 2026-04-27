import type { SpeGraphClient } from './client.js';

export async function getPreviewUrl(client: SpeGraphClient, driveId: string, itemId: string): Promise<string> {
  const resp = await client.api(`/drives/${driveId}/items/${itemId}/preview`).post({}) as { getUrl?: string };
  if (!resp?.getUrl) throw new Error('Graph /preview returned no getUrl');
  return resp.getUrl;
}
