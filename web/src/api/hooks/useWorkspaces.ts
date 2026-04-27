import { useQuery } from '@tanstack/react-query';
import type { WorkspaceConfig } from '@spectra/shared';
import { request } from '../client';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => request<WorkspaceConfig[]>('/workspaces'),
  });
}
