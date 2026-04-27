import { useQuery } from '@tanstack/react-query';
import { request } from '../client';

export function useFilePreview(id: string | undefined) {
  return useQuery({
    queryKey: ['files', id, 'preview'],
    queryFn: () => request<{ url: string }>(`/files/${id}/preview`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
