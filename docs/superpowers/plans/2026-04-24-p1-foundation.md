# P1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, shared types package, BFF scaffold (config + security + health + logging), Docker image, and CI pipeline — so subsequent plans can add features against a stable, testable foundation.

**Architecture:** npm workspaces monorepo (`web/`, `server/`, `shared/`). Server is Express + TypeScript on Node 20 LTS. Config loaded from env vars and Key Vault via Managed Identity, validated with Zod. Security headers, rate limiting, structured audit, typed domain errors. Packaged as a single-container Docker image.

**Tech Stack:** TypeScript 5, Node.js 20 LTS, Express 4, Zod, `@azure/identity`, `@azure/keyvault-secrets`, `applicationinsights`, Vitest (shared), Jest + Supertest (server).

**Reference:** `docs/superpowers/specs/2026-04-24-spembedded-adminui-design.md` §3, §5, §8, §9, §11, `CLAUDE.md` §3, §5.

**Deliverable at P1 end:**
- `docker build` + `docker run` produces a working image that:
  - Responds 200 on `GET /health` (liveness)
  - Responds 200 on `GET /ready` (readiness check against KV reachability)
  - Responds 404 on any other route
  - Emits a structured startup audit event to App Insights (or stdout in dev)
  - Loads config from env + KV with fail-fast validation
- CI runs typecheck, lint, unit tests, `npm audit`, Trivy scan on every PR
- Tagged `v0.1.0-foundation`

---

## Phase A — Repo bootstrap

### Task A1: Create monorepo structure with root workspaces

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `web/package.json`, `server/package.json`, `shared/package.json` (stubs — real contents come in later tasks)
- Create: `scripts/.gitkeep`

- [ ] **Step 1: Add Node version pin**

Create `.nvmrc`:
```
20.14.0
```

- [ ] **Step 2: Create workspace directories**

```bash
mkdir -p web server shared scripts
touch scripts/.gitkeep
```

- [ ] **Step 3: Create stub workspace `package.json` files (will be fleshed out in B1/C1 and P3)**

Create `shared/package.json`:
```json
{ "name": "@adminui/shared", "private": true, "version": "0.0.0" }
```

Create `server/package.json`:
```json
{ "name": "@adminui/server", "private": true, "version": "0.0.0" }
```

Create `web/package.json`:
```json
{ "name": "@adminui/web", "private": true, "version": "0.0.0" }
```

- [ ] **Step 4: Create root `package.json` with npm workspaces**

```json
{
  "name": "spembedded-adminui",
  "private": true,
  "version": "0.0.0",
  "engines": { "node": "20.x" },
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "typecheck": "npm -ws --if-present run typecheck",
    "lint": "npm -ws --if-present run lint",
    "test": "npm -ws --if-present run test",
    "build": "npm -w @adminui/shared --if-present run build && npm -w @adminui/server --if-present run build && npm -w @adminui/web --if-present run build",
    "dev": "npm -w @adminui/server --if-present run dev",
    "docker:build": "docker build -t spembedded-adminui:dev .",
    "docker:run": "docker run --rm -p 3000:3000 --env-file .env.docker spembedded-adminui:dev"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "@types/node": "20.12.7",
    "eslint": "8.57.0",
    "@typescript-eslint/parser": "7.7.0",
    "@typescript-eslint/eslint-plugin": "7.7.0",
    "prettier": "3.2.5",
    "eslint-config-prettier": "9.1.0"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json .nvmrc shared/package.json server/package.json web/package.json scripts/.gitkeep
git commit -m "chore: scaffold npm workspaces monorepo"
```

---

### Task A2: TypeScript base + workspace tsconfigs

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write base tsconfig**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "lib": ["ES2022"]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add strict TypeScript base config"
```

---

### Task A3: ESLint + Prettier + EditorConfig

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.eslintignore`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.editorconfig`

- [ ] **Step 1: Write ESLint config**

Create `.eslintrc.cjs`:
```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-console": ["error", { allow: ["warn", "error"] }],
    "eqeqeq": ["error", "always"]
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**"],
      rules: { "@typescript-eslint/no-floating-promises": "off" }
    }
  ],
  env: { node: true, es2022: true }
};
```

Create `.eslintignore`:
```
dist
build
node_modules
coverage
**/*.d.ts
```

- [ ] **Step 2: Write Prettier config**

Create `.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

Create `.prettierignore`:
```
dist
build
node_modules
coverage
package-lock.json
```

- [ ] **Step 3: Write EditorConfig**

Create `.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.cjs .eslintignore .prettierrc.json .prettierignore .editorconfig
git commit -m "chore: add eslint, prettier, editorconfig"
```

---

### Task A4: Update .gitignore and README

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Append build/IDE/secret patterns to `.gitignore`**

Append to `.gitignore`:
```
# Build outputs
dist/
build/
*.tsbuildinfo

# Coverage
coverage/

# Environment files
.env
.env.local
.env.docker
!.env.example

# IDEs
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Replace README stub**

Overwrite `README.md`:
```markdown
# spembedded-adminui

Secure multi-use-case file management over SharePoint Embedded.

See `docs/superpowers/specs/2026-04-24-spembedded-adminui-design.md` for design and `CLAUDE.md` for development workflow.

## Quick start

Requires Node 20 (see `.nvmrc`) and Docker.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run docker:build
```

## Layout

- `web/` — React SPA (Vite)
- `server/` — Node/Express BFF (TypeScript)
- `shared/` — Types and Zod schemas shared between web and server
- `infra/` — Terraform (added in P4)
- `docs/` — Specs, plans, runbooks

## License

See LICENSE.
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore README.md
git commit -m "chore: update .gitignore and README for monorepo"
```

---

### Task A5: Install root devDependencies

- [ ] **Step 1: Install**

```bash
npm install
```

Expected: `package-lock.json` generated, `node_modules/` populated.

- [ ] **Step 2: Verify lint runs (nothing to lint yet — should pass)**

```bash
npx eslint --no-error-on-unmatched-pattern 'nothing/*.ts'
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore: install root dev dependencies"
```

---

## Phase B — Shared package (types + Zod schemas)

### Task B1: Scaffold `shared` package

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/vitest.config.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: Write `shared/package.json`**

```json
{
  "name": "@adminui/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint 'src/**/*.ts'",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc -p tsconfig.build.json"
  },
  "dependencies": {
    "zod": "3.23.4"
  },
  "devDependencies": {
    "vitest": "1.5.0"
  }
}
```

- [ ] **Step 2: Write `shared/tsconfig.json`** (for typecheck/editor) and `shared/tsconfig.build.json` (for emit)

`shared/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

`shared/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Write `shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', thresholds: { lines: 90, functions: 90, branches: 85 } },
  },
});
```

- [ ] **Step 4: Write `shared/src/index.ts`** (placeholder re-exports)

```ts
export * from './types.js';
export * from './schemas.js';
```

- [ ] **Step 5: Install**

```bash
npm install -w @adminui/shared
```

- [ ] **Step 6: Commit**

```bash
git add shared/package.json shared/tsconfig.json shared/tsconfig.build.json shared/vitest.config.ts shared/src/index.ts package-lock.json
git commit -m "chore(shared): scaffold package"
```

---

### Task B2: Shared domain types

**Files:**
- Create: `shared/src/types.ts`

- [ ] **Step 1: Write `shared/src/types.ts`**

```ts
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
  expiresAt: number;
  lastSlidingUpdate: number;
}

export interface AuditEventPayload {
  action: string;
  workspace?: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  detail?: Record<string, string | number | boolean>;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm -w @adminui/shared run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add shared/src/types.ts
git commit -m "feat(shared): domain types"
```

---

### Task B3: Zod schemas for HTTP DTOs and config

**Files:**
- Create: `shared/src/schemas.ts`

- [ ] **Step 1: Write `shared/src/schemas.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

```bash
npm -w @adminui/shared run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add shared/src/schemas.ts
git commit -m "feat(shared): Zod schemas for env, secrets, workspace, upload, share"
```

---

### Task B4: Unit tests for Zod schemas (TDD for the schema shapes)

**Files:**
- Create: `shared/src/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  EnvSchema,
  UploadRequestSchema,
  ShareRequestSchema,
  WorkspaceConfigSchema,
  GroupRoleMapEntrySchema,
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
```

- [ ] **Step 2: Run the tests — expect failures until Zod schemas match**

```bash
npm -w @adminui/shared run test
```

Expected: all tests pass (schemas were written in B3). If any fail, fix the schema or the test.

- [ ] **Step 3: Commit**

```bash
git add shared/src/schemas.test.ts
git commit -m "test(shared): zod schema validation — env, upload, share, workspace, group map"
```

---

## Phase C — BFF core (config · security · health · logging)

### Task C1: Scaffold `server` package

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/tsconfig.build.json`
- Create: `server/jest.config.ts`
- Create: `server/src/main.ts`

- [ ] **Step 1: Write `server/package.json`**

```json
{
  "name": "@adminui/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint 'src/**/*.ts'",
    "test": "NODE_OPTIONS=--experimental-vm-modules jest",
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@adminui/shared": "*",
    "@azure/identity": "4.2.0",
    "@azure/keyvault-secrets": "4.8.0",
    "applicationinsights": "2.9.5",
    "express": "4.19.2",
    "helmet": "7.1.0"
  },
  "devDependencies": {
    "@jest/globals": "29.7.0",
    "@types/express": "4.17.21",
    "@types/jest": "29.5.12",
    "@types/supertest": "6.0.2",
    "jest": "29.7.0",
    "ts-jest": "29.1.2",
    "supertest": "7.0.0",
    "tsx": "4.7.2"
  }
}
```

- [ ] **Step 2: tsconfigs**

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

`server/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Jest config**

`server/jest.config.ts`:
```ts
import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/main.ts'],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 75 },
  },
};
export default config;
```

- [ ] **Step 4: Stub `server/src/main.ts`**

```ts
console.log('placeholder — implemented in later tasks');
```

- [ ] **Step 5: Install**

```bash
npm install
```

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json server/tsconfig.build.json server/jest.config.ts server/src/main.ts package-lock.json
git commit -m "chore(server): scaffold package with express, zod-backed config, jest"
```

---

### Task C2: Env loader with Zod validation (TDD)

**Files:**
- Create: `server/src/config/env.ts`
- Create: `server/src/config/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
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

  it('returns a frozen, typed env on valid input', () => {
    const env = loadEnv(valid);
    expect(env.AZURE_TENANT_ID).toBe(valid.AZURE_TENANT_ID);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('throws with a clear message listing missing keys', () => {
    const { AZURE_TENANT_ID: _, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/AZURE_TENANT_ID/);
  });

  it('coerces numeric env vars', () => {
    const env = loadEnv({ ...valid, SESSION_TTL_SLIDING_MIN: '240' });
    expect(env.SESSION_TTL_SLIDING_MIN).toBe(240);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
npm -w @adminui/server run test -- --testPathPattern=env.test
```

Expected: FAIL with "Cannot find module './env'".

- [ ] **Step 3: Implement `env.ts`**

```ts
import { EnvSchema, type Env } from '@adminui/shared';

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, unknown> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${missing}`);
  }
  return Object.freeze(result.data);
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm -w @adminui/server run test -- --testPathPattern=env.test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config/env.ts server/src/config/env.test.ts
git commit -m "feat(server): env loader with zod validation and fail-fast error"
```

---

### Task C3: Key Vault secret loader (TDD with mocked SDK)

**Files:**
- Create: `server/src/config/secrets.ts`
- Create: `server/src/config/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getSecretMock = jest.fn();

jest.unstable_mockModule('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({ getSecret: getSecretMock })),
}));
jest.unstable_mockModule('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

const { loadSecrets } = await import('./secrets.js');

describe('loadSecrets', () => {
  beforeEach(() => getSecretMock.mockReset());

  it('fetches and assembles the three secrets', async () => {
    getSecretMock
      .mockResolvedValueOnce({ value: 'client-secret-value' })
      .mockResolvedValueOnce({ value: 'a'.repeat(40) })
      .mockResolvedValueOnce({ value: 'b'.repeat(40) });

    const s = await loadSecrets('https://kv.example.vault.azure.net/');
    expect(s.aadClientSecret).toBe('client-secret-value');
    expect(s.cookieHmacKey).toHaveLength(40);
    expect(s.sessionEncryptionKey).toHaveLength(40);
  });

  it('throws a clear error when a secret is missing', async () => {
    getSecretMock.mockResolvedValue({ value: undefined });
    await expect(loadSecrets('https://kv.example.vault.azure.net/')).rejects.toThrow(
      /aad-client-secret/,
    );
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm -w @adminui/server run test -- --testPathPattern=secrets.test
```

- [ ] **Step 3: Implement `secrets.ts`**

```ts
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { SecretsSchema, type Secrets } from '@adminui/shared';

const SECRET_NAMES = {
  aadClientSecret: 'aad-client-secret',
  cookieHmacKey: 'cookie-hmac-key',
  sessionEncryptionKey: 'session-encryption-key',
} as const;

export async function loadSecrets(vaultUri: string): Promise<Secrets> {
  const client = new SecretClient(vaultUri, new DefaultAzureCredential());
  const fetched: Record<string, string> = {};
  for (const [field, name] of Object.entries(SECRET_NAMES)) {
    const resp = await client.getSecret(name);
    if (!resp.value) throw new Error(`Key Vault secret "${name}" is missing or empty`);
    fetched[field] = resp.value;
  }
  const parsed = SecretsSchema.safeParse(fetched);
  if (!parsed.success) {
    throw new Error(`Secrets failed validation: ${parsed.error.message}`);
  }
  return Object.freeze(parsed.data);
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm -w @adminui/server run test -- --testPathPattern=secrets.test
```

- [ ] **Step 5: Commit**

```bash
git add server/src/config/secrets.ts server/src/config/secrets.test.ts
git commit -m "feat(server): key vault secret loader via managed identity"
```

---

### Task C4: Combined `AppConfig` assembly (TDD)

**Files:**
- Create: `server/src/config/index.ts`
- Create: `server/src/config/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, jest } from '@jest/globals';

const loadSecretsMock = jest.fn();
jest.unstable_mockModule('./secrets.js', () => ({ loadSecrets: loadSecretsMock }));

const { loadAppConfig } = await import('./index.js');

describe('loadAppConfig', () => {
  const envSource = {
    AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    AZURE_CONTAINER_TYPE_ID: '33333333-3333-3333-3333-333333333333',
    AZURE_SYSTEM_CONTAINER_ID: 'b!x',
    AZURE_KEY_VAULT_URI: 'https://kv.example.vault.azure.net/',
    SHAREPOINT_HOSTNAME: 'contoso.sharepoint.com',
    APP_BASE_URL: 'https://app.example.com',
    APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=abc',
  };

  it('composes env + secrets into a single frozen AppConfig', async () => {
    loadSecretsMock.mockResolvedValue({
      aadClientSecret: 'cs',
      cookieHmacKey: 'k'.repeat(40),
      sessionEncryptionKey: 'k'.repeat(40),
    });
    const cfg = await loadAppConfig(envSource);
    expect(cfg.env.AZURE_CLIENT_ID).toBe(envSource.AZURE_CLIENT_ID);
    expect(cfg.secrets.aadClientSecret).toBe('cs');
    expect(Object.isFrozen(cfg)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`server/src/config/index.ts`:
```ts
import { loadEnv } from './env.js';
import { loadSecrets } from './secrets.js';
import type { Env, Secrets } from '@adminui/shared';

export interface AppConfig {
  env: Env;
  secrets: Secrets;
}

export async function loadAppConfig(
  envSource: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): Promise<AppConfig> {
  const env = loadEnv(envSource);
  const secrets = await loadSecrets(env.AZURE_KEY_VAULT_URI);
  return Object.freeze({ env, secrets });
}
```

- [ ] **Step 3: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=config/index.test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/config/index.ts server/src/config/index.test.ts
git commit -m "feat(server): compose AppConfig from env + KV secrets"
```

---

### Task C5: Domain error types + HTTP error middleware (TDD)

**Files:**
- Create: `server/src/errors/domain.ts`
- Create: `server/src/errors/middleware.ts`
- Create: `server/src/errors/middleware.test.ts`

- [ ] **Step 1: Write domain error classes**

`server/src/errors/domain.ts`:
```ts
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends DomainError {
  constructor(publicMessage: string, detail?: Record<string, unknown>) {
    super('bad_request', publicMessage, 400, publicMessage, detail);
  }
}
export class UnauthenticatedError extends DomainError {
  constructor(publicMessage = 'Authentication required') {
    super('unauthenticated', publicMessage, 401, publicMessage);
  }
}
export class ForbiddenError extends DomainError {
  constructor(publicMessage = 'Access denied') {
    super('forbidden', publicMessage, 403, publicMessage);
  }
}
export class NotFoundError extends DomainError {
  constructor(publicMessage = 'Resource not found') {
    super('not_found', publicMessage, 404, publicMessage);
  }
}
export class ConflictError extends DomainError {
  constructor(publicMessage: string, detail?: Record<string, unknown>) {
    super('conflict', publicMessage, 409, publicMessage, detail);
  }
}
export class UpstreamError extends DomainError {
  constructor(publicMessage = 'Upstream service unavailable') {
    super('upstream', publicMessage, 502, publicMessage);
  }
}
```

- [ ] **Step 2: Write the failing middleware test**

`server/src/errors/middleware.test.ts`:
```ts
import { describe, it, expect, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { errorMiddleware } from './middleware.js';
import { BadRequestError } from './domain.js';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('errorMiddleware', () => {
  it('maps a DomainError to its HTTP status and public message', () => {
    const res = mockRes();
    errorMiddleware(
      new BadRequestError('Missing field X'),
      {} as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'bad_request',
      message: 'Missing field X',
    });
  });

  it('maps an unknown error to 500 without exposing details', () => {
    const res = mockRes();
    errorMiddleware(new Error('internal stack leak'), {} as Request, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'internal',
      message: 'An unexpected error occurred',
    });
  });
});
```

- [ ] **Step 3: Implement the middleware**

`server/src/errors/middleware.ts`:
```ts
import type { ErrorRequestHandler } from 'express';
import { DomainError } from './domain.js';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof DomainError) {
    res.status(err.status).json({ error: err.code, message: err.publicMessage });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'internal', message: 'An unexpected error occurred' });
};
```

- [ ] **Step 4: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=errors
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/errors/
git commit -m "feat(server): typed domain errors and http error middleware"
```

---

### Task C6: Security-headers middleware

**Files:**
- Create: `server/src/middleware/security.ts`
- Create: `server/src/middleware/security.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from './security.js';

describe('securityHeaders middleware', () => {
  const app = express();
  app.use(securityHeaders());
  app.get('/x', (_req, res) => res.status(200).send('ok'));

  it('sets CSP, HSTS, nosniff, referrer-policy, permissions-policy', async () => {
    const r = await request(app).get('/x');
    expect(r.status).toBe(200);
    expect(r.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(r.headers['content-security-policy']).toMatch(/frame-src https:\/\/\*\.sharepoint\.com/);
    expect(r.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(r.headers['permissions-policy']).toMatch(/geolocation=\(\)/);
  });

  it('removes x-powered-by', async () => {
    const r = await request(app).get('/x');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

`server/src/middleware/security.ts`:
```ts
import helmet from 'helmet';
import type { RequestHandler } from 'express';

export function securityHeaders(): RequestHandler[] {
  return [
    (req, res, next) => {
      res.removeHeader('X-Powered-By');
      next();
    },
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameSrc: ['https://*.sharepoint.com'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xDownloadOptions: true,
      noSniff: true,
    }),
    (_req, res, next) => {
      res.setHeader(
        'Permissions-Policy',
        'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
      );
      next();
    },
  ];
}
```

- [ ] **Step 3: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=middleware/security
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/security.ts server/src/middleware/security.test.ts
git commit -m "feat(server): strict security headers middleware (csp, hsts, permissions-policy)"
```

---

### Task C7: Rate limit middleware (in-memory token bucket)

**Files:**
- Create: `server/src/middleware/rateLimit.ts`
- Create: `server/src/middleware/rateLimit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { rateLimit } from './rateLimit.js';

describe('rateLimit', () => {
  it('allows up to capacity and then returns 429', async () => {
    const app = express();
    app.use(rateLimit({ capacity: 2, refillPerSec: 0, keyFn: () => 'static' }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));

    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    const r = await request(app).get('/x');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeDefined();
  });

  it('partitions by keyFn', async () => {
    const app = express();
    let counter = 0;
    app.use(rateLimit({ capacity: 1, refillPerSec: 0, keyFn: () => String(counter++) }));
    app.get('/x', (_req, res) => res.status(200).send('ok'));

    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get('/x')).resolves.toMatchObject({ status: 200 });
  });
});
```

- [ ] **Step 2: Implement**

`server/src/middleware/rateLimit.ts`:
```ts
import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  capacity: number;
  refillPerSec: number;
  keyFn?: (req: Request) => string;
}

interface Bucket { tokens: number; lastRefill: number; }

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const keyFn = opts.keyFn ?? ((req) => req.ip ?? 'unknown');

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: opts.capacity, lastRefill: now };
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedSec * opts.refillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const wait = opts.refillPerSec > 0 ? Math.ceil((1 - bucket.tokens) / opts.refillPerSec) : 60;
      res.setHeader('Retry-After', String(wait));
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
```

- [ ] **Step 3: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=rateLimit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/rateLimit.ts server/src/middleware/rateLimit.test.ts
git commit -m "feat(server): token-bucket rate limit middleware"
```

---

### Task C8: App Insights initialization + structured audit helper

**Files:**
- Create: `server/src/obs/appInsights.ts`
- Create: `server/src/obs/audit.ts`
- Create: `server/src/obs/audit.test.ts`

- [ ] **Step 1: App Insights init**

`server/src/obs/appInsights.ts`:
```ts
import appInsights from 'applicationinsights';

let initialized = false;

export function initAppInsights(connectionString: string): void {
  if (initialized) return;
  appInsights
    .setup(connectionString)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setSendLiveMetrics(false)
    .setUseDiskRetryCaching(true)
    .start();
  initialized = true;
}

export function getAppInsightsClient(): appInsights.TelemetryClient {
  return appInsights.defaultClient;
}
```

- [ ] **Step 2: Write the failing audit test**

`server/src/obs/audit.test.ts`:
```ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const trackEventMock = jest.fn();

jest.unstable_mockModule('./appInsights.js', () => ({
  getAppInsightsClient: () => ({ trackEvent: trackEventMock }),
  initAppInsights: () => {},
}));

const { audit, hashIp } = await import('./audit.js');

describe('audit', () => {
  beforeEach(() => trackEventMock.mockReset());

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
```

- [ ] **Step 3: Implement `audit.ts`**

```ts
import { createHash } from 'node:crypto';
import { getAppInsightsClient } from './appInsights.js';

export interface AuditRecord {
  userOid: string;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  workspace?: string;
  resourceId?: string;
  ipHash?: string;
  durationMs?: number;
  detail?: Record<string, string | number | boolean>;
}

export function audit(r: AuditRecord): void {
  const client = getAppInsightsClient();
  if (!client) return;
  const { durationMs, detail, ...rest } = r;
  client.trackEvent({
    name: `audit.${r.action}`,
    properties: { ...rest, ...(detail ?? {}) } as Record<string, string>,
    measurements: durationMs !== undefined ? { durationMs } : undefined,
  });
}

export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(salt).update(ip).digest('hex');
}
```

- [ ] **Step 4: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=obs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/obs/
git commit -m "feat(server): app insights init and structured audit helper"
```

---

### Task C9: Health + Ready routes (TDD)

**Files:**
- Create: `server/src/routes/health.ts`
- Create: `server/src/routes/health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { healthRouter } from './health.js';

describe('health routes', () => {
  it('/health responds 200 with status:up', async () => {
    const app = express();
    app.use(healthRouter({ readinessProbes: [] }));
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'up' });
  });

  it('/ready is 200 when all probes pass', async () => {
    const app = express();
    app.use(healthRouter({ readinessProbes: [jest.fn<() => Promise<void>>().mockResolvedValue()] }));
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
  });

  it('/ready is 503 when a probe fails', async () => {
    const app = express();
    app.use(
      healthRouter({
        readinessProbes: [
          jest.fn<() => Promise<void>>().mockRejectedValue(new Error('kv down')),
        ],
      }),
    );
    const r = await request(app).get('/ready');
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('not_ready');
  });
});
```

- [ ] **Step 2: Implement**

`server/src/routes/health.ts`:
```ts
import { Router, type Router as ExpressRouter } from 'express';

export interface HealthRouterOptions {
  readinessProbes: Array<() => Promise<void>>;
}

export function healthRouter(opts: HealthRouterOptions): ExpressRouter {
  const router = Router();
  router.get('/health', (_req, res) => res.status(200).json({ status: 'up' }));
  router.get('/ready', async (_req, res) => {
    try {
      await Promise.all(opts.readinessProbes.map((p) => p()));
      res.status(200).json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ error: 'not_ready', message: (err as Error).message });
    }
  });
  return router;
}
```

- [ ] **Step 3: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=routes/health
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/health.ts server/src/routes/health.test.ts
git commit -m "feat(server): health and readiness endpoints with pluggable probes"
```

---

### Task C10: KV readiness probe

**Files:**
- Create: `server/src/probes/keyVault.ts`
- Create: `server/src/probes/keyVault.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, jest } from '@jest/globals';

const listMock = jest.fn();
jest.unstable_mockModule('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({ listPropertiesOfSecrets: listMock })),
}));
jest.unstable_mockModule('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

const { makeKeyVaultProbe } = await import('./keyVault.js');

describe('keyVaultProbe', () => {
  it('resolves when the SDK can iterate', async () => {
    listMock.mockReturnValue({ async *[Symbol.asyncIterator]() { yield { name: 'x' }; } });
    const probe = makeKeyVaultProbe('https://kv.example.vault.azure.net/');
    await expect(probe()).resolves.toBeUndefined();
  });

  it('rejects when the SDK throws', async () => {
    listMock.mockImplementation(() => {
      throw new Error('no perms');
    });
    const probe = makeKeyVaultProbe('https://kv.example.vault.azure.net/');
    await expect(probe()).rejects.toThrow(/no perms/);
  });
});
```

- [ ] **Step 2: Implement**

`server/src/probes/keyVault.ts`:
```ts
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

export function makeKeyVaultProbe(vaultUri: string): () => Promise<void> {
  const client = new SecretClient(vaultUri, new DefaultAzureCredential());
  return async () => {
    const iter = client.listPropertiesOfSecrets();
    // consume a single element to confirm connectivity + permissions
    for await (const _ of iter) break;
  };
}
```

- [ ] **Step 3: Run tests**

```bash
npm -w @adminui/server run test -- --testPathPattern=probes/keyVault
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/probes/
git commit -m "feat(server): key vault readiness probe"
```

---

### Task C11: Main server entry point

**Files:**
- Modify: `server/src/main.ts` (replace placeholder)

- [ ] **Step 1: Rewrite `server/src/main.ts`**

```ts
import express from 'express';
import { loadAppConfig } from './config/index.js';
import { initAppInsights } from './obs/appInsights.js';
import { audit } from './obs/audit.js';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { makeKeyVaultProbe } from './probes/keyVault.js';
import { errorMiddleware } from './errors/middleware.js';
import { NotFoundError } from './errors/domain.js';

async function main(): Promise<void> {
  const cfg = await loadAppConfig();
  initAppInsights(cfg.env.APPLICATIONINSIGHTS_CONNECTION_STRING);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(
    rateLimit({ capacity: 60, refillPerSec: 1, keyFn: (req) => req.ip ?? 'unknown' }),
  );
  app.use(express.json({ limit: '1mb' }));

  const probe = makeKeyVaultProbe(cfg.env.AZURE_KEY_VAULT_URI);
  app.use(healthRouter({ readinessProbes: [probe] }));

  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorMiddleware);

  const server = app.listen(cfg.env.PORT, () => {
    audit({
      userOid: 'system',
      action: 'server.startup',
      outcome: 'success',
      detail: { port: cfg.env.PORT, nodeEnv: cfg.env.NODE_ENV },
    });
    // eslint-disable-next-line no-console
    console.error(`server listening on :${cfg.env.PORT}`);
  });

  const shutdown = (sig: string): void => {
    audit({ userOid: 'system', action: 'server.shutdown', outcome: 'success', detail: { signal: sig } });
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck + build**

```bash
npm -w @adminui/server run typecheck
npm -w @adminui/server run build
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add server/src/main.ts
git commit -m "feat(server): main entry wires config, obs, headers, rate limit, health, errors"
```

---

### Task C12: Integration test — supertest against the assembled app

**Files:**
- Create: `server/src/app.ts` (factor out app assembly for tests)
- Create: `server/src/app.test.ts`
- Modify: `server/src/main.ts` to use `createApp`

- [ ] **Step 1: Extract app factory**

`server/src/app.ts`:
```ts
import express, { type Express } from 'express';
import { securityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { errorMiddleware } from './errors/middleware.js';
import { NotFoundError } from './errors/domain.js';

export interface CreateAppOptions {
  readinessProbes: Array<() => Promise<void>>;
  rateLimitCapacity?: number;
  rateLimitRefillPerSec?: number;
}

export function createApp(opts: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(
    rateLimit({
      capacity: opts.rateLimitCapacity ?? 60,
      refillPerSec: opts.rateLimitRefillPerSec ?? 1,
      keyFn: (req) => req.ip ?? 'unknown',
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter({ readinessProbes: opts.readinessProbes }));
  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorMiddleware);
  return app;
}
```

- [ ] **Step 2: Rewrite `server/src/main.ts` to use `createApp`**

Replace the entire contents of `server/src/main.ts` with:
```ts
import { loadAppConfig } from './config/index.js';
import { initAppInsights } from './obs/appInsights.js';
import { audit } from './obs/audit.js';
import { makeKeyVaultProbe } from './probes/keyVault.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const cfg = await loadAppConfig();
  initAppInsights(cfg.env.APPLICATIONINSIGHTS_CONNECTION_STRING);

  const probe = makeKeyVaultProbe(cfg.env.AZURE_KEY_VAULT_URI);
  const app = createApp({ readinessProbes: [probe] });

  const server = app.listen(cfg.env.PORT, () => {
    audit({
      userOid: 'system',
      action: 'server.startup',
      outcome: 'success',
      detail: { port: cfg.env.PORT, nodeEnv: cfg.env.NODE_ENV },
    });
    // eslint-disable-next-line no-console
    console.error(`server listening on :${cfg.env.PORT}`);
  });

  const shutdown = (sig: string): void => {
    audit({ userOid: 'system', action: 'server.shutdown', outcome: 'success', detail: { signal: sig } });
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Write the integration test**

`server/src/app.test.ts`:
```ts
import { describe, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from './app.js';

describe('createApp integration', () => {
  it('GET /health → 200', async () => {
    const app = createApp({ readinessProbes: [] });
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
  });

  it('GET /ready → 200 when probes pass', async () => {
    const app = createApp({
      readinessProbes: [jest.fn<() => Promise<void>>().mockResolvedValue()],
    });
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
  });

  it('GET /ready → 503 when probe fails', async () => {
    const app = createApp({
      readinessProbes: [jest.fn<() => Promise<void>>().mockRejectedValue(new Error('x'))],
    });
    const r = await request(app).get('/ready');
    expect(r.status).toBe(503);
  });

  it('GET /no-such-route → 404', async () => {
    const app = createApp({ readinessProbes: [] });
    const r = await request(app).get('/does-not-exist');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found', message: 'Resource not found' });
  });

  it('sets CSP on every response', async () => {
    const app = createApp({ readinessProbes: [] });
    const r = await request(app).get('/health');
    expect(r.headers['content-security-policy']).toBeDefined();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm -w @adminui/server run test
```

Expected: all server tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/src/app.test.ts server/src/main.ts
git commit -m "test(server): integration test over assembled express app"
```

---

## Phase D — Docker image

### Task D1: Multi-stage Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```
.git
.github
docs
web
infra
scripts
.superpowers
**/node_modules
**/dist
**/coverage
**/.env*
!.env.example
**/*.test.ts
**/*.spec.ts
```

- [ ] **Step 2: Write `Dockerfile`** (P1 builds server only; web stage added in P3)

```dockerfile
# syntax=docker/dockerfile:1.7
# ---- deps ---------------------------------------------------------
FROM node:20.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspaces --include-workspace-root

# ---- build --------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN npm -w @adminui/shared run build \
 && npm -w @adminui/server run build

# ---- runtime ------------------------------------------------------
FROM node:20.14.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

# Prune devDependencies
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspaces --include-workspace-root --omit=dev

# Copy built artifacts
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist

USER app
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: multi-stage dockerfile for server (web stage added in p3)"
```

---

### Task D2: Smoke-test the image locally

- [ ] **Step 1: Build the image**

```bash
docker build -t spembedded-adminui:dev .
```

Expected: build completes successfully.

- [ ] **Step 2: Run the image with minimal env (KV probe will fail — that's expected for /ready)**

Create a temporary `.env.docker` from `.env.example` (when it exists — for now pass inline):

```bash
docker run --rm -d --name adminui-smoke -p 3000:3000 \
  -e AZURE_TENANT_ID=11111111-1111-1111-1111-111111111111 \
  -e AZURE_CLIENT_ID=22222222-2222-2222-2222-222222222222 \
  -e AZURE_CONTAINER_TYPE_ID=33333333-3333-3333-3333-333333333333 \
  -e AZURE_SYSTEM_CONTAINER_ID=b!stub \
  -e AZURE_KEY_VAULT_URI=https://stub.vault.azure.net/ \
  -e SHAREPOINT_HOSTNAME=contoso.sharepoint.com \
  -e APP_BASE_URL=https://app.local \
  -e APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=stub" \
  spembedded-adminui:dev
sleep 2
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/health
docker logs adminui-smoke --tail 20
docker stop adminui-smoke
```

Expected: `/health` returns `200`. `/ready` will 503 because the stub KV URI has no network reachability (expected until P4 wires a real KV).

- [ ] **Step 3: Add `.env.example`**

Create `.env.example`:
```
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CONTAINER_TYPE_ID=
AZURE_SYSTEM_CONTAINER_ID=
AZURE_KEY_VAULT_URI=
SHAREPOINT_HOSTNAME=
APP_BASE_URL=http://localhost:3000
APPLICATIONINSIGHTS_CONNECTION_STRING=
SESSION_TTL_SLIDING_MIN=480
SESSION_TTL_ABSOLUTE_MIN=1440
LOG_LEVEL=info
NODE_ENV=development
PORT=3000
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example"
```

---

## Phase E — CI scaffold

### Task E1: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm audit --omit=dev --audit-level=high
      - run: npm run build

  image:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build image (no push)
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          load: true
          tags: spembedded-adminui:ci
      - name: Trivy scan
        uses: aquasecurity/trivy-action@0.20.0
        with:
          image-ref: spembedded-adminui:ci
          format: table
          exit-code: '1'
          severity: HIGH,CRITICAL
          ignore-unfixed: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, lint, test, audit, build, trivy scan"
```

---

## Phase F — Review checkpoint

### Task F1: Self-review with agents

- [ ] **Step 1: Run code-simplifier on the P1 diff**

Invoke the `code-simplifier` agent against the diff between `b5a67c2` (initial commit) and `HEAD`. Address any concrete simplifications it proposes; skip philosophical suggestions that conflict with the spec.

- [ ] **Step 2: Run silent-failure-hunter**

Invoke `pr-review-toolkit:silent-failure-hunter` against the same diff. Any `catch` block that doesn't re-throw or handle explicitly should be fixed in place.

- [ ] **Step 3: Run type-design-analyzer**

Invoke `pr-review-toolkit:type-design-analyzer` against the new types in `shared/src/types.ts` and `server/src/errors/domain.ts`.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "refactor(p1): address self-review feedback"
```

---

### Task F2: Security review

- [ ] **Step 1: Run `/security-review` slash command**

Run `/security-review` on the branch. P1 doesn't handle user data yet, but reviews should flag: missing CSP directive, header gaps, rate-limit bypasses, dangerous defaults, any secret in code/config/tests.

- [ ] **Step 2: Address findings**

Fix any High/Critical findings before moving on. Record any accepted Medium/Low findings in `docs/runbooks/security-accepted.md` with rationale.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "security(p1): address security-review findings"
```

---

### Task F3: Code review

- [ ] **Step 1: Open a PR (if using PR flow) or run the `pr-review-toolkit:code-reviewer` agent**

For solo workflow:
```bash
# Ensure the diff is clean, then:
# (invoke pr-review-toolkit:code-reviewer via Task tool, pointing at the full p1 diff)
```

- [ ] **Step 2: Address findings, commit**

```bash
git add -A
git commit -m "review(p1): address code review"
```

---

### Task F4: Tag the milestone

- [ ] **Step 1: Tag**

```bash
git tag -a v0.1.0-foundation -m "P1 foundation: repo, shared types, BFF scaffold, docker, CI"
git push --tags  # only if user approves a push; otherwise local tag only
```

- [ ] **Step 2: Update plan doc status**

Mark this plan as completed in a short commit:

```bash
# Edit this file: add "**Status:** completed YYYY-MM-DD" below the title
git add docs/superpowers/plans/2026-04-24-p1-foundation.md
git commit -m "docs(plan): mark p1 completed"
```

---

## Exit criteria (P1 done when all are true)

- [ ] `npm ci && npm run typecheck && npm run lint && npm run test && npm run build` all pass from a fresh clone.
- [ ] `docker build -t spembedded-adminui:dev .` succeeds.
- [ ] `docker run` with the env vars from Task D2 yields `GET /health` 200 within 5s.
- [ ] `GET /ready` returns 503 when KV is unreachable and 200 otherwise.
- [ ] CI workflow is green on a PR or push.
- [ ] `v0.1.0-foundation` tag exists.
- [ ] All agents in Phase F have been run at least once and findings addressed.

Next plan: **P2 — BFF features** (auth + session + SPE client + file ops + upload + sharing + admin API). Start that plan after P1 is tagged.
