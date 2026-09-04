# Coding Conventions

**Analysis Date:** 2026-09-03

## Naming Patterns

**Files:**
- PascalCase for React pages/components (`src/pages/DataPage.tsx`).
- camel/lowercase for libraries and Worker domains (`src/lib/api.ts`, `worker/domain/validation.ts`).
- `snake_case` for D1 columns and serialized trend fields; camelCase for TypeScript objects crossing the UI/API boundary.

**Functions:**
- camelCase, usually action-oriented (`saveLocalEntry`, `recomputeDerivedDate`, `buildBackupGeneration`).
- React components are PascalCase function declarations (`FormEntryPage`, `AppShell`).

**Variables:**
- camelCase locally; short names such as `db`, `url`, `form`, and `entry` are common in focused functions.
- Use explicit semantic names for reliability state: `localVersion`, `baseRevision`, `snapshotBoundary`, `derivedDates`.

**Types:**
- PascalCase aliases/interfaces in `shared/types.ts` and `src/lib/offlineDb.ts`.
- String unions model lifecycle/outcome/status values instead of broad strings where practical.

## Code Style

**Formatting:**
- No dedicated Prettier/Biome configuration was detected.
- Existing code is compact, with several intentionally dense one-line React/domain functions. Preserve behavior and local style when making small changes, but prefer readable multiline code for new complex logic.
- Semicolons and double-quoted strings are the dominant TypeScript style.

**Linting:**
- No ESLint configuration or lint script was detected.
- The enforceable quality gate is strict TypeScript via `npm run check` and `npm run build`.

## Import Organization

**Order:**
1. External packages (`react`, `react-router-dom`, `dexie`, `lucide-react`).
2. Relative application modules (`../components`, `../lib`, `./domain`).
3. Shared types/formulas/rules, often via relative imports from `shared/`.

**Path Aliases:**
- No TypeScript path aliases were detected. Use relative paths, with shared imports such as `../../shared/formulas` from Worker/client code.

## Error Handling

**Patterns:**
- Worker domain validation throws `DomainError` with stable `code`, HTTP `status`, message, and optional details (`worker/domain/validation.ts`).
- `worker/index.ts` converts domain errors into structured JSON and logs unexpected errors.
- Client API failures become `ApiError` in `src/lib/api.ts`; pages display the message without discarding local state.
- Local persistence errors are written to the entry when possible and rethrown with recovery guidance in `src/lib/offlineDb.ts`.
- Background sync catches per-item failures, marks retry state, and continues processing the queue.

## Logging

**Framework:** `console` only; no logging package detected.

**Patterns:**
- Log unexpected Worker failures and asynchronous derivation/backup failures with identifying dates/instances.
- Do not log device tokens, API keys, image payloads, or full sensitive request bodies.
- Represent operator-actionable conditions persistently through `attention_items`, `lastError`, and UI notices.

## Comments

**When to Comment:**
- Comment reliability boundaries and non-obvious invariants: local commit before acknowledgement, post-response derivation, exact-date dependencies, immutable backup delivery, and migration compatibility.
- Keep comments current-state and actionable; point to the invariant rather than narrating obvious syntax.

**JSDoc/TSDoc:**
- Sparse. Use short comments for public contract fields, such as `CompletedRecordUpload.localVersion`, rather than documenting every helper.

## Function Design

**Size:**
- Small pure helpers are preferred for normalization/formulas/serialization. Existing route/page files contain orchestration-heavy functions and should be split when adding substantial behavior.

**Parameters:**
- Use object parameters for domain inputs with multiple dimensions (`ContextInput`, `CommandPayload`, calculation input objects).
- Use explicit narrow unions for lifecycle, status, operations, and field types.

**Return Values:**
- Async persistence/API functions return typed promises and use `null` for unavailable/blank values where the form contract requires it.
- Domain functions return stable outcome/status objects instead of relying on thrown errors for expected conflict/collision states.

## Module Design

**Exports:**
- Named exports dominate utility/domain modules; `worker/index.ts` additionally has the default Worker handler and re-exports `BackupWorkflow`.
- Keep client-only browser APIs out of `shared/`, because `shared/` is compiled into Worker and tests too.

**Barrel Files:**
- No broad barrel pattern. `src/forms.ts` is a thin re-export of `shared/forms.ts`; otherwise import the defining module directly.

---

*Convention analysis: 2026-09-03*
