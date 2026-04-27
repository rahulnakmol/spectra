import { createContext, useContext, type ReactNode } from 'react';
import type { UserIdentity } from '@spectra/shared';
import { useMe } from '../api/hooks';

export interface AuthState {
  user: UserIdentity | undefined;
  isLoading: boolean;
  error: Error | null;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const me = useMe();
  return (
    <AuthCtx.Provider
      value={{ user: me.data, isLoading: me.isLoading, error: me.error as Error | null }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
