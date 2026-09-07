# ECC Operator Checks PWA — Canonical v3 Reliability Rebuild

Clean-slate rebuild of the Energy Conversion Centre operator-checks tablet application.

The design goal is local-first operation on one tablet. IndexedDB is the authoritative working copy for drafts and completed forms; completed snapshots upload continuously in the background and SharePoint remains a nightly backup.

The active canonical v3 reliability chain is:

**durable tablet entry → local completion → coalesced completed upload → latest Cloudflare record → nightly SharePoint backup**.

The canonical target uses only the canonical v3 migration set. Legacy v1 command/revision tables are not created in that target.

The older v1 design goal was not merely “eventual sync.” It was a single observable reliability chain:

**durable tablet checkpoint → immutable semantic command → atomic D1 revision/receipt → deterministic derived projections → immutable backup generation → verified SharePoint delivery**.

## Reliability invariants

- **Saved on this tablet** is shown only after an IndexedDB transaction commits.
- **Server confirmed** means an immutable D1 revision and the command receipt were committed atomically.
- A command may be delivered repeatedly, but the same `commandId` + fingerprint has **exactly-once effects**.
- D1 owns normalized context uniqueness. Two offline tablets cannot silently create two canonical records for one form/date/shift/time/boiler context.
- Completed forms can be edited through a temporary local edit; canceling or leaving the page discards it.
- A normalized form/context has one local entry. Duplicate context offers Open existing, Replace existing, or Cancel.
- Form 2 `OH-ALK` is recalculated by both UI and Worker as `(P-ALK × 2) - M-ALK`; the Worker is authoritative.
- Forms 5 and 6 are server-owned projections from exact completed Form 8 records. Missing calendar dates produce Waiting; they never block completion or backup.
- Forms 5/6 are read-only local/server projections from exact Form 8 dates. Negative deltas are retained with warnings.
- Backup files contain only completed cloud records and available Form 5/Form 6 projections, including Waiting outputs.
- **Backed up / verified** is recorded only after Power Automate echoes the exact generation ID, payload hash and immutable filenames.
- Form saving and sync never depend on SharePoint availability.

## Project layout

```text
migrations-canonical/       canonical v3 D1 migrations
migrations/                 legacy compatibility migrations (not for the canonical target)
shared/                     form manifest, protocol/context rules, formulas
src/                        React/Vite PWA
worker/                     Cloudflare Worker API, D1 domain logic, Workflow
scripts/                    Windows-safe local/cloud provisioning and verification
sharepoint/                 Excel template + Office Script v2
docs/                       architecture, Power Automate, qualification, cutover
```

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm
- Cloudflare account with Workers, D1 and Workflows
- Microsoft 365 access to SharePoint, Power Automate and Excel Online (Business) / Office Scripts
- Gemini API key only if Form 9 AI capture will be enabled

## 1. Install

From the project directory:

```powershell
npm install
```

Then validate the source:

```powershell
npm run check
npm test
```

## 2. Start from a completely fresh local database

This removes only local Wrangler emulation state. It never deletes the remote D1 database.

```powershell
npm run db:reset:local
npm run smoke:local
```

Start UI + local Worker:

```powershell
npm run dev
```

Vite prints the tablet UI URL. The Worker API runs on port `8787` and Vite proxies `/api` to it.

For local development the Worker allows API requests without `DEVICE_TOKEN` only when the Worker request host is localhost/127.0.0.1.

## 3. Automatically create a fresh Cloudflare D1 database

Authenticate Wrangler first if necessary:

```powershell
npx wrangler login
```

Then:

```powershell
npm run provision:cloud
```

If `wrangler.canonical.jsonc` still contains the zero UUID placeholder, this command:

1. creates a fresh canonical production database in D1,
2. parses the returned database UUID,
3. writes that UUID into `wrangler.canonical.jsonc`,
4. applies only the canonical v3 migrations, and
5. verifies that the production target has the expected canonical schema/seeds and **zero operational rows**.

To deliberately create another brand-new production target later, while leaving the previous database untouched:

```powershell
npm run provision:cloud -- --force-new
```

The new database receives a timestamped name and `wrangler.canonical.jsonc` is rebound to it.

## 4. Configure secrets

Do not put secrets in `wrangler.canonical.jsonc` or source control.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-secrets.ps1
```

Wrangler prompts for:

- `DEVICE_TOKEN` — one device authorization secret, not an operator login/PIN
- `GEMINI_API_KEY`
- `POWER_AUTOMATE_BACKUP_URL`
- `POWER_AUTOMATE_BACKUP_KEY`

A local `.dev.vars` may be copied from `.dev.vars.example` for local Worker testing. Never commit real values.

## 5. Configure SharePoint backup v2

Upload:

- `sharepoint/ECC_Operator_Daily_Backup_Template_v2.xlsx`
- `sharepoint/Populate_ECC_Daily_Backup_v2.ts` as an Office Script

Then build/update the Power Automate adapter using:

`docs/POWER_AUTOMATE_BACKUP_V2.md`

The v2 adapter never calculates operational values and never decides which date to back up. D1/Cloudflare owns those decisions.

## 6. Deploy

```powershell
npm run deploy
```

Wrangler deploys the Worker, static PWA assets, D1 binding, and `BackupWorkflow` binding. A free-plan Worker Cron Trigger runs at `45 5 * * *` UTC and starts the durable `BackupWorkflow`. The workflow determines the previous plant date in `America/Toronto` and also repairs older dirty dates.

After deploy:

```powershell
npm run verify:cloud
```

This reports canonical v3 schema metadata and operational counts without requiring them to remain zero.

## 7. Tablet installation

Open the deployed HTTPS URL in Chrome on the Android tablet. Use **Install app / Add to Home screen**. On the app's **System** page, enter the `DEVICE_TOKEN` once for that tablet.

The operator still selects their name on each form submission. There is no operator login or PIN.

## Important cutover rule

Do not activate operators after a fresh rebuild until `docs/QUALIFICATION_RUNBOOK.md` and `docs/CUTOVER_CHECKLIST.md` are complete.

Because Forms 5/6 use the previous **exact calendar date** Form 8, enter/complete the previous day's Form 8 before the first production date if those projections should be Current on cutover day. Otherwise they remain Waiting until the exact record exists. Do not seed it with invented readings.

## Backup artifact model

A verified generation writes immutable files such as:

```text
ECC_Operator_Backup_2026-09-02_G003_a1b2c3d4e5f6.json
ECC_Operator_Backup_2026-09-02_G003_a1b2c3d4e5f6.xlsx
ECC_Operator_Backup_2026-09-02_G003_a1b2c3d4e5f6_<generation-id>.receipt.json
```

The JSON is the authoritative canonical snapshot. Excel is the human-readable representation. A later historical correction creates another generation; it does not overwrite the earlier evidence.

## Recovery philosophy

Do not “fix” uncertain states by deleting local work, deleting SharePoint files, or editing D1 rows manually. Use the Attention page, explicit conflict/Replace operations, Workflow retry/reconciliation, and the qualification/runbook procedures.
