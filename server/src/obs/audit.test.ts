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
});

describe('hashIp', () => {
  it('produces a stable, salted sha256 hex', () => {
    const a = hashIp('1.2.3.4', 'salt');
    const b = hashIp('1.2.3.4', 'salt');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
