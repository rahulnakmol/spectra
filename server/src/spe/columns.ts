import type { SpeGraphClient } from './client.js';

export async function setItemFields(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
  fields: Record<string, string | number | null>,
): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}/listItem/fields`).patch(fields);
}
