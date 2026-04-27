import type { SpeGraphClient } from '../spe/index.js';
import { UpstreamError } from '../errors/domain.js';

export function createContainerProvisioner(
  client: SpeGraphClient,
  containerTypeId: string,
): (workspaceId: string, displayName: string) => Promise<string> {
  return async (workspaceId, displayName) => {
    const resp = await client.api('/storage/fileStorage/containers').post({
      displayName,
      description: `Spectra workspace: ${workspaceId}`,
      containerTypeId,
    }) as { id?: unknown };
    if (typeof resp.id !== 'string') throw new UpstreamError('Container provision returned no id');
    return resp.id;
  };
}
