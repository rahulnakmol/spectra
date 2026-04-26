import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const trackEventMock = jest.fn();

jest.unstable_mockModule('./appInsights.js', () => ({
  getAppInsightsClient: () => ({ trackEvent: trackEventMock }),
  initAppInsights: () => {},
}));

const { audit, hashIp } = await import('./audit.js');

describe('audit', () => {
  beforeEach(() => { trackEventMock.mockReset(); });

  it('emits a trackEvent with normalized name and properties', () => {
    audit({
      userOid: '11111111-1111-1111-1111-111111111111',
      action: 'file.upload',
      workspace: 'ap-invoices',
      resourceId: 'item-1',
      outcome: 'success',
      ipHash: 'hashed',
      durationMs: 42,
    });
    expect(trackEventMock).toHaveBeenCalledWith({
      name: 'audit.file.upload',
      properties: expect.objectContaining({
        userOid: '11111111-1111-1111-1111-111111111111',
        workspace: 'ap-invoices',
        resourceId: 'item-1',
        outcome: 'success',
        ipHash: 'hashed',
      }),
      measurements: { durationMs: 42 },
    });
  });

  it('omits measurements when durationMs is not provided', () => {
    audit({ userOid: 'u', action: 'app.start', outcome: 'success' });
    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call).toEqual({
      name: 'audit.app.start',
      properties: { userOid: 'u', action: 'app.start', outcome: 'success' },
    });
    expect(call).not.toHaveProperty('measurements');
  });

  it('merges detail into properties and preserves number/boolean values', () => {
    audit({
      userOid: 'u',
      action: 'rate.limit',
      outcome: 'denied',
      detail: { requested: 5, allowed: false },
    });
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          userOid: 'u',
          action: 'rate.limit',
          outcome: 'denied',
          requested: 5,
          allowed: false,
        }),
      }),
    );
  });
});

describe('hashIp', () => {
  it('produces a stable, salted sha256 hex', () => {
    const a = hashIp('1.2.3.4', 'salt');
    const b = hashIp('1.2.3.4', 'salt');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('produces different hashes for different IPs and different salts', () => {
    expect(hashIp('1.2.3.4', 'salt')).not.toBe(hashIp('1.2.3.5', 'salt'));
    expect(hashIp('1.2.3.4', 'salt-a')).not.toBe(hashIp('1.2.3.4', 'salt-b'));
  });
});

it('no-ops when App Insights client is unavailable (dev mode)', async () => {
  jest.resetModules();
  jest.unstable_mockModule('./appInsights.js', () => ({
    getAppInsightsClient: () => undefined,
    initAppInsights: () => {},
  }));
  const { audit: auditNoClient } = await import('./audit.js');
  expect(() => auditNoClient({
    userOid: 'u', action: 'a', outcome: 'success',
  })).not.toThrow();
});
