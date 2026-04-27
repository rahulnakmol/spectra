import { createContext, useContext, type ReactNode } from 'react';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import { usePersistedTheme, type ThemeMode } from './usePersistedTheme';
import { useAppSettings } from '../api/hooks';

interface ThemeCtxValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeCtx = createContext<ThemeCtxValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const settings = useAppSettings();
  const initial: ThemeMode = settings.data?.defaultTheme ?? 'light';
  const [mode, setMode] = usePersistedTheme(initial);
  return (
    <ThemeCtx.Provider value={{ mode, setMode }}>
      <FluentProvider theme={mode === 'dark' ? webDarkTheme : webLightTheme}>
        {children}
      </FluentProvider>
    </ThemeCtx.Provider>
  );
}

export function useTheme(): ThemeCtxValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
