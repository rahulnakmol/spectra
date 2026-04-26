export type Role = 'admin' | 'member';

export interface UserIdentity {
  oid: string;
  tenantId: string;
  displayName: string;
  upn: string;
  isAdmin: boolean;
  teamMemberships: TeamMembership[];
}

export interface TeamMembership {
  workspaceId: string;
  teamCode: string;
  teamDisplayName: string;
}

export interface WorkspaceConfig {
  id: string;
  displayName: string;
  template: WorkspaceTemplate;
  containerId: string;
  folderConvention: string[];
  metadataSchema: MetadataField[];
  archived: boolean;
  createdAt: string;
  createdByOid: string;
}

export type WorkspaceTemplate = 'invoices' | 'contracts' | 'hr-docs' | 'blank';

export interface MetadataField {
  name: string;
  type: 'string' | 'number' | 'date' | 'enum';
  required: boolean;
  indexed: boolean;
  enumValues?: string[];
  description?: string;
}

export interface GroupRoleMapEntry {
  entraGroupId: string;
  entraGroupDisplayName: string;
  workspaceId: string;
  teamCode: string;
  teamDisplayName: string;
}

export interface AppSettings {
  brandName: string;
  welcomePitch: string;
  defaultTheme: 'light' | 'dark';
}

export interface FileItem {
  id: string;
  name: string;
  folderPath: string;
  uploadedByOid: string;
  uploadedByDisplayName: string;
  uploadedAt: string;
  sizeBytes: number;
  metadata: Record<string, string | number | null>;
}

export interface SessionClaims {
  sessionId: string;
  userOid: string;
  tenantId: string;
  isAdmin: boolean;
  teamMemberships: TeamMembership[];
  issuedAt: number;
  absoluteExpiresAt: number; // set once at login, never changed — used as absolute upper bound for sliding TTL
  expiresAt: number;
  lastSlidingUpdate: number;
  userAccessToken: string;
}

export interface AuditEventPayload {
  action: string;
  workspace?: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  detail?: Record<string, string | number | boolean>;
}
