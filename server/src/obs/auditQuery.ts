import type { AdminAuditEvent } from '../routes/admin.js';

export interface LogsAnalyticsClient {
  runQuery(query: { kql: string; from?: string; to?: string }): Promise<AdminAuditEvent[]>;
}

export interface AuditQueryDeps {
  logsClient: LogsAnalyticsClient | null;
}

function sanitizeKqlValue(v: string): string {
  return v.replace(/["\\]/g, '');
}

export function createAuditQuery(deps: AuditQueryDeps): (q: {
  action?: string; workspace?: string; userOid?: string;
  fromIso?: string; toIso?: string; limit: number;
}) => Promise<{ events: AdminAuditEvent[] }> {
  return async (q) => {
    if (!deps.logsClient) return { events: [] };
    const filters: string[] = [];
    if (q.action) filters.push(`tostring(customDimensions.action) == "${sanitizeKqlValue(q.action)}"`);
    if (q.workspace) filters.push(`tostring(customDimensions.workspace) == "${sanitizeKqlValue(q.workspace)}"`);
    if (q.userOid) filters.push(`tostring(customDimensions.userOid) == "${sanitizeKqlValue(q.userOid)}"`);
    const where = filters.length ? `| where ${filters.join(' and ')}` : '';
    const kql = `customEvents | where name startswith "audit." ${where} | top ${q.limit} by timestamp desc`;
    const events = await deps.logsClient.runQuery({
      kql,
      ...(q.fromIso !== undefined ? { from: q.fromIso } : {}),
      ...(q.toIso !== undefined ? { to: q.toIso } : {}),
    });
    return { events };
  };
}
