import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GroupRoleMapEntry } from '@spectra/shared';
import { request } from '../client';

export function useGroupMapping() {
  return useQuery({
    queryKey: ['admin', 'group-mapping'],
    queryFn: () => request<GroupRoleMapEntry[]>('/admin/group-mapping'),
  });
}

export function useReplaceGroupMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: GroupRoleMapEntry[]) =>
      request<GroupRoleMapEntry[]>('/admin/group-mapping', { method: 'PUT', body: entries }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'group-mapping'] }),
  });
}

export interface GroupSearchHit {
  id: string;
  displayName: string;
}

export function useGroupSearch(q: string) {
  return useQuery({
    queryKey: ['admin', 'group-search', q],
    queryFn: () => request<GroupSearchHit[]>('/admin/groups', { query: { q } }),
    enabled: q.trim().length >= 2,
  });
}
