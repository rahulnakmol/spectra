import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'member']);

export const EnvSchema = z.object({
  AZURE_TENANT_ID: z.string().uuid(),
  AZURE_CLIENT_ID: z.string().uuid(),
  AZURE_CONTAINER_TYPE_ID: z.string().uuid(),
  AZURE_SYSTEM_CONTAINER_ID: z.string().min(1),
  AZURE_KEY_VAULT_URI: z.string().url(),
  SHAREPOINT_HOSTNAME: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().min(1),
  SESSION_TTL_SLIDING_MIN: z.coerce.number().int().positive().default(480),
  SESSION_TTL_ABSOLUTE_MIN: z.coerce.number().int().positive().default(1440),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
});
export type Env = z.infer<typeof EnvSchema>;

export const SecretsSchema = z.object({
  aadClientSecret: z.string().min(1),
  cookieHmacKey: z.string().min(32),
  sessionEncryptionKey: z.string().min(32),
});
export type Secrets = z.infer<typeof SecretsSchema>;

export const MetadataFieldSchema = z.object({
  name: z.string().min(1).regex(/^[A-Z][A-Za-z0-9]*$/, 'PascalCase required'),
  type: z.enum(['string', 'number', 'date', 'enum']),
  required: z.boolean(),
  indexed: z.boolean(),
  enumValues: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const WorkspaceConfigSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'lowercase-kebab required'),
  displayName: z.string().min(1),
  template: z.enum(['invoices', 'contracts', 'hr-docs', 'blank']),
  containerId: z.string().min(1),
  folderConvention: z.array(z.string()).min(1),
  metadataSchema: z.array(MetadataFieldSchema),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
  createdByOid: z.string().uuid(),
});

export const WorkspacesConfigSchema = z.object({
  workspaces: z.array(WorkspaceConfigSchema),
});

export const GroupRoleMapEntrySchema = z.object({
  entraGroupId: z.string().uuid(),
  entraGroupDisplayName: z.string().min(1),
  workspaceId: z.string().min(1),
  teamCode: z.string().min(1).regex(/^[A-Z0-9_]+$/),
  teamDisplayName: z.string().min(1),
});

export const GroupRoleMapSchema = z.object({
  entries: z.array(GroupRoleMapEntrySchema),
});

export const AppSettingsSchema = z.object({
  brandName: z.string().min(1),
  welcomePitch: z.string(),
  defaultTheme: z.enum(['light', 'dark']).default('light'),
});

export const UploadRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamCode: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  metadata: z.record(z.union([z.string(), z.number()])),
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export const ShareRequestSchema = z.object({
  itemId: z.string().min(1),
  recipientUpns: z.array(z.string().email()).min(1).max(20),
  message: z.string().max(2000).optional(),
  expiresAt: z.string().datetime(),
});
export type ShareRequest = z.infer<typeof ShareRequestSchema>;
