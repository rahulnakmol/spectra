import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../client';

export interface UploadInput {
  file: File;
  workspaceId: string;
  teamCode: string;
  year: number;
  month: number;
  metadata: Record<string, string | number>;
  onProgress?: (pct: number) => void;
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadInput): Promise<{ id: string }> => {
      const fd = new FormData();
      fd.append('file', input.file);
      fd.append('workspaceId', input.workspaceId);
      fd.append('teamCode', input.teamCode);
      fd.append('year', String(input.year));
      fd.append('month', String(input.month));
      fd.append('metadata', JSON.stringify(input.metadata));
      input.onProgress?.(10);
      const result = await request<{ id: string }>('/upload', { method: 'POST', formData: fd });
      input.onProgress?.(100);
      return result;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['files', { ws: vars.workspaceId }] });
    },
  });
}
