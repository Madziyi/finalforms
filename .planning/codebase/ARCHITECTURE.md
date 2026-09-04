<!-- refreshed: 2026-09-03 -->
# Architecture

**Analysis Date:** 2026-09-03

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│ React/Vite PWA (`src/`)                                      │
│ Routes, form renderer, data/trend/attention/system pages     │
└───────────────┬──────────────────────────────┬───────────────┘
                │ local-first writes            │ API fetches
                ▼                               ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│ Dexie IndexedDB              │   │ Cloudflare Worker             │
│ `src/lib/offlineDb.ts`       │──▶│ `worker/index.ts`              │
│ drafts/checkpoints/queue     │   │ auth, routes, domain calls    │
└───────────────┬─────────────┘   └───────────────┬──────────────┘
                │ background upload               │
                ▼                                 ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│ Sync engine                  │   │ D1 domain modules             │
│ `src/lib/sync.ts`            │   │ records, local-first, formulas │
└─────────────────────────────┘   └───────────────┬──────────────┘
                                                  ▼
                              ┌──────────────────────────────────┐
                              │ D1 + BackupWorkflow               │
                              │ projections, generations,         │
                              │ Power Automate/SharePoint delivery│
                              └──────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Application shell | Browser routes, navigation, compatibility/update gates | `src/App.tsx`, `src/components/AppShell.tsx` |
| Form model | Stable nine-form manifest, field metadata, worksheet identities | `shared/forms.ts`, `shared/types.ts` |
| Form entry UI | Context selection, durable saves, completion, duplicate/collision flows | `src/pages/FormEntryPage.tsx` |
| Local persistence | Dexie tables, transactions, checkpoints, completed upload queue | `src/lib/offlineDb.ts` |
| Sync engine | Online detection, queue replay, retries, compatibility/operator refresh | `src/lib/sync.ts` |
| API boundary | Device token, JSON errors, route dispatch, CSV and AI endpoints | `src/lib/api.ts`, `worker/index.ts` |
| Server domain | Validation, revision protocol, local-first upsert, derived projections | `worker/domain/validation.ts`, `worker/domain/commands.ts`, `worker/domain/localFirst.ts`, `worker/domain/derivations.ts` |
| Backup pipeline | Freeze canonical generation, deliver/reconcile, status | `worker/domain/backup.ts`, `worker/workflow.ts` |

## Pattern Overview

**Overall:** Local-first PWA with a dual server contract: immutable command/revision protocol for legacy/migration compatibility and a latest-completed-record upload contract for v2 tablet completion.

**Key Characteristics:**
- IndexedDB commits are the user-visible local-save boundary; completed uploads are asynchronous.
- Shared form definitions, context normalization, and formulas are imported by both client and Worker.
- D1 owns context uniqueness, validation, freshness ordering, projections, and backup generation state.
- Derived Forms 5/6 are read-only client projections from exact Form 8 dates and server-owned D1 projections for API/backup consumers.

## Layers

**Presentation:**
- Purpose: Render forms, metadata, read-only projections, trends, exports, and attention state.
- Location: `src/pages/`, `src/components/`
- Depends on: `src/lib/`, `shared/`

**Client persistence/sync:**
- Purpose: Make drafts and completions durable offline and replay completed records when online.
- Location: `src/lib/offlineDb.ts`, `src/lib/sync.ts`, `src/lib/pwaUpdateCoordinator.ts`
- Depends on: Dexie, browser APIs, `src/lib/api.ts`

**Shared domain contract:**
- Purpose: Stable types, nine-form manifest, context keys, calendar dates, and deterministic formulas.
- Location: `shared/`
- Used by: Client, Worker, and tests.

**Worker/API:**
- Purpose: Authenticate requests, dispatch API routes, serialize errors, and start async derivation/workflow work.
- Location: `worker/index.ts`
- Depends on: Cloudflare bindings and Worker domain modules.

**D1 domain/persistence:**
- Purpose: Validate and persist records, revisions, observations, attention, projections, and backup generations.
- Location: `worker/domain/`, schema in `migrations/`

## Data Flow

### Primary Completion Path

1. `src/pages/FormEntryPage.tsx` mutates a local entry and increments `localVersion`.
2. `saveLocalEntry()` in `src/lib/offlineDb.ts` writes through a Dexie transaction; the UI can show “saved on this tablet” only after it resolves.
3. Completing the entry calls `enqueueCompleted()` and creates a `CompletedSyncItem`.
4. `src/lib/sync.ts` replays eligible queue items to `POST /api/completed`.
5. `worker/domain/localFirst.ts` validates the form/context, recomputes calculated values, applies freshness ordering, and upserts `latest_completed_records`.
6. A completed Form 8 upload triggers `recomputeDerivedDate()` asynchronously for affected current/next dates.

### Legacy Command Path

1. Client command/revision operations post to `POST /api/commands`.
2. `worker/domain/commands.ts` fingerprints the command, detects duplicates/conflicts/collisions, and batches aggregate, revision, claims, observations, dirty-date, and receipt changes.
3. Accepted Form 8 commands trigger post-response derivation; the accepted command remains safe if derivation fails.

### Backup Path

1. Cron or `POST /api/backups/run` starts `BackupWorkflow`.
2. The workflow chooses the previous Toronto date plus dirty dates, refreshes relevant projections, and calls `buildBackupGeneration()`.
3. `worker/domain/backup.ts` freezes latest completed rows, projections, and a D1 snapshot boundary, hashes canonical JSON, and creates immutable generation/delivery state.
4. Power Automate writes JSON/XLSX/receipt; the Worker marks the generation verified only after exact identity echo.

**State Management:**
- React state is page-local; durable client state is Dexie; server state is D1.
- `BroadcastChannel` and `ecc-local-change` events coordinate tabs/components.
- Sync state is observable through `getSyncSnapshot()` and `SyncIndicator`.

## Key Abstractions

**Form definition:**
- Purpose: Defines field types, context dimensions, schedules, calculation flags, and backup worksheet names.
- Examples: `shared/forms.ts`, `shared/types.ts`.

**Normalized context key:**
- Purpose: Canonical ownership key for date/shift/time-slot/boiler dimensions.
- Implementation: `shared/safetyContract.ts` and `normalizeContext()`.

**Canonical record:**
- Purpose: Shared representation crossing local storage, API responses, D1, and backup serialization.
- Type: `CanonicalRecord` in `shared/types.ts`.

**Durable checkpoint:**
- Purpose: Crash/update-safe local snapshot for the active aggregate.
- Implementation: `src/lib/offlineDb.ts` plus `src/lib/pwaUpdateCoordinator.ts`.

## Entry Points

**Browser entry:**
- Location: `src/main.tsx`
- Triggers: Vite/static HTML load.
- Responsibilities: Mount React, start sync engine, load global styles.

**Worker entry:**
- Location: `worker/index.ts`
- Triggers: HTTP fetch and Cloudflare scheduled event.
- Responsibilities: API routing/auth, asset fallback, scheduled workflow creation.

**Workflow entry:**
- Location: `worker/workflow.ts`
- Triggers: Manual or Cron `BackupWorkflow` instance.
- Responsibilities: Durable retryable projection/generation/delivery orchestration.

## Architectural Constraints

- **Runtime:** Browser event loop and Cloudflare Worker request/event handlers; no server process or in-memory durable state.
- **Global state:** Module-level sync snapshot/listeners in `src/lib/sync.ts`; one Dexie instance and BroadcastChannel in `src/lib/offlineDb.ts`.
- **Context ownership:** Completed records must have a normalized context; D1 and IndexedDB both enforce duplicate-context workflows.
- **Calculation authority:** Form 2 OH-ALK is recomputed in `shared/formulas.ts`; Worker validation is authoritative. Forms 5/6 must use exact Form 8 date dependencies.
- **Backup authority:** D1 chooses snapshot/date/filenames; Power Automate is delivery-only.

## Anti-Patterns

### Treating remote backup as runtime storage

**What happens:** Making save/completion depend on SharePoint or Power Automate availability.
**Why it's wrong:** Operators must complete forms offline and backup delivery can be retried independently.
**Do this instead:** Persist locally first and use `worker/domain/backup.ts` for asynchronous immutable delivery.

### Trusting client-calculated values

**What happens:** Accepting submitted `oh_alk` or derived Form 5/6 values as authoritative.
**Why it's wrong:** A stale or manipulated client could change operational calculations.
**Do this instead:** Recompute in `worker/domain/validation.ts` and `worker/domain/derivations.ts`; keep derived forms read-only.

## Error Handling

**Strategy:** Domain errors become structured JSON `{ error: { code, message, details } }`; local storage and sync failures are persisted/surfaced for recovery.

**Patterns:**
- `DomainError` in `worker/domain/validation.ts` carries HTTP status/code/details.
- Command/backup failures use attention rows, retry statuses, and reconciliation instead of deleting evidence.
- UI catches API/storage errors and keeps the durable local baseline intact.

## Cross-Cutting Concerns

**Logging:** `console` in Worker; UI notices plus sync snapshot.
**Validation:** Shared form metadata/context rules plus Worker-authoritative field validation.
**Authentication:** Shared device token on protected API routes; `/api/meta` is available before the compatibility gate.

---

*Architecture analysis: 2026-09-03*
