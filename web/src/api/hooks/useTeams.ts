import { useQuery } from '@tanstack/react-query';
import type { TeamMembership } from '@spectra/shared';
import { request } from '../client';

export function useTeams(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'teams'],
    queryFn: () => request<TeamMembership[]>(`/workspaces/${workspaceId}/teams`),
    enabled: Boolean(workspaceId),
  });
}
