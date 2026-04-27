import { useQuery } from '@tanstack/react-query';
import { request } from '../client';

export interface UserHit {
  oid: string;
  displayName: string;
  upn: string;
}

export function useUserSearch(q: string) {
  return useQuery({
    queryKey: ['user-search', q],
    queryFn: () => request<UserHit[]>('/users/search', { query: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}
