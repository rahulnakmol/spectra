import { useQuery } from '@tanstack/react-query';
import type { AppSettings } from '@spectra/shared';
import { request } from '../client';

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: () => request<AppSettings>('/app-settings'),
    staleTime: 5 * 60_000,
  });
}
