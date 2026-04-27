import { useEffect, useState, useCallback } from 'react';
import { request } from '../api/client';

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'spectra.theme';

async function persist(mode: ThemeMode): Promise<void> {
  try {
    await request<void>('/me/preferences', { method: 'PATCH', body: { theme: mode } });
  } catch {
    // Non-fatal — theme persisted in localStorage as fallback.
  }
}

export function usePersistedTheme(initial: ThemeMode): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return initial;
    return (window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? initial;
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const update = useCallback((m: ThemeMode) => {
    setMode(m);
    void persist(m);
  }, []);

  return [mode, update];
}
