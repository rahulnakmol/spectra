import { useQuery } from '@tanstack/react-query';
import type { UserIdentity } from '@spectra/shared';
import { request } from '../client';

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => request<UserIdentity>('/auth/me'),
    staleTime: 5 * 60_000,
  });
}
