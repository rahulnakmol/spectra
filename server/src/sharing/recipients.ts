import { BadRequestError, NotFoundError } from '../errors/domain.js';
import type { SpeGraphClient } from '../spe/index.js';

export interface ResolvedRecipient {
  upn: string;
  objectId: string;
}

export async function resolveRecipients(
  client: SpeGraphClient,
  upns: string[],
): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = [];
  for (const upn of upns) {
    try {
      const resp = await client.api(`/users/${encodeURIComponent(upn)}`).get() as { id: string };
      out.push({ upn, objectId: resp.id });
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new BadRequestError(`Recipient "${upn}" is not a member of this tenant`);
      }
      throw err;
    }
  }
  return out;
}
