import { useQuery } from '@tanstack/react-query';
import type { FileItem } from '@spectra/shared';
import { request } from '../client';

export interface FilesQuery {
  ws: string;
  team?: string;
  year?: number;
  month?: number;
}

export function useFiles(q: FilesQuery | undefined) {
  return useQuery({
    queryKey: ['files', q],
    queryFn: () => request<FileItem[]>('/files', { query: q as unknown as Record<string, string | number | undefined> }),
    enabled: Boolean(q?.ws),
  });
}

export function useFile(id: string | undefined) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => request<FileItem>(`/files/${id}`),
    enabled: Boolean(id),
  });
}
