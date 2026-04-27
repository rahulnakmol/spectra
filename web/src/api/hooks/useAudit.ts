import { useQuery } from '@tanstack/react-query';
import { request } from '../client';

export interface AuditEntry {
  timestamp: string;
  userOid: string;
  workspace?: string;
  action: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  durationMs: number;
}

export interface AuditQuery {
  userOid?: string;
  workspace?: string;
  action?: string;
  fromIso?: string;
  toIso?: string;
}

export function useAudit(q: AuditQuery) {
  return useQuery({
    queryKey: ['admin', 'audit', q],
    queryFn: () => request<AuditEntry[]>('/admin/audit', { query: q as Record<string, string | undefined> }),
  });
}
