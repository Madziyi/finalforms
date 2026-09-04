# External Integrations

**Analysis Date:** 2026-09-03

## APIs & External Services

**Cloudflare platform:**
- Workers - Serves the SPA assets and `/api/*` routes from `worker/index.ts`.
  - SDK/Client: Cloudflare Worker runtime APIs and `wrangler`.
  - Auth: `DEVICE_TOKEN`, sent as `X-ECC-Device-Token` for non-local requests.
- D1 - Stores operators, local-first completed records, legacy command/revision history, projections, attention items, and backup state.
  - Binding: `DB` in `worker/env.ts` and `wrangler.jsonc`.
  - Schema: `migrations/0001_baseline.sql`, `migrations/0002_local_first.sql`, and `migrations/0003_local_first_backfill.sql`.
- Workers Workflow - Runs date selection, projection refresh, generation freezing, and backup delivery retries.
  - Binding: `BACKUP_WORKFLOW`; class: `BackupWorkflow` in `worker/workflow.ts`.

**Google Gemini:**
- Form 9 DCS photo extraction - `worker/index.ts` sends compressed image data to the Gemini `generateContent` REST endpoint.
  - SDK/Client: native `fetch`; model from `GEMINI_MODEL`.
  - Auth: `GEMINI_API_KEY`.
  - Safety boundary: prompt requests JSON-only visible readings; server allowlists field keys, converts invalid/non-finite values to `null`, and adds uncertain fields to `needsCheck`.

**Microsoft 365 backup adapter:**
- Power Automate HTTP trigger - `worker/domain/backup.ts` posts an immutable envelope to `POWER_AUTOMATE_BACKUP_URL` with `X-ECC-Backup-Key`.
  - Auth: `POWER_AUTOMATE_BACKUP_KEY`.
  - Contract: `ecc-backup-v2`; the Worker verifies the echoed generation ID, hash, and immutable file names.
- SharePoint / Excel Online - The flow documented in `docs/POWER_AUTOMATE_BACKUP_V2.md` stores canonical JSON, creates/reuses the workbook, runs `Populate ECC Daily Backup v2`, and writes the receipt last.
  - Template/script: `sharepoint/ECC_Operator_Daily_Backup_Template_v2.xlsx` and `sharepoint/Populate_ECC_Daily_Backup_v2.ts`.

## Data Storage

**Databases:**
- Cloudflare D1 / SQLite - Runtime canonical and operational persistence.
  - Connection: Wrangler binding `DB`, configured in `wrangler.jsonc`.
  - Client: Prepared statements and `db.batch()` calls in `worker/domain/*.ts`.
- Browser IndexedDB - Tablet-local drafts, completed upload queue, cached operators/server records, checkpoints, and metadata.
  - Client: Dexie database `ecc-operator-v1` in `src/lib/offlineDb.ts`.

**File Storage:**
- SharePoint Documents library for immutable JSON/XLSX/receipt backup generations.
- Local static assets are bundled under `public/` and emitted to `dist/`.

**Caching:**
- IndexedDB local records and server cache; no Redis or external cache detected.
- Workbox precache/service-worker cache configured in `vite.config.ts`.

## Authentication & Identity

**Auth Provider:**
- Shared device-token authorization, not user login.
  - Implementation: `worker/index.ts` checks `X-ECC-Device-Token`; localhost may operate without a configured token for local development.
  - Operators are selected records in D1 (`operators` table), not authentication identities.

## Monitoring & Observability

**Error Tracking:**
- None detected. Cloudflare observability is enabled in `wrangler.jsonc`, but there is no third-party error tracker.

**Logs:**
- `console.error` and `console.log` in Worker request, derivation, scheduled, and backup paths.
- UI surfaces API/storage/sync messages in page notices and the sync indicator.
- Persistent operational follow-up is represented by `attention_items` and backup status rows.

## CI/CD & Deployment

**Hosting:**
- Cloudflare Worker with static assets, D1, Cron, and Workflow bindings; deploy command is `npm run deploy`.

**CI Pipeline:**
- No CI configuration was detected. Local gates are `npm run check`, `npm test`, `npm run build`, `npm run smoke:local`, and `npm run verify:cloud`.

## Environment Configuration

**Required env vars / secrets:**
- Runtime vars: `APP_PROTOCOL_VERSION`, `APP_SCHEMA_VERSION`, `PLANT_TIME_ZONE`, `GEMINI_MODEL`.
- Secrets: `DEVICE_TOKEN`, `GEMINI_API_KEY`, `POWER_AUTOMATE_BACKUP_URL`, `POWER_AUTOMATE_BACKUP_KEY`.

**Secrets location:**
- Wrangler secret store for deployment; `.dev.vars` is supported for local Worker testing and must remain uncommitted.

## Webhooks & Callbacks

**Incoming:**
- Power Automate receives the Worker POST; no inbound application webhook endpoint is defined in the Worker.

**Outgoing:**
- Worker → Gemini REST API for Form 9 extraction.
- Worker → Power Automate HTTP trigger for backup delivery.

---

*Integration audit: 2026-09-03*
