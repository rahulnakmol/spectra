import { useQuery } from '@tanstack/react-query';
import type { FileItem } from '@spectra/shared';
import { request } from '../client';

export function useSearch(ws: string | undefined, q: string) {
  return useQuery({
    queryKey: ['search', ws, q],
    queryFn: () => request<FileItem[]>('/search', { query: { ws, q } }),
    enabled: Boolean(ws) && q.trim().length >= 2,
  });
}
