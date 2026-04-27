import type { WorkspaceConfig } from '@spectra/shared';
import { NotFoundError } from '../errors/domain.js';
import type { ConfigStore } from '../store/configStore.js';

export interface WorkspaceContext {
  workspace: WorkspaceConfig;
  driveId: string;
}

export async function resolveWorkspaceContext(
  store: ConfigStore,
  workspaceId: string,
): Promise<WorkspaceContext> {
  const cfg = await store.getWorkspaces();
  const ws = cfg.workspaces.find((w) => w.id === workspaceId && !w.archived);
  if (!ws) throw new NotFoundError('Workspace not found', { workspaceId });
  return { workspace: ws, driveId: ws.containerId };
}
