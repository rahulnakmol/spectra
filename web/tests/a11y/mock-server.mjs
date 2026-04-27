import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist');

const app = express();
app.use(express.json());

app.get('/api/auth/me', (_req, res) => {
  res.json({
    oid: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    displayName: 'Ada Lovelace',
    upn: 'ada@example.com',
    isAdmin: true,
    teamMemberships: [{ workspaceId: 'ap-invoices', teamCode: 'AP', teamDisplayName: 'Accounts Payable' }],
  });
});
app.get('/api/app-settings', (_req, res) => res.json({ brandName: 'Spectra', welcomePitch: 'Secure documents.', defaultTheme: 'light' }));
app.get('/api/workspaces', (_req, res) => res.json([
  { id: 'ap-invoices', displayName: 'AP Invoices', template: 'invoices', containerId: 'c1', folderConvention: ['Team','Year','Month'],
    metadataSchema: [{ name: 'Vendor', type: 'string', required: true, indexed: true }],
    archived: false, createdAt: '2026-01-01T00:00:00.000Z', createdByOid: '00000000-0000-0000-0000-000000000001' },
]));
app.get('/api/workspaces/:ws/teams', (_req, res) => res.json([
  { workspaceId: 'ap-invoices', teamCode: 'AP', teamDisplayName: 'Accounts Payable' },
]));
app.get('/api/files', (_req, res) => res.json([
  { id: 'f1', name: 'invoice-001.pdf', folderPath: '/AP/2026/04', uploadedByOid: '00000000-0000-0000-0000-000000000001',
    uploadedByDisplayName: 'Ada Lovelace', uploadedAt: '2026-04-01T00:00:00Z', sizeBytes: 2048,
    metadata: { Vendor: 'Acme', Amount: 500 } },
]));
app.get('/api/files/:id/preview', (_req, res) => res.json({ url: 'about:blank' }));
app.get('/api/admin/workspaces', (_req, res) => res.json([
  { id: 'ap-invoices', displayName: 'AP Invoices', template: 'invoices', containerId: 'c1', folderConvention: ['Team','Year','Month'],
    metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00.000Z', createdByOid: '00000000-0000-0000-0000-000000000001' },
]));
app.get('/api/admin/group-mapping', (_req, res) => res.json([]));
app.get('/api/admin/audit', (_req, res) => res.json([]));
app.get('/api/admin/groups', (_req, res) => res.json([]));
app.get('/api/users/search', (_req, res) => res.json([]));

app.use(express.static(distDir, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

const port = process.env.PORT ? Number(process.env.PORT) : 4173;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`a11y mock server on :${port}`);
});
