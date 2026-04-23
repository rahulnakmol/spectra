# spembedded-adminui — Design Spec

**Status:** draft — pending user review
**Date:** 2026-04-24
**Reference:** [microsoft/SharePoint-Embedded-Samples — legal-docs](https://github.com/microsoft/SharePoint-Embedded-Samples/tree/main/Custom%20Apps/legal-docs) (UX scaffolding only; auth model differs)

---

## 1. Purpose

A Fluent UI + React SPA that provides a SharePoint-like experience for browsing, uploading, searching, and securely sharing files hosted in SharePoint Embedded (SPE) file-storage containers. Initial use case is **Accounts Payable invoice management**; the app is designed to support additional workspaces (HR documents, contracts, etc.) without code changes.

The app is intentionally structured so that **end users' identities flow through every operation** (SSO, OBO-mediated Graph calls, internal-only sharing with no-download semantics) and the **backend is the sole path to SharePoint Embedded**, giving us consistent server-side authorization, filtering, and auditing.

Future extension: an AI agent flyout (Copilot-style) that answers questions and performs workflows over the user's accessible files.

## 2. Decisions locked (from brainstorming)

| Area | Decision |
|---|---|
| Tenancy | Single-tenant, multi-workspace (one deployment hosts AP Invoices and any future workspaces). |
| Auth pattern | **BFF + OBO** for user-scoped operations; **app-only SP** for admin provisioning and item-permission grants at upload. No MSAL.js in the browser — MSAL-Node runs server-side. |
| SPE container model | One container per workspace, team folders inside. Plus one **system container** (SP-only access, invisible to end users) for runtime config + sessions. |
| Admin/team source | Entra ID security groups + a **group-to-role map** stored as JSON in the system container. Admin role defined as an Entra app role or group. |
| Sharing recipient model | Internal-only (same tenant); Graph sharing link with `preventsDownload=true, type=view`, expiry required. |
| File lifecycle | **Write-once for uploaders.** Uploader cannot modify or delete after upload. Admins can modify/delete. |
| Visibility | **Only-own.** Uploaders see only files they personally uploaded; admins see everything. |
| Upload metadata | Vendor, Invoice #, Amount, Currency (plus app-managed UploadedByOid, UploadedAt). Stored as SPE column metadata on the item. |
| File constraints | Allowlist (`pdf, png, jpg, jpeg, heic, tiff`), 25 MB cap, server-side MIME sniff. Relying on SharePoint's built-in AV. |
| Hosting | Single-replica Azure Container App (monolithic image: BFF + React bundle). Scale-to-zero (min=0, max=1). |
| State storage | **Config + sessions** as JSON files in the SPE system container. **Audit** in App Insights custom events. No SQLite, no Azure Files, no Table Storage. |
| Accessibility | WCAG 2.0 Level AA (AODA-aligned) as acceptance criterion, enforced with axe-core in CI + manual keyboard/screen-reader checks. |
| Themes | Fluent UI v9 light + dark; per-user preference persisted in session JSON. |
| Preview | SharePoint native web viewer (SPE `/preview` embed URL) for supported types; non-supported types show "Preview unavailable." |
| IaC | Terraform for all repeatable Azure resources; SPE Container Type registration is a documented one-time tenant-admin step. |
| Cost envelope | ≤ $100/month for production (current estimate $35–75). |

## 3. Architecture

Single Docker image deployed to **one Azure Container App, single replica (min=0, max=1, scale-to-zero)** in a Container Apps environment.

The image runs a Node.js (TypeScript) BFF process that:
- serves the compiled React SPA as static assets from the same origin;
- exposes `/api/*` routes;
- authenticates to Entra ID as a confidential client (MSAL-Node);
- calls Microsoft Graph via OBO for user-scoped ops and app-only for admin ops;
- persists state to a dedicated **SPE system container** (service-principal-only access) and emits audit events to Application Insights.

**Azure dependencies:**

- 1× Azure Container Apps environment + 1× Container App (with user-assigned Managed Identity)
- 1× Azure Container Registry (Basic)
- 1× Azure Key Vault (RBAC mode)
- 1× Log Analytics workspace + 1× Application Insights (linked)
- 1× Storage Account (Terraform state + Blob backups of config)
- 1× Entra ID app registration (single-tenant) with app-role `AppAdmin`
- 1× SPE Container Type (one-time tenant-admin registration, out of Terraform)
- N× SPE container instances (1 system + 1 per workspace, created via first-run admin bootstrap endpoint)

**Non-dependencies (explicitly out):**

- No SQLite, Azure Files, Table Storage, Cosmos DB, Blob-Fuse mounts, Litestream
- No Azure Front Door / WAF for v1 (documented upgrade path)
- No Defender for Storage for v1 (documented upgrade path)

**Diagram** — see `docs/superpowers/specs/media/architecture.png` (to be exported from the brainstorming visual).

## 4. Auth & request flow

### Sign-in (one-time per session)

1. Browser with no session cookie hits `/`; SPA redirects to `/api/auth/login`.
2. BFF generates PKCE + state, redirects to Entra ID authorize endpoint.
3. User authenticates at Entra ID (MFA per tenant Conditional Access).
4. Entra ID redirects auth code to `/api/auth/callback`.
5. BFF (MSAL-Node confidential client) exchanges the code for ID + access + refresh tokens.
6. BFF resolves user's role by intersecting token group claims (or `/me/transitiveMemberOf` on groups overage) with the `/config/group-role-map.json` in the SPE system container.
7. BFF creates a session: encrypts tokens + role snapshot with the Key Vault session encryption key, writes `/sessions/{sessionId}.json` to the system container.
8. BFF sets a signed cookie (`HttpOnly` + `Secure` + `SameSite=Strict`, signed with the Key Vault cookie HMAC key), redirects to SPA.

### Authenticated requests

1. SPA calls `/api/...`; cookie attaches automatically (same origin).
2. BFF middleware: verify cookie signature and expiry; load session JSON from SPE (with a 60-second in-memory LRU); check workspace/team authz from session claims; write an App Insights event.
3. Token broker acquires a Graph token: **OBO** for reads/shares (Graph audit reflects the real user), **app-only** for provisioning and item-permission grants.
4. For "only-own" reads, the BFF adds a filter `createdBy.user.id eq '<oid>'` and also double-checks in code before returning.
5. Response returned with appropriate cache headers.

### Session TTL

- Sliding 8h (updates batched to max 1 write per 5 min to avoid Graph throttling).
- Absolute 24h. After absolute expiry, user must sign in fresh (no silent refresh beyond this window).
- Logout invalidates the session JSON immediately and clears the cookie.

## 5. Component breakdown

### Frontend (`/web`)

- **Stack:** React 18 + TypeScript + Vite + Fluent UI v9 + Tailwind (utility layer only, mapped to Fluent theme tokens).
- **Routes:** `/`, `/login`, `/w`, `/w/:ws`, `/w/:ws/browse`, `/w/:ws/upload`, `/w/:ws/my`, `/w/:ws/admin`.
- **Key components (borrowed/adapted from legal-docs):** `Header`, `FolderTree`, `FileGrid`, `FileViewer`, `FileUploadDialog`, `ShareDialog`, `ThemeToggle`, `FloatingCopilotIcon`, `FlyoutPanel` (reserved for AI agent).
- **Theme:** Fluent `FluentProvider` with `webLightTheme` / `webDarkTheme`. Preference stored in session JSON.
- **Accessibility:** WCAG 2.0 AA. Every interactive element keyboard-operable; visible focus; ARIA landmarks + `aria-live` for async state; semantic table for file lists; drag-drop with keyboard-equivalent `Browse` button.
- **State:** React Query for server state; no global store needed in v1.
- **No MSAL.js in the SPA.** All auth handled by redirects to the BFF.

### BFF (`/server`)

- **Stack:** Node.js 20 LTS + TypeScript + Express + `@azure/msal-node` + `@microsoft/microsoft-graph-client` + `@azure/identity` + `@azure/keyvault-secrets` + `applicationinsights`.
- **Modules:**
  - `config/` — env + KV loader, Zod validation, frozen `AppConfig`.
  - `auth/` — MSAL-Node confidential client; session middleware; cookie signing.
  - `authz/` — role resolver; per-route guards (`requireRole('admin' | 'member')`, `requireWorkspaceAccess`).
  - `spe/` — Graph client wrappers for drives, items, columns, permissions, preview URL issuance.
  - `store/` — `ConfigStore`, `SessionStore` abstractions over the SPE system container (in-memory LRU + write-behind).
  - `upload/` — MIME sniff, allowlist, size, filename shaping, folder materialization, metadata write, item-permission grant.
  - `sharing/` — create no-download view-only link, recipient validation, Graph sendMail.
  - `admin/` — workspace + mapping CRUD, audit query proxy to App Insights.
  - `agent/` — v1 stub returning 501; shape designed for SPE Copilot Chat SDK drop-in.
  - `obs/` — App Insights initialization, structured audit helper, error tracking.
- **API surface:** see section 5 of the brainstorming; echoed in `docs/superpowers/specs/api.md` (to be generated alongside implementation).

### SPE data layout

**Workspace container (e.g., `AP-Invoices`):**

Permissions:
- Service principal: Owner
- Admin Entra group: Manager
- Team groups: no container-level permission; members receive item-level permissions from the BFF on each upload.

Path convention:
```
/{TeamDisplayName}/{YYYY}/{MM}/{sanitizedOriginal}__{TeamCode}.{ext}
```
Filename collision: append `-2`, `-3`, … inside the same month.

Column metadata on every item:
- `Vendor` (string, indexed)
- `InvoiceNumber` (string, indexed, unique-within-workspace enforced by BFF)
- `Amount` (number)
- `Currency` (string, 3-char ISO)
- `UploadedByOid` (string, Entra oid — "only-own" filter key)
- `UploadedAt` (dateTime)

**System container (e.g., `adminui-system`):**

Permissions: service principal only.

Paths:
- `/config/workspaces.json`
- `/config/group-role-map.json`
- `/config/app-settings.json`
- `/sessions/{sessionId}.json` (encrypted, 60s LRU in front)

## 6. UI/UX decisions

- **Welcome page** — product name (placeholder "Invoice Vault" — brand name is a tenant-configurable setting), short pitch, single Microsoft sign-in button.
- **Workspace picker** — tile grid for users with access to multiple workspaces; dimmed tiles for those without access, with an explanation.
- **File browser** — three-pane: folder tree · file list · preview pane with metadata and "Share" CTA. Teammates' uploads shown as an explicit dimmed "hidden by only-own policy" row rather than silently omitted.
- **Upload wizard** — drag-drop zone primary; metadata panel to the right enables after drop. Stepper surfaces 3 phases (File · Categorize · Invoice details). Keyboard-equivalent "Browse files" button.
- **Share dialog** — internal-only recipient picker (chip-based), optional message, `Prevent download` toggle **locked on** (no per-share opt-out in v1), expiry date (defaults to 30 days, max 90).
- **Theme toggle** — top-right icon in the header.
- **AI agent slot** — a floating icon in the bottom-right opens a flyout panel; v1 shows an "Coming soon" state; shape matches the SPE Copilot Chat SDK for future drop-in.

## 7. Admin surface (`/w/:ws/admin`)

Gated on `AppAdmin`. Three tabs:

- **Workspaces** — list, create, archive. Creating a workspace provisions a new SPE container via app-only Graph, registers the metadata column schema, writes the entry to `workspaces.json`. Archive marks the workspace hidden without deleting the container.
- **Group mapping** — table of `(Entra group → role → workspace → team)`. Admins pick groups via a BFF-proxied `/groups?$search=` endpoint. Saving writes `group-role-map.json`; in-flight sessions re-resolve within 5 minutes.
- **Audit viewer** — canned KQL queries against Log Analytics, parameterized by user OID, workspace, action type, and time range. No raw KQL input from the UI.

Self-grant of `AppAdmin` from inside the app is not possible; admin-role assignment remains an Entra ID operation.

## 8. Security posture

Summary (details were iterated during brainstorming):

- **Identity:** Entra SSO only; Conditional Access inherited from tenant; BFF validates every token (issuer, audience, signature, expiry); no local accounts.
- **Session:** signed `HttpOnly`+`Secure`+`SameSite=Strict` cookie; server-side encrypted session JSON in SPE system container; 8h sliding / 24h absolute TTL; logout destroys the session file and cookie.
- **Transport:** HTTPS only; HSTS with preload; TLS 1.2+.
- **Web hardening:** strict CSP (`default-src 'self'; frame-src https://*.sharepoint.com; …`); `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; restrictive `Permissions-Policy`; no inline event handlers; no `eval`.
- **Secrets:** zero in config/env/repo; Managed Identity → Key Vault for `aad-client-secret`, `cookie-hmac-key`, `session-encryption-key`; KV-native rotation; app re-reads on restart.
- **Graph least privilege:** `FileStorageContainer.Selected`, `Files.ReadWrite.All` (scoped to our Container Type via resource-specific consent), `User.ReadBasic.All`, `Group.Read.All` (admin-path only).
- **Data protection:** allowlist + MIME sniff + 25 MB cap; SharePoint built-in AV; no-download view-only shares; only-own filter enforced both in Graph filter and in post-fetch code check.
- **Input/output:** server-side validation (Zod) for all inputs; React-encoded output; no `dangerouslySetInnerHTML`; filename sanitation against traversal/control chars.
- **Rate limiting:** per-session token bucket (300 req/min standard, 60/min upload, 5 concurrent uploads); per-IP floor on unauthenticated paths.
- **Monitoring:** App Insights metrics + alerts on auth-failure spikes, quarantine events, failed admin ops, Graph throttling.
- **Supply chain:** `npm audit` gate in CI; Trivy scan on image; pinned versions; Dependabot or Renovate.

## 9. Configuration model

### Tier 1 — Non-secret environment variables (set by Terraform)

| Variable | Purpose |
|---|---|
| `AZURE_TENANT_ID` | Entra tenant ID |
| `AZURE_CLIENT_ID` | AAD app registration (public) |
| `AZURE_CONTAINER_TYPE_ID` | SPE Container Type owned by this app |
| `AZURE_SYSTEM_CONTAINER_ID` | SPE system container instance ID |
| `AZURE_KEY_VAULT_URI` | KV endpoint for secret fetch |
| `SHAREPOINT_HOSTNAME` | e.g. `contoso.sharepoint.com` |
| `APP_BASE_URL` | Public URL (for OAuth redirect) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | From App Insights resource |
| `SESSION_TTL_SLIDING_MIN` | Default 480 |
| `SESSION_TTL_ABSOLUTE_MIN` | Default 1440 |
| `LOG_LEVEL` | `info` default |
| `NODE_ENV` | `production` |

### Tier 2 — Secrets in Key Vault (fetched via Managed Identity at startup)

| Secret name | Purpose |
|---|---|
| `aad-client-secret` | AAD app client secret |
| `cookie-hmac-key` | Session cookie signing |
| `session-encryption-key` | Session JSON encryption |

### Tier 3 — Runtime-mutable JSON in SPE system container

| File | Purpose |
|---|---|
| `/config/workspaces.json` | Workspace definitions + metadata schema |
| `/config/group-role-map.json` | Entra group → role/team/workspace |
| `/config/app-settings.json` | Feature flags, default theme, brand name |

### Config loader behavior

- All three tiers loaded at startup; fails fast with a clear error listing any missing piece.
- Single frozen `AppConfig` object; no `process.env` reads outside the loader.
- 5-minute poller re-reads tiers 3 (admin changes propagate without restart).
- Zod schema validation on every load.

## 10. IaC (Terraform)

Layout:

```
infra/
├── backend.tf          # azurerm backend, state in Storage Account
├── providers.tf        # azurerm + azuread pinned
├── variables.tf        # env, location, custom domain, budget alerts
├── main.tf             # module composition
├── outputs.tf
└── modules/
    ├── identity/       # user-assigned Managed Identity + role assignments
    ├── keyvault/       # KV (RBAC), secret placeholders, MI access
    ├── storage/        # Storage Account (TF state + backup blob container)
    ├── observability/  # Log Analytics + App Insights + daily cap + alerts
    ├── acr/            # Basic ACR + MI pull role
    ├── container-app/  # Container Apps environment + app (min=0, max=1, 0.5 vCPU)
    └── aad-app/        # azuread_application + SP + app role + redirect URIs; writes client secret to KV
```

**Terraform-managed:** everything repeatable — resource group, Managed Identity, Key Vault (with secret placeholders), Storage Account, ACR, Log Analytics + App Insights, Container Apps environment and app, Entra app registration + SP + `AppAdmin` role + redirect URIs, the AAD password pushed into KV.

**Out-of-band (one-time tenant consent):** SPE Container Type registration (PowerShell, tenant admin), initial SPE system container creation (via app bootstrap endpoint), Entra security-group creation (owned by IT), Conditional Access policies. Documented in `docs/runbooks/tenant-setup.md`.

**State & safety:**
- Remote state in the Storage Account; state file encrypted at rest.
- `azuread_application_password` with `lifecycle { ignore_changes = [...] }` so re-runs don't churn; password is written to KV in the same plan.
- Cost budgets (`azurerm_consumption_budget_resource_group`) with alerts at 50/80/100%.

## 11. Deployment pipeline

Three GitHub Actions workflows under `.github/workflows/`:

1. **`ci.yml`** — triggered on PRs and pushes to any branch.
   - Typecheck (both `/web` and `/server`)
   - Lint (eslint + stylelint)
   - Unit tests (vitest for web, jest for server)
   - Accessibility tests (`@axe-core/playwright` against key pages)
   - `npm audit` (production deps, high+ fails)
   - Build SPA + build image
   - Trivy scan on image; high/critical fails
   - Push image to ACR with `:sha-<shortsha>` tag
2. **`deploy.yml`** — triggered on push to `main` (deploys to **staging**) and on release tag `v*` (deploys to **production**).
   - `terraform plan/apply` for the target environment
   - `az containerapp update --image $ACR/$IMG:sha-xxx` — zero-downtime revision swap
   - Post-deploy smoke tests (healthz, auth redirect, preview endpoint)
   - Prod deploy requires a GitHub Environment reviewer
3. **`tf-plan.yml`** — triggered on PRs touching `infra/`. Runs `terraform plan`, comments the plan on the PR.

**Rollback:** `az containerapp revision set-mode single --revision <prev>` — documented in `docs/runbooks/rollback.md`.

**CI secrets:** only the deployer service principal's credentials (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, federated-credential preferred over client secret). Never the app's own client secret.

## 12. Observability & audit

- **Application Insights** for request traces, dependencies, exceptions, custom metrics.
- **Audit log** — structured `trackEvent` calls with `{ userOid, workspace, action, resourceId, ipHash, outcome, durationMs }`. Querable via KQL. Retained per compliance policy (default 90 days).
- **Alerts:**
  - Auth failure rate > threshold (credential stuffing signal)
  - Graph throttling (429s > threshold)
  - Error rate > threshold
  - SharePoint AV quarantine events
  - Failed admin ops
- **Health endpoints:**
  - `/health` — liveness (process up)
  - `/ready` — readiness (Graph reachability + KV reachability)

## 13. Testing strategy

| Layer | Tools | Scope |
|---|---|---|
| Unit | vitest (web) · jest (server) | Pure functions, auth middleware, authz guards, filename shaping, Zod schemas, column-metadata mappers |
| Component | React Testing Library | Fluent component behavior, keyboard interactions, ARIA attrs |
| Accessibility | @axe-core/playwright | Every route, both themes, empty + populated states |
| Integration (server) | supertest + Graph nock | Routes end-to-end with Graph mocked |
| E2E (happy path) | Playwright | Sign-in → upload → browse → share, against a disposable test tenant |
| Security | eslint security plugin, Trivy, npm audit | Static + supply chain |
| Performance | k6 smoke (optional) | 50 concurrent uploads, browse list with 1k items |

Test-coverage expectation: ≥ 80% line coverage on server; ≥ 70% on web; 100% on `authz/` guards.

## 14. AI agent extensibility (future)

- Reserved route surface: `/api/agent/*` (returns 501 in v1).
- Reserved UI surface: `FloatingCopilotIcon` + `FlyoutPanel`.
- Planned pattern: SharePoint Embedded Copilot Chat React SDK (as in legal-docs sample), scoped to the current workspace's container. Tool calls proxied through the BFF for authz and audit.
- No implementation in v1; design accommodates the drop-in.

## 15. Cost envelope

Target: ≤ $100/month total Azure spend for production.

| Resource | Plan | Monthly estimate |
|---|---|---|
| Container App | Consumption, min=0 max=1, 0.5 vCPU / 1 GB | $5–20 |
| ACR | Basic | $5 |
| App Insights + Log Analytics | Pay-As-You-Go, 1 GB/day cap | $0–5 |
| Key Vault | Standard | <$1 |
| Storage Account | Hot LRS | $1–2 |
| SharePoint Embedded | Metered (storage + API) | $20–40 |
| **Total** | | **$35–75** |

Staging, if run, uses `0.25 vCPU / 0.5 GB`, shares the Log Analytics workspace, adds $5–15/month.

Cost alerts: Terraform-provisioned budget with notifications at 50%, 80%, 100%.

## 16. Build / implementation approach

Implementation is agent-driven and documented in the repo's `CLAUDE.md`. Summary:

- Role-based agents handle architecture, exploration, review, security review, and testing.
- Each feature follows: brainstorm (if new scope) → plan (via `superpowers:writing-plans`) → implement (TDD where practical) → self-review → code review → security review → merge.
- CI enforces type, lint, unit, a11y, audit, image scan on every PR.

See `CLAUDE.md` at the repository root for the full workflow, commands, and conventions.

## 17. Out-of-scope / deferred

- **Multi-tenant SaaS.** Single-tenant in v1.
- **External (non-tenant) sharing.** Internal-only in v1.
- **AI agent implementation.** Surface reserved; logic deferred.
- **Azure Front Door / WAF.** Optional upgrade when threat model expands.
- **Defender for Storage.** Upgrade path documented.
- **Third environment beyond prod + staging.** PR preview slots if needed.
- **Full-text search inside file contents.** v1 searches filename + column metadata; content search deferred.
- **Workspace-configurable metadata schema editor.** Schema shape is present in `workspaces.json`; AP workspace ships with fixed fields. UI editor for schema deferred to when a second workspace is actually onboarded.
- **External identity providers.** Entra ID only.

## 18. Open questions / notes

None outstanding at spec-approval time. Any surfaced during planning will be appended here.
