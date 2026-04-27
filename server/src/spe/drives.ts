import type { SpeGraphClient } from './client.js';
import type { SpeDriveItem, SpeListing } from './types.js';

export async function listChildren(
  client: SpeGraphClient,
  driveId: string,
  parentItemId: string,
  opts: { top?: number; filter?: string; orderby?: string; skipToken?: string } = {},
): Promise<SpeListing> {
  let req = client.api(`/drives/${driveId}/items/${parentItemId}/children`);
  if (opts.top !== undefined) req = req.top(opts.top);
  if (opts.filter) req = req.filter(opts.filter);
  if (opts.orderby) req = req.orderby(opts.orderby);
  if (opts.skipToken) req = req.query({ $skiptoken: opts.skipToken });
  const resp = await req.expand('listItem($expand=fields)').get();
  const nextLink = resp['@odata.nextLink'] as string | undefined;
  return {
    items: (resp.value as SpeDriveItem[]) ?? [],
    ...(nextLink !== undefined ? { nextLink } : {}),
  };
}

export async function getItem(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
): Promise<SpeDriveItem> {
  return (await client
    .api(`/drives/${driveId}/items/${itemId}`)
    .expand('listItem($expand=fields)')
    .get()) as SpeDriveItem;
}

export async function deleteItem(client: SpeGraphClient, driveId: string, itemId: string): Promise<void> {
  await client.api(`/drives/${driveId}/items/${itemId}`).delete();
}

export async function downloadItemStream(
  client: SpeGraphClient,
  driveId: string,
  itemId: string,
): Promise<Buffer> {
  const stream = await client.api(`/drives/${driveId}/items/${itemId}/content`).getStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
