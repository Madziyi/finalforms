# Codebase Structure

**Analysis Date:** 2026-09-03

## Directory Layout

```text
ecc_operator_pwa_v1_rebuild/
├── src/                 # React/Vite PWA pages, components, browser libraries
├── shared/              # Form manifest, shared types, safety rules, formulas
├── worker/              # Cloudflare Worker HTTP/scheduled entry and domain logic
├── migrations/          # Forward-only D1 schema, seeds, and legacy backfill
├── tests/               # Vitest tests and reliability contract checks
├── scripts/              # Windows/local/cloud provisioning and smoke utilities
├── sharepoint/           # Backup workbook, Office Script, Power Automate schemas
├── docs/                 # Architecture, operations, qualification, and cutover docs
├── public/               # PWA icons and favicon
├── dist/                 # Vite build output / Worker static asset input
├── wrangler.jsonc        # Cloudflare bindings, vars, Cron, and deployment config
├── vite.config.ts        # Client build, PWA, and local API proxy config
└── package.json          # Scripts and dependencies
```

## Directory Purposes

**`src/`:**
- Purpose: Browser UI and local-first client behavior.
- Contains: `pages/`, `components/`, `lib/`, `App.tsx`, `main.tsx`, styles, and client types.
- Key files: `src/pages/FormEntryPage.tsx`, `src/lib/offlineDb.ts`, `src/lib/sync.ts`.

**`shared/`:**
- Purpose: Keep client, Worker, and tests on one protocol/formula contract.
- Contains: `forms.ts`, `types.ts`, `formulas.ts`, `safetyContract.ts`.

**`worker/`:**
- Purpose: API, scheduled handler, and D1 domain services.
- Contains: `index.ts`, `workflow.ts`, `env.ts`, and `domain/` modules for validation, records, commands, local-first, derivation, backup, hashing, and attention/database helpers.

**`migrations/`:**
- Purpose: D1 schema evolution.
- Contains: baseline legacy protocol (`0001_baseline.sql`), local-first table (`0002_local_first.sql`), and compatibility backfill/freshness columns (`0003_local_first_backfill.sql`).

**`tests/`:**
- Purpose: Fast deterministic tests for formulas, context ownership, form/worksheet identity, migration contracts, and local-first reliability seams.

**`sharepoint/`:**
- Purpose: Human-readable backup delivery assets and contract schemas. Changes here must stay aligned with `worker/domain/backup.ts` and `docs/POWER_AUTOMATE_BACKUP_V2.md`.

## Key File Locations

**Entry Points:**
- `src/main.tsx`: browser bootstrap and sync-engine startup.
- `src/App.tsx`: route tree and compatibility/PWA update gates.
- `worker/index.ts`: Worker fetch/scheduled entry and all `/api` route dispatch.
- `worker/workflow.ts`: durable backup workflow.

**Configuration:**
- `package.json`: development, test, build, D1, provisioning, and deployment commands.
- `wrangler.jsonc`: Cloudflare vars/bindings/assets/Cron.
- `vite.config.ts`: React/PWA build and local API proxy.
- `tsconfig*.json`: strict compiler scopes.

**Core Logic:**
- `shared/forms.ts`: nine-form identity and field metadata.
- `shared/safetyContract.ts`: context normalization and protocol constants.
- `shared/formulas.ts`: deterministic calculations.
- `src/lib/offlineDb.ts`: Dexie persistence and queues.
- `worker/domain/localFirst.ts`: completed-record freshness/upsert contract.
- `worker/domain/commands.ts`: legacy immutable revision protocol.
- `worker/domain/backup.ts`: generation freezing and delivery verification.

**Testing:**
- `tests/formulas.test.ts`, `tests/safetyContract.test.ts`, `tests/formManifest.test.ts`, `tests/phase4-local-first.test.ts`.

## Naming Conventions

**Files:**
- React pages/components use PascalCase, e.g. `FormEntryPage.tsx`, `FormRenderer.tsx`.
- Browser/domain utility modules use camel/lowercase names, e.g. `offlineDb.ts`, `pwaUpdateCoordinator.ts`, `localFirst.ts`.
- SQL migrations use ordered numeric prefixes: `0001_...sql`.
- Tests use `<topic>.test.ts` in `tests/`.

**Directories:**
- Lowercase functional directories: `src/pages`, `src/components`, `src/lib`, `worker/domain`.
- Shared code lives at repository root in `shared/` so both compiler projects can import it.

## Where to Add New Code

**New Feature:**
- UI route/page: `src/pages/`; register route in `src/App.tsx` and navigation in `src/components/AppShell.tsx` when needed.
- Durable client behavior: `src/lib/offlineDb.ts` and/or `src/lib/sync.ts`; use Dexie transactions and emit local-change events.
- API route: `worker/index.ts` for dispatch/auth/serialization, with domain logic in a focused `worker/domain/*.ts` module.
- Shared request/response/domain shape: `shared/types.ts`; shared field/form rule: `shared/forms.ts` or `shared/safetyContract.ts`.

**New Component/Module:**
- Reusable visual control: `src/components/`.
- Form field behavior: extend `src/components/FormRenderer.tsx` or a dedicated field component such as `NumericField.tsx`.
- Server persistence behavior: add a domain module and a forward-only migration under `migrations/`.

**Utilities:**
- Browser-only helpers: `src/lib/`.
- Cross-runtime helpers: `shared/`.
- Worker-only helpers: `worker/domain/`.

## Special Directories

**`dist/`:**
- Purpose: Vite production output consumed by Wrangler assets.
- Generated: Yes.
- Committed: Treat as build output; regenerate with `npm run build`.

**`node_modules/`:**
- Purpose: Installed npm dependencies.
- Generated: Yes; do not edit.

**`.wrangler/`:**
- Purpose: Wrangler local emulation state and generated local D1 data.
- Generated: Yes; reset only through `npm run db:reset:local` when appropriate.

**`docs/` and `sharepoint/`:**
- Purpose: Operational contracts and external delivery artifacts.
- Generated: No; changes are source-controlled and operationally significant.

---

*Structure analysis: 2026-09-03*
