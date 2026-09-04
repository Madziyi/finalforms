# Technology Stack

**Analysis Date:** 2026-09-03

## Languages

**Primary:**
- TypeScript 5.9 - React client, shared contracts/formulas, and Cloudflare Worker code in `src/`, `shared/`, and `worker/`.
- SQL - Forward-only Cloudflare D1 schema and seed migrations in `migrations/`.

**Secondary:**
- JavaScript / ECMAScript modules - Local tooling and provisioning scripts in `scripts/`.
- PowerShell - Windows secret configuration helper in `scripts/configure-secrets.ps1`.
- Office Scripts TypeScript - SharePoint workbook population in `sharepoint/Populate_ECC_Daily_Backup_v2.ts`.

## Runtime

**Environment:**
- Browser PWA - React application with IndexedDB as the authoritative tablet working copy.
- Cloudflare Workers runtime - API and scheduled handler in `worker/index.ts`, with `BackupWorkflow` in `worker/workflow.ts`.
- Node.js 20+ (Node 22 recommended) - Development scripts, Vite, Vitest, and Wrangler.

**Package Manager:**
- npm
- Lockfile: `package-lock.json` is present.

## Frameworks

**Core:**
- React 19.1 with React DOM - UI in `src/`.
- React Router 6.30 - Route composition in `src/App.tsx`.
- Vite 7.1 - Client development and production bundling.
- Cloudflare Workers / Wrangler 4.128 - API, static assets, D1 binding, Cron, and Workflows.

**Testing:**
- Vitest 3.2 - Unit, domain-contract, migration-contract, and source-regression tests in `tests/`.

**Build/Dev:**
- `@vitejs/plugin-react` - JSX/React transformation.
- `vite-plugin-pwa` - Manifest, service worker, Workbox precaching, and update prompting configured in `vite.config.ts`.
- TypeScript project references - Separate client/shared and Worker/test checks in `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.worker.json`.

## Key Dependencies

**Critical:**
- `dexie` 4.2 - IndexedDB schema and transactional local-first storage in `src/lib/offlineDb.ts`.
- `react-router-dom` 6.30 - Form, data, trend, attention, export, and system routes.
- `recharts` 3.10 - Trend charts in `src/pages/TrendPage.tsx`.
- `lucide-react` 0.468 - UI icons across `src/components/` and `src/pages/`.

**Infrastructure:**
- `@cloudflare/workers-types` - D1, Fetcher, Workflow, scheduled-event, and Worker type definitions.
- `wrangler` - Local/remote D1 migration, Worker development, deployment, and verification.

## Configuration

**Environment:**
- Non-secret application settings are in `wrangler.jsonc`: protocol/schema versions, Toronto plant timezone, Gemini model, asset binding, Cron, D1, and Workflow bindings.
- Secret names are configured through Wrangler by `scripts/configure-secrets.ps1`; real values must not be committed.
- Client API requests use `X-ECC-Device-Token` from local storage, implemented in `src/lib/device.ts` and `src/lib/api.ts`.

**Build:**
- `vite.config.ts` configures React, PWA behavior, `/api` proxying to port 8787, and SPA fallback.
- `tsconfig.app.json` includes `src` and `shared`; `tsconfig.worker.json` includes `worker`, `shared`, and `tests`.
- `wrangler.jsonc` points the Worker entry at `worker/index.ts` and serves built assets from `dist/`.

## Platform Requirements

**Development:**
- Node.js 20+, npm, Wrangler authentication for cloud operations, and a browser with IndexedDB/Service Worker support.
- Cloudflare local Wrangler emulation is used by `npm run db:reset:local` and `npm run smoke:local`.

**Production:**
- Cloudflare Workers, D1, Workers Workflows, static Worker assets, and Cron.
- Microsoft 365 SharePoint, Power Automate, and Excel Online / Office Scripts for the nightly backup adapter.
- Gemini API key only when Form 9 image extraction is enabled.

---

*Stack analysis: 2026-09-03*
