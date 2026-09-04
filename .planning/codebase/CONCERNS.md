# Codebase Concerns

**Analysis Date:** 2026-09-03

## Tech Debt

**Dual server persistence protocols:**
- Issue: Legacy aggregate/revision/command tables and the v2 `latest_completed_records` upload contract coexist.
- Files: `worker/domain/commands.ts`, `worker/domain/localFirst.ts`, `migrations/0001_baseline.sql`, `migrations/0002_local_first.sql`.
- Impact: Future changes must keep two semantics, migration backfill, and UI paths consistent.
- Fix approach: Treat the v2 path as the primary contract, document a removal gate for legacy consumers, and add cross-protocol integration tests before deleting legacy schema.

**Dense orchestration files:**
- Issue: Large, compact functions combine routing, React state transitions, persistence, and recovery decisions.
- Files: `src/pages/FormEntryPage.tsx`, `src/lib/offlineDb.ts`, `worker/index.ts`, `worker/domain/commands.ts`.
- Impact: Small edits can change reliability ordering or stale-state behavior without obvious type errors.
- Fix approach: Extract pure state-transition/domain helpers incrementally, preserving existing transaction boundaries and adding focused tests before each extraction.

## Known Bugs

**No automated browser/deployed backup qualification:**
- Symptoms: The test suite does not exercise an actual IndexedDB browser session, service-worker update, deployed Worker, Gemini response, or Power Automate/SharePoint flow.
- Files: `tests/`, `docs/QUALIFICATION_RUNBOOK.md`, `docs/CUTOVER_CHECKLIST.md`.
- Trigger: Environment/API/tenant behavior differs from handwritten fakes or local assumptions.
- Workaround: Run the qualification and cutover procedures plus `npm run smoke:local` and `npm run verify:cloud` before activation.

## Security Considerations

**Shared device token:**
- Risk: A single bearer token authorizes the device; possession grants access to operator management, records, exports, attention, backup controls, and AI extraction.
- Files: `worker/index.ts`, `src/lib/device.ts`, `src/lib/api.ts`.
- Current mitigation: Token is held as a Wrangler secret, sent in a custom header, and never embedded in `wrangler.jsonc`; local unauthenticated behavior is limited to localhost.
- Recommendations: Rotate/revoke tokens operationally, require HTTPS in production, avoid logging request headers, and consider per-device identity/rate limits if the deployment grows.

**AI extraction trust boundary:**
- Risk: Image/model output can be wrong or adversarial; Form 9 readings are operational data.
- Files: `worker/index.ts`, `src/components/AiCapture.tsx`, `shared/forms.ts`.
- Current mitigation: Prompt requires visible-only values, temperature 0, field allowlist, finite-number filtering, null for uncertain/missing fields, and UI review before save.
- Recommendations: Add endpoint-level tests for malformed model JSON, oversize/malicious image content, rate limits, and audit provenance for accepted AI-assisted values.

## Performance Bottlenecks

**Bounded sync replay:**
- Problem: `src/lib/sync.ts` processes at most eight eligible completed uploads per replay, with a five-second interval.
- Files: `src/lib/sync.ts`.
- Cause: Deliberate batching avoids concurrent replay but can create backlog after prolonged offline operation.
- Improvement path: Surface queue age/count, use adaptive batch sizes, and test retry fairness before changing concurrency.

**Broad record/history queries:**
- Problem: Several API paths cap results at 200 and history at five points per field; client data views may need more data as usage grows.
- Files: `worker/index.ts`, `worker/domain/localFirst.ts`.
- Cause: Simple bounded queries without cursor pagination.
- Improvement path: Add date/cursor pagination and indexes based on measured D1 query plans; retain bounded defaults for tablet performance.

## Fragile Areas

**IndexedDB migration and duplicate-context flow:**
- Files: `src/lib/offlineDb.ts`, `src/pages/FormEntryPage.tsx`.
- Why fragile: Local v1 aggregate migration, temporary edits, duplicate context, and durable checkpoint ordering interact across asynchronous React effects.
- Safe modification: Preserve Dexie transaction scopes, `localVersion` monotonicity, and cleanup-on-cancel behavior; extend source-contract tests when changing strings/branches.
- Test coverage: Mostly source assertions and fake-domain tests; no real multi-tab/browser test.

**Derived Form 5/6 dependency edges:**
- Files: `shared/formulas.ts`, `src/pages/FormEntryPage.tsx`, `worker/domain/derivations.ts`, `worker/workflow.ts`.
- Why fragile: Exact current/previous calendar dates, missing dependencies, negative deltas, stale projections, and adjustments must remain aligned client/server.
- Safe modification: Change shared formula tests first, then client/server projection tests, and verify backup includes Waiting projections.
- Test coverage: Strong deterministic formula coverage; limited end-to-end projection/backup coverage.

**Backup/Power Automate contract:**
- Files: `worker/domain/backup.ts`, `worker/workflow.ts`, `docs/POWER_AUTOMATE_BACKUP_V2.md`, `sharepoint/Populate_ECC_Daily_Backup_v2.ts`.
- Why fragile: Immutable filenames, exact hashes, receipt-last semantics, SharePoint propagation, and ambiguous network outcomes must agree across systems.
- Safe modification: Treat JSON contract/schema, Office Script worksheet manifest, and Worker verification as one change; run the documented duplicate/lost-response/historical-amendment tests.
- Test coverage: Fake generation tests exist; tenant-level delivery qualification is manual.

## Scaling Limits

**Single-tablet/shared-token operating model:**
- Current capacity: Designed for one operator PWA/tablet pattern and a small fixed operator list.
- Limit: Multi-device context races are handled, but identity, tenancy, and rate isolation are not modeled.
- Scaling path: Introduce device registry/identity and explicit authorization roles before broad multi-site or multi-tenant use.

**Backup retention and dirty-date scan:**
- Current capacity: Workflow processes up to 30 selected dates; Cloudflare instance retention is configured for 7 days success / 30 days error.
- Limit: Large historical amendment backlogs may require multiple/manual workflow runs.
- Scaling path: Paginate dirty dates, expose backlog metrics, and add a controlled historical replay operation.

## Dependencies at Risk

**Cloudflare/Wrangler/Workers APIs:**
- Risk: The project depends on current D1 batch behavior, Workflow APIs, asset bindings, and Wrangler JSON output parsing.
- Impact: Provisioning, migrations, local smoke checks, or deployment can break on CLI/runtime changes.
- Migration plan: Pin/upgrade deliberately through `package-lock.json`, keep `scripts/provision-cloud.mjs` and `scripts/verify-cloud.mjs` contract-tested, and re-run qualification after upgrades.

## Missing Critical Features

**Automated delivery verification:**
- Problem: No CI or scheduled automated regression gate covers the real Power Automate/SharePoint tenant.
- Blocks: Early detection of tenant schema, file-lock, Office Script, or auth drift.

## Test Coverage Gaps

**Browser durability and update flows:**
- What's not tested: Real IndexedDB quota/error behavior, reload/update checkpoint handshake, BroadcastChannel multi-tab conflict, and PWA service-worker lifecycle.
- Files: `src/lib/offlineDb.ts`, `src/lib/pwaUpdateCoordinator.ts`, `src/lib/sync.ts`, `src/App.tsx`.
- Risk: Tablet-only data-loss or stale-version failures could escape unit tests.
- Priority: High.

**HTTP boundary/security behavior:**
- What's not tested: Auth matrix, malformed JSON/content type, AI endpoint failure parsing, CSV escaping, and route-level status codes.
- Files: `worker/index.ts`, `src/lib/api.ts`.
- Risk: Production clients may see inconsistent errors or accidental exposure.
- Priority: Medium.

---

*Concerns audit: 2026-09-03*
