import { useMutation } from '@tanstack/react-query';
import type { ShareRequest } from '@spectra/shared';
import { request } from '../client';

export function useShare() {
  return useMutation({
    mutationFn: (body: ShareRequest) =>
      request<{ link: string }>(`/files/${body.itemId}/share`, { method: 'POST', body }),
  });
}
