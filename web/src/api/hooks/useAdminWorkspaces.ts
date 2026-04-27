import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceConfig } from '@spectra/shared';
import { request } from '../client';

export function useAdminWorkspaces() {
  return useQuery({
    queryKey: ['admin', 'workspaces'],
    queryFn: () => request<WorkspaceConfig[]>('/admin/workspaces'),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<WorkspaceConfig>) =>
      request<WorkspaceConfig>('/admin/workspaces', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: Partial<WorkspaceConfig> }) =>
      request<WorkspaceConfig>(`/admin/workspaces/${input.id}`, { method: 'PATCH', body: input.patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
  });
}
