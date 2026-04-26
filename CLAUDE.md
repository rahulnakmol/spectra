# CLAUDE.md

Guidance for Claude Code when working in this repository.

> Read this file fully on first entry. The design spec lives at `docs/superpowers/specs/2026-04-24-spectra-design.md` — treat it as the source of truth for what we're building. This file describes *how* to build it.

---

## 1. Project overview

A Fluent UI + React SPA + Node/TypeScript BFF that provides a SharePoint-like experience over SharePoint Embedded (SPE) containers. Initial use case: Accounts Payable invoice management. Designed to support additional workspaces without code changes. Single-tenant Entra ID SSO, OBO-mediated Graph calls, internal-only no-download sharing.

See `docs/superpowers/specs/2026-04-24-spectra-design.md` for full decisions.

## 2. Tech stack

- **Frontend:** React 18, TypeScript, Vite, Fluent UI v9, Tailwind (utility layer only).
- **Backend:** Node.js 20 LTS, TypeScript, Express, `@azure/msal-node`, `@microsoft/microsoft-graph-client`, `@azure/identity`, `@azure/keyvault-secrets`, `applicationinsights`, `zod`.
- **Packaging:** single Docker image with BFF + SPA bundle.
- **Infra:** Terraform (Azure) — Container Apps, ACR, Key Vault, App Insights, Storage, Entra app reg.
- **CI:** GitHub Actions.

## 3. Repository layout

```
.
├── web/                    # React SPA (Vite)
├── server/                 # Node/Express BFF (TypeScript)
├── shared/                 # Types shared between web and server (DTOs, enums)
├── infra/                  # Terraform modules
├── .github/workflows/      # CI/CD pipelines
├── docs/
│   ├── superpowers/        # Specs and plans from brainstorming/planning
│   └── runbooks/           # Tenant setup, rollback, incident response
├── scripts/                # One-time setup and ops scripts
├── Dockerfile              # Multi-stage: build web → build server → runtime
├── CLAUDE.md               # You are here
└── README.md
```

**Do not** place Node source under the repository root — keep `web/`, `server/`, `shared/` separate.

## 4. Build & run

Local development requires: Node 20+, a dev Entra ID app registration, a dev SPE Container Type, and a `.env.local` (see `.env.example`). All commands are run from the repository root unless noted.

```bash
npm install                 # workspaces install (web + server + shared)
npm run dev                 # runs server on :3000 and vite on :5173 with /api proxy
npm run build               # builds shared → server → web, outputs server/dist/
npm run test                # runs all test suites (vitest + jest)
npm run test:a11y           # axe-core accessibility tests (Playwright)
npm run lint                # eslint + stylelint across all workspaces
npm run typecheck           # tsc --noEmit across workspaces
npm run docker:build        # builds the production image
npm run docker:run          # runs the image locally against dev Azure resources

cd infra && terraform plan  # IaC plan against the selected workspace
cd infra && terraform apply # IaC apply (use workspace: dev / staging / prod)
```

Secrets for local dev come from the developer's own Key Vault or a `.env.local` file; `.env.local` is gitignored. **Never** check in a `.env` or any file containing tokens, secrets, or client secrets.

## 5. Agent-driven development workflow

This project uses role-based subagents for each phase of work. Pick the right agent for the job; trust the main thread to coordinate.

### Phase 1 — Exploration & architecture

| Task | Agent | When |
|---|---|---|
| Understand existing module before changing it | `feature-dev:code-explorer` | First entry into unfamiliar code |
| Design architecture for a new feature | `feature-dev:code-architect` | Before writing code for anything non-trivial |
| Open-ended codebase question / search | `Explore` (general codebase survey) | "How does X work?" |

### Phase 2 — Planning

Every non-trivial change runs through:

1. **`superpowers:brainstorming`** if the feature is new scope not already in the design spec. Produces a design doc under `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. **`superpowers:writing-plans`** once design is approved. Produces an implementation plan under `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`.
3. **`superpowers:executing-plans`** — when the plan is executed in a follow-up session with review checkpoints.

Skip brainstorming only when the change is explicitly contained within an item already detailed in an approved spec.

### Phase 3 — Implementation

Follow the plan. For anything non-trivial:

- **`superpowers:test-driven-development`** — write the failing test first, then the implementation, then refactor. Applies to all server-side business logic (`authz/`, `upload/`, `sharing/`, `store/`).
- **`superpowers:systematic-debugging`** — for any bug investigation. Reproduce first, then locate, then fix; do not guess-patch.

Keep units small and focused. If a file exceeds ~300 lines or a function ~50 lines, stop and decompose.

### Phase 4 — Self-review before PR

Before raising a PR, run these in parallel:

| Agent | Purpose |
|---|---|
| `code-simplifier` | Catch redundancy, dead code, over-abstraction in the diff |
| `pr-review-toolkit:silent-failure-hunter` | Any `catch` block or fallback added in the diff |
| `pr-review-toolkit:type-design-analyzer` | Any new `interface` / `type` / `class` in the diff |
| `pr-review-toolkit:comment-analyzer` | Any doc-comments added in the diff |
| `pr-review-toolkit:pr-test-analyzer` | Test coverage for added/changed lines |

### Phase 5 — Review gates (required)

**A. Code review** (required for every PR to `main`):
- Primary: `pr-review-toolkit:code-reviewer` (style, conventions, correctness)
- Secondary (for architectural changes): `feature-dev:code-reviewer` (architectural fit)
- Optional but encouraged: `/review` slash command for comprehensive review
- For high-risk PRs, `/ultrareview` (cloud-run multi-agent review) — user-triggered only.

**B. Security review** (required for PRs touching auth, authz, upload, sharing, session, config, CSP, CORS, CI/CD, or IaC):
- Run `/security-review` slash command on the branch.
- Block merge on any High or Critical finding.

**C. Accessibility check** — axe-core CI passes; manual keyboard + screen-reader smoke for any UI change.

### Phase 6 — CI gates

Merging to `main` requires all of the following to be green:

- Typecheck, lint, unit tests (all workspaces)
- Accessibility tests (axe-core via Playwright)
- `npm audit --production` (no high/critical)
- Trivy image scan (no high/critical)
- Build + image publish
- Terraform plan (if `infra/` touched) reviewed in PR comment

## 6. Conventions

### TypeScript

- Strict mode; `noUncheckedIndexedAccess` on.
- Prefer `type` for data shapes, `interface` for public contracts meant to be extended.
- Parse at the edge: Zod schemas for every HTTP input and every config file; no raw `JSON.parse` into unknown types outside `store/`.
- No `any`. Use `unknown` and narrow.
- Errors: throw typed errors from domain modules; translate to HTTP in a single error middleware.

### React

- Functional components only.
- Fluent UI components first; Tailwind only for layout/spacing; no custom styling outside Fluent's theme tokens.
- Server state via React Query; local state via `useState`/`useReducer`. No global store unless a second feature actually needs it.
- No `dangerouslySetInnerHTML`.
- Every interactive element is keyboard-reachable, labeled, and announced correctly to screen readers.

### Security rules (non-negotiable)

- **No secrets in code, config, env examples, or commit messages.** Secrets go to Key Vault; local dev loads them from a gitignored file. CI has its own deployer SP creds only.
- **The BFF is the sole path to Graph.** The SPA never imports MSAL.js and never has a Graph SDK dependency.
- **All HTTP inputs are validated with Zod.** Reject-by-default for any field not in the schema.
- **All external Graph calls go through `spe/`** — no ad-hoc Graph calls elsewhere. Central retry + throttling + audit hook.
- **Filename sanitation** runs on every upload path. Reject path traversal, control chars, overlong names.
- **CSP headers are set by the BFF.** Do not add inline handlers, inline styles (beyond Fluent's controlled usage), or script loads from third-party origins.
- **Session cookies are always `HttpOnly`+`Secure`+`SameSite=Strict`.** Never relax these for debugging.

### Accessibility

- WCAG 2.0 AA (AODA-aligned).
- `aria-live="polite"` on upload progress, validation errors, share confirmations.
- Focus management in dialogs: focus trap + return focus on close.
- Drag-drop always has a keyboard-equivalent `Browse` button.
- Theme toggle persists per-user in session JSON.

### Error handling

- Server-side: typed domain errors translated to HTTP at the edge. Never expose stack traces or internals to the client; log the full context to App Insights.
- Client-side: user-facing messages are actionable ("Invoice number must be unique within this workspace") — never "Internal server error."
- Silent failures are a bug. Every `catch` either handles (with an explicit recovery) or re-throws. `silent-failure-hunter` review enforces this.
- No fallback behaviors that mask data loss (e.g., "if upload fails, pretend it worked").

### Logging & audit

- Use `obs/` helpers — never `console.log` in production code paths.
- Audit events carry `{ userOid, workspace, action, resourceId, ipHash, outcome, durationMs }`.
- `ipHash` is a salted hash, not raw IP.
- PII (vendor names, invoice numbers) does not go to logs beyond audit fields.

### Testing

- TDD for server-side business logic (`authz/`, `upload/`, `sharing/`, `store/`).
- Accessibility is an acceptance criterion, not a later pass.
- Integration tests use `nock` to mock Graph with realistic responses and 429 simulations.
- E2E tests run against a disposable test tenant — never production.
- Coverage gates: ≥ 80% server, ≥ 70% web, 100% on `authz/` guards.

## 7. CI/CD

Three workflows under `.github/workflows/`:

- **`ci.yml`** — PR and push: typecheck, lint, unit, a11y, audit, build, Trivy, image publish.
- **`deploy.yml`** — push to `main` → staging; release tag → prod. Terraform apply + revision swap + smoke tests. Prod requires GitHub Environment reviewer.
- **`tf-plan.yml`** — any PR touching `infra/`: runs `terraform plan` and posts it to the PR.

Rollback: `az containerapp revision set-mode single --revision <prev>` (see `docs/runbooks/rollback.md`).

**CI secrets policy:**
- Prefer GitHub OIDC federated credentials over client secrets for the deployer SP.
- The app's own `aad-client-secret` is never in CI — it lives in Key Vault, written by Terraform.

## 8. Runbooks

Living documents under `docs/runbooks/`:

- `tenant-setup.md` — one-time SPE Container Type registration, Entra group creation, Conditional Access.
- `rollback.md` — revision swap, TF rollback, hotfix.
- `incident-response.md` — auth-failure spike, Graph throttling, quarantine burst.
- `rotation.md` — Key Vault secret rotation procedure.

## 9. When in doubt

- **Cross-reference the design spec first.** If the spec doesn't answer the question, surface it and propose an update to the spec before writing code.
- **Follow existing patterns in the codebase.** If a pattern is absent, match the conventions in this file.
- **Prefer rejection over silent fallback.** It's safer for a request to fail loudly than to succeed with wrong data.
- **Ask the user** before taking any action that affects shared resources (SPE containers, Entra app reg, Azure infra, published images, production deployments, pushed commits).
