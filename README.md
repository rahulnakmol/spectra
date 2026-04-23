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
