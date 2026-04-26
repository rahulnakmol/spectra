# Spectra

A secure, accessible web application for managing files inside **SharePoint Embedded (SPE)** containers — presented through a focused, branded experience scoped to your organization's document workflows.

## Why Spectra exists

[SharePoint Embedded](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview) gives developers programmatic file storage backed by SharePoint infrastructure (containers, file metadata, retention, sharing) without surfacing the full SharePoint Online UI. That's powerful for application builders, but most teams don't want to:

- Build a complete file-management UI from scratch for every internal tool that needs documents
- Expose users to the broader SharePoint Online surface (sites, OneDrive, admin centers) when the workflow only needs a single container
- Grant Microsoft Graph permissions broadly enough that a token leak puts unrelated tenants at risk

Spectra fills that gap with a **single-tenant, locked-down web app** that gives users a SharePoint-quality experience over only the SPE containers their team needs — with all Graph access mediated by a server-side BFF that never exposes tokens to the browser.

## What it provides

- **Workspace-driven UX** — Each SPE container type maps to a functional workspace (e.g., the initial Accounts Payable workspace for invoices). Adding a workspace is configuration, not code.
- **SharePoint-like file experience** — Browse, search, upload (drag-drop with keyboard-equivalent Browse button), preview, and share files using Fluent UI v9 components that mirror SharePoint's interaction model.
- **Internal-only sharing with no-download enforcement** — Recipients can read documents in-app but cannot download or forward them. Suitable for sensitive financial, legal, or HR document workflows.
- **Single-tenant Entra ID SSO** — Users authenticate once with their work account; Conditional Access policies apply.
- **On-Behalf-Of Graph access** — The SPA never holds Graph tokens or imports MSAL.js. The Node BFF exchanges the user's session for OBO tokens and brokers all Graph calls.
- **WCAG 2.0 AA accessibility** — Keyboard-first design, screen-reader announcements, theme persistence, focus-trapped dialogs.
- **Production-ready operational signals** — Application Insights telemetry, structured audit events with salted IP hashes, rate limiting, strict CSP/HSTS headers, and graceful shutdown.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ Fluent UI SPA   │───▶│ Spectra BFF      │───▶│ Microsoft Graph     │
│ (React + Vite)  │    │ (Express + TS)   │    │ (SPE container API) │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
   Entra ID SSO        OBO token exchange      Per-user RBAC enforced
   Session cookie       Audit + rate limit       on the container
   No Graph SDK         CSP / HSTS headers
```

A single Docker image bundles the SPA bundle and the BFF together. It runs on Azure Container Apps with secrets loaded from Azure Key Vault via Managed Identity, and telemetry flowing to Application Insights.

The BFF is the **sole** path to Microsoft Graph — the SPA has no MSAL.js dependency, no Graph SDK, and no direct knowledge of tenant identifiers or container IDs.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Fluent UI v9, Tailwind (utility layer only) |
| Backend | Node.js 20 LTS, TypeScript, Express, MSAL Node, Microsoft Graph SDK |
| Identity | Single-tenant Microsoft Entra ID, on-behalf-of token flow |
| Storage | SharePoint Embedded containers (per-workspace) |
| Observability | Application Insights, structured audit events |
| Secrets | Azure Key Vault (loaded via Managed Identity at startup) |
| Infrastructure | Terraform (Azure Container Apps, ACR, Key Vault, App Insights, Storage) |
| CI/CD | GitHub Actions (typecheck, lint, test, axe-core a11y, Trivy scan, image publish) |

## First workspace: Accounts Payable

The initial deployment manages AP invoice processing end-to-end:

1. Upload invoices via drag-drop into the AP container
2. Validate invoice numbers as unique within the workspace (rejection at upload time, not on a downstream queue)
3. Browse, search, filter, and preview invoices through the Fluent UI surface
4. Share with internal stakeholders for approval — read-only, no download, with audit trails on every access

Future workspaces (HR onboarding documents, Legal contracts, etc.) plug in through SPE container type configuration plus a workspace registry entry. No application code changes required to add a new workspace.

## Quick start

Requires Node 20+ (see `.nvmrc`) and Docker for image builds. Local development also requires a development Entra ID app registration and an SPE container type — see `docs/runbooks/tenant-setup.md` (added in P1).

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run docker:build
```

For local development:

```bash
cp .env.example .env.local   # fill in dev tenant + Key Vault values
npm run dev                  # BFF on :3000, Vite SPA on :5173 with /api proxy
```

Secrets for local dev come from your own Key Vault or a gitignored `.env.local` file. **Never** check in a `.env` file or any file containing tokens, client secrets, or session keys.

## Repository layout

- `web/` — React SPA (Vite)
- `server/` — Node/Express BFF (TypeScript)
- `shared/` — Types and Zod schemas shared between web and server
- `infra/` — Terraform modules (added in P4)
- `docs/superpowers/` — Design specs and implementation plans
- `docs/runbooks/` — Operational guides (tenant setup, rollback, incident response)
- `scripts/` — One-time setup and ops scripts

## Security posture

- **BFF is the sole path to Graph.** SPA has no MSAL.js, no Graph SDK, no tenant identifiers in code.
- **All HTTP inputs validated with Zod.** Reject-by-default for any field not in the schema.
- **Strict CSP, HSTS, Permissions-Policy.** Set centrally by the BFF; no inline handlers or third-party origin script loads.
- **Session cookies** are `HttpOnly` + `Secure` + `SameSite=Strict`. No relaxation, ever.
- **Filename sanitation** runs on every upload path (path traversal, control characters, overlong names rejected).
- **Per-IP rate limiting** at the BFF (token-bucket) protects upstream Graph quota.
- **Salted hashed IPs** in audit logs — raw IPs are never persisted.
- **Centralized audit channel** — every authn/authz/upload/share event lands in Application Insights with a structured shape.
- **Conditional Access enforcement** at Entra ID — MFA, compliant device, and named-location policies apply at sign-in.

See `docs/superpowers/specs/2026-04-24-spectra-design.md` for the full design and `CLAUDE.md` for development workflow and conventions.

## License

See [`LICENSE`](LICENSE).
