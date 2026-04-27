import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAdmin({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/w" replace />;
  return <>{children}</>;
}
