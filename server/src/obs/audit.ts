import { createHash } from 'node:crypto';
import { getAppInsightsClient } from './appInsights.js';

export interface AuditRecord {
  userOid: string;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  workspace?: string;
  resourceId?: string;
  ipHash?: string;
  durationMs?: number;
  detail?: Record<string, string | number | boolean>;
}

export function audit(r: AuditRecord): void {
  const client = getAppInsightsClient();
  // Dev/test runs without a connection string — audit is best-effort, not a request-blocker.
  if (!client) return;
  const { durationMs, detail, ...rest } = r;
  client.trackEvent({
    name: `audit.${r.action}`,
    properties: { ...rest, ...(detail ?? {}) },
    ...(durationMs !== undefined ? { measurements: { durationMs } } : {}),
  });
}

export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(salt).update(ip).digest('hex');
}
