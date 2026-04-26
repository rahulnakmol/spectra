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
    expect(logsClient.runQuery).toHaveBeenCalledWith(expect.objectContaining({ kql: expect.stringContaining('files.upload') }));
    expect(logsClient.runQuery).toHaveBeenCalledWith(expect.objectContaining({ kql: expect.stringContaining('customDimensions.action') }));
  });

  it('adds workspace filter to KQL when provided', async () => {
    const logsClient = { runQuery: jest.fn(async () => []) };
    const q = createAuditQuery({ logsClient });
    await q({ limit: 10, workspace: 'invoices' });
    expect(logsClient.runQuery).toHaveBeenCalledWith(
      expect.objectContaining({ kql: expect.stringContaining('customDimensions.workspace') }),
    );
  });

  it('adds userOid filter to KQL when provided', async () => {
    const logsClient = { runQuery: jest.fn(async () => []) };
    const q = createAuditQuery({ logsClient });
    await q({ limit: 10, userOid: '00000000-0000-0000-0000-000000000001' });
    expect(logsClient.runQuery).toHaveBeenCalledWith(
      expect.objectContaining({ kql: expect.stringContaining('customDimensions.userOid') }),
    );
  });

  it('passes fromIso and toIso to runQuery when provided', async () => {
    const logsClient = { runQuery: jest.fn(async () => []) };
    const q = createAuditQuery({ logsClient });
    await q({ limit: 10, fromIso: '2026-01-01T00:00:00Z', toIso: '2026-01-31T00:00:00Z' });
    expect(logsClient.runQuery).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' }),
    );
  });

  it('omits from/to keys when fromIso/toIso are not provided', async () => {
    const logsClient = { runQuery: jest.fn(async () => []) };
    const q = createAuditQuery({ logsClient });
    await q({ limit: 10 });
    expect(logsClient.runQuery).toHaveBeenCalledWith(
      expect.not.objectContaining({ from: expect.anything() }),
    );
    expect(logsClient.runQuery).toHaveBeenCalledWith(
      expect.not.objectContaining({ to: expect.anything() }),
    );
  });

  it('combines multiple filters with and', async () => {
    const logsClient = { runQuery: jest.fn(async () => []) };
    const q = createAuditQuery({ logsClient });
    await q({ limit: 5, action: 'files.upload', workspace: 'invoices' });
    expect(logsClient.runQuery).toHaveBeenCalledWith(
      expect.objectContaining({ kql: expect.stringContaining(' and ') }),
    );
  });

  it('strips dangerous characters from filter values (sanitizeKqlValue)', async () => {
    const logsClient = { runQuery: jest.fn(async () => []) };
    const q = createAuditQuery({ logsClient });
    // Input contains both a double-quote and a backslash — both should be stripped from the value
    await q({ limit: 10, action: 'evil"action\\path' });
    expect(logsClient.runQuery).toHaveBeenCalledTimes(1);
    const captured = (logsClient.runQuery as jest.MockedFunction<typeof logsClient.runQuery>)
      .mock.calls.find(() => true);
    const kql = (captured as [{ kql: string }] | undefined)?.[0]?.kql ?? '';
    // The sanitized value should appear without the injected chars
    expect(kql).toContain('evilactionpath');
    // The original unsanitized chars should not appear inside the value
    expect(kql).not.toContain('evil"action');
    expect(kql).not.toContain('action\\path');
  });
});
