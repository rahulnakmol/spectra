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

function safeLocalStorage(): Storage | null {
  try {
    const s = window.localStorage;
    // Guard against environments where localStorage exists but methods are stubs.
    if (typeof s?.getItem !== 'function') return null;
    return s;
  } catch {
    return null;
  }
}

export function usePersistedTheme(initial: ThemeMode): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (safeLocalStorage()?.getItem(STORAGE_KEY) as ThemeMode | null) ?? initial;
  });

  useEffect(() => {
    safeLocalStorage()?.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const update = useCallback((m: ThemeMode) => {
    setMode(m);
    void persist(m);
  }, []);

  return [mode, update];
}
