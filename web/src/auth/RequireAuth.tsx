import type { ReactNode } from 'react';
import { Spinner } from '@fluentui/react-components';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex items-center justify-center p-8">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!user) {
    window.location.href = '/api/auth/login';
    return <></>;
  }
  return <>{children}</>;
}
