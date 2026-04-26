import { describe, it, expect, jest } from '@jest/globals';
import { createAuditQuery } from './auditQuery.js';

describe('auditQuery', () => {
  it('returns empty when no client provided', async () => {
    const q = createAuditQuery({ logsClient: null });
    expect((await q({ limit: 10 })).events).toEqual([]);
  });
  it('returns events from logs client', async () => {
    const logsClient = { runQuery: jest.fn(async () => [
      { timestamp: '2026-01-01T00:00:00Z', userOid: 'O', action: 'files.upload', workspace: 'invoices', outcome: 'success' as const, resourceId: 'R' },
    ]) };
    const q = createAuditQuery({ logsClient });
    const out = await q({ limit: 10, action: 'files.upload' });
    expect(out.events).toHaveLength(1);
    expect(logsClient.runQuery).toHaveBeenCalled();
  });
});
