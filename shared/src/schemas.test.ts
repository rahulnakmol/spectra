import { describe, it, expect } from 'vitest';
import {
  EnvSchema,
  MetadataFieldSchema,
  UploadRequestSchema,
  ShareRequestSchema,
  WorkspaceConfigSchema,
  GroupRoleMapEntrySchema,
  ListFilesQuerySchema,
  SearchQuerySchema,
} from './schemas.js';

describe('EnvSchema', () => {
  const valid = {
    AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    AZURE_CONTAINER_TYPE_ID: '33333333-3333-3333-3333-333333333333',
    AZURE_SYSTEM_CONTAINER_ID: 'b!xyz',
    AZURE_KEY_VAULT_URI: 'https://kv.example.vault.azure.net/',
    SHAREPOINT_HOSTNAME: 'contoso.sharepoint.com',
    APP_BASE_URL: 'https://app.example.com',
    APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=abc',
  };

  it('parses minimal valid env with defaults', () => {
    const r = EnvSchema.parse(valid);
    expect(r.SESSION_TTL_SLIDING_MIN).toBe(480);
    expect(r.SESSION_TTL_ABSOLUTE_MIN).toBe(1440);
    expect(r.LOG_LEVEL).toBe('info');
    expect(r.PORT).toBe(3000);
  });

  it('rejects invalid UUID for tenant id', () => {
    expect(() => EnvSchema.parse({ ...valid, AZURE_TENANT_ID: 'not-a-uuid' })).toThrow();
  });

  it('rejects non-URL key vault uri', () => {
    expect(() => EnvSchema.parse({ ...valid, AZURE_KEY_VAULT_URI: 'kv' })).toThrow();
  });
});

describe('UploadRequestSchema', () => {
  it('accepts a valid request', () => {
    const r = UploadRequestSchema.parse({
      workspaceId: 'ap-invoices',
      teamCode: 'ALPHA',
      year: 2026,
      month: 4,
      metadata: { Vendor: 'Acme', InvoiceNumber: 'INV-1', Amount: 100, Currency: 'USD' },
    });
    expect(r.year).toBe(2026);
  });

  it('rejects month out of range', () => {
    expect(() =>
      UploadRequestSchema.parse({
        workspaceId: 'ap-invoices',
        teamCode: 'ALPHA',
        year: 2026,
        month: 13,
        metadata: {},
      }),
    ).toThrow();
  });
});

describe('ShareRequestSchema', () => {
  it('requires at least one recipient', () => {
    expect(() =>
      ShareRequestSchema.parse({
        itemId: 'x',
        recipientUpns: [],
        expiresAt: '2026-05-23T00:00:00Z',
      }),
    ).toThrow();
  });

  it('caps recipients at 20', () => {
    const many = Array.from({ length: 21 }, (_, i) => `u${i}@x.com`);
    expect(() =>
      ShareRequestSchema.parse({
        itemId: 'x',
        recipientUpns: many,
        expiresAt: '2026-05-23T00:00:00Z',
      }),
    ).toThrow();
  });
});

describe('WorkspaceConfigSchema', () => {
  it('enforces lowercase-kebab ids', () => {
    expect(() =>
      WorkspaceConfigSchema.parse({
        id: 'AP_Invoices',
        displayName: 'AP Invoices',
        template: 'invoices',
        containerId: 'b!...',
        folderConvention: ['Team', 'YYYY', 'MM'],
        metadataSchema: [],
        archived: false,
        createdAt: '2026-04-24T00:00:00Z',
        createdByOid: '11111111-1111-1111-1111-111111111111',
      }),
    ).toThrow();
  });
});

describe('GroupRoleMapEntrySchema', () => {
  it('enforces uppercase snake team code', () => {
    expect(() =>
      GroupRoleMapEntrySchema.parse({
        entraGroupId: '11111111-1111-1111-1111-111111111111',
        entraGroupDisplayName: 'Team Alpha',
        workspaceId: 'ap-invoices',
        teamCode: 'alpha',
        teamDisplayName: 'Team Alpha',
      }),
    ).toThrow();
  });
});

describe('UploadRequestSchema metadata bounds', () => {
  const base = {
    workspaceId: 'ap-invoices',
    teamCode: 'ALPHA',
    year: 2026,
    month: 4,
  };

  it('rejects metadata with more than 50 keys', () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 51; i++) metadata[`F${i}`] = 'v';
    expect(() => UploadRequestSchema.parse({ ...base, metadata })).toThrow();
  });

  it('rejects metadata string values longer than 1024 chars', () => {
    expect(() =>
      UploadRequestSchema.parse({
        ...base,
        metadata: { Vendor: 'x'.repeat(1025) },
      }),
    ).toThrow();
  });

  it('rejects metadata keys longer than 128 chars', () => {
    const longKey = 'K'.repeat(129);
    expect(() =>
      UploadRequestSchema.parse({
        ...base,
        metadata: { [longKey]: 'v' },
      }),
    ).toThrow();
  });
});

describe('list/search query schemas', () => {
  it('parses required workspaceId', () => {
    expect(ListFilesQuerySchema.parse({ ws: 'invoices' })).toEqual({ ws: 'invoices' });
  });
  it('coerces year/month to numbers', () => {
    const out = ListFilesQuerySchema.parse({ ws: 'invoices', year: '2026', month: '4' });
    expect(out.year).toBe(2026);
    expect(out.month).toBe(4);
  });
  it('rejects invalid month', () => {
    expect(() => ListFilesQuerySchema.parse({ ws: 'invoices', month: '13' })).toThrow();
  });
  it('search requires q ≥ 2 chars', () => {
    expect(() => SearchQuerySchema.parse({ ws: 'invoices', q: 'a' })).toThrow();
    expect(SearchQuerySchema.parse({ ws: 'invoices', q: 'ab' }).q).toBe('ab');
  });
});

describe('MetadataFieldSchema enumValues refinement', () => {
  it('accepts type=string with no enumValues', () => {
    const r = MetadataFieldSchema.parse({
      name: 'Vendor',
      type: 'string',
      required: true,
      indexed: true,
    });
    expect(r.type).toBe('string');
  });

  it('rejects type=enum with no enumValues', () => {
    expect(() =>
      MetadataFieldSchema.parse({
        name: 'Status',
        type: 'enum',
        required: true,
        indexed: true,
      }),
    ).toThrow();
  });

  it('rejects type=enum with empty enumValues array', () => {
    expect(() =>
      MetadataFieldSchema.parse({
        name: 'Status',
        type: 'enum',
        required: true,
        indexed: true,
        enumValues: [],
      }),
    ).toThrow();
  });

  it('accepts type=enum with non-empty enumValues', () => {
    const r = MetadataFieldSchema.parse({
      name: 'Status',
      type: 'enum',
      required: true,
      indexed: true,
      enumValues: ['draft', 'approved'],
    });
    expect(r.enumValues).toEqual(['draft', 'approved']);
  });
});
