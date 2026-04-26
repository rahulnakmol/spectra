import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { requireRole, requireWorkspaceAccess } from './guards.js';
import { errorMiddleware } from '../errors/middleware.js';
import type { SessionClaims } from '@spectra/shared';

function appWithSession(claims: SessionClaims | null) {
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { session: SessionClaims | null }).session = claims; next(); });
  app.get('/admin', requireRole('admin'), (_req, res) => res.json({ ok: true }));
  app.get('/ws/:ws', requireWorkspaceAccess(), (_req, res) => res.json({ ok: true }));
  app.use(errorMiddleware);
  return app;
}

const member: SessionClaims = {
  sessionId: 'S', userOid: 'O', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, absoluteExpiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
  userAccessToken: 'AT',
};
const admin: SessionClaims = { ...member, isAdmin: true, teamMemberships: [] };

describe('guards', () => {
  it('requireRole(admin) → 401 anonymous', async () => {
    const r = await request(appWithSession(null)).get('/admin');
    expect(r.status).toBe(401);
  });
  it('requireRole(admin) → 403 non-admin', async () => {
    const r = await request(appWithSession(member)).get('/admin');
    expect(r.status).toBe(403);
  });
  it('requireRole(admin) → 200 admin', async () => {
    const r = await request(appWithSession(admin)).get('/admin');
    expect(r.status).toBe(200);
  });
  it('requireWorkspaceAccess() → 200 for workspace member', async () => {
    const r = await request(appWithSession(member)).get('/ws/invoices');
    expect(r.status).toBe(200);
  });
  it('requireWorkspaceAccess() → 200 for admin (any workspace)', async () => {
    const r = await request(appWithSession(admin)).get('/ws/contracts');
    expect(r.status).toBe(200);
  });
  it('requireWorkspaceAccess() → 403 for non-member non-admin', async () => {
    const r = await request(appWithSession(member)).get('/ws/contracts');
    expect(r.status).toBe(403);
  });
  it('requireWorkspaceAccess() → 400 missing :ws param', async () => {
    const app = express();
    app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = member; n(); });
    app.get('/ws', requireWorkspaceAccess(), (_req, res) => res.json({}));
    app.use(errorMiddleware);
    const r = await request(app).get('/ws');
    expect(r.status).toBe(400);
  });
});
