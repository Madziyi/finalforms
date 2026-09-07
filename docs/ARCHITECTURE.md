# ECC v2 Reliability Architecture

## 1. Sources of truth

### Tablet
IndexedDB is authoritative for the tablet's local drafts and completed forms. The v2 `entries` store autosaves every field change. Only completed snapshots enter `completedSync`, whose primary key is the local entry ID, so repeated completions coalesce to the newest snapshot.

The v1 aggregates/commands/revisions tables and `/api/commands` handler are retained as a migration compatibility path. They are not used by the active entry or replay UI.

A local entry is resumable by form and normalized context. A completed record is editable through a temporary local edit; the edit is autosaved while open and discarded on cancel/navigation. The selected operator at Complete time is stored on the completed snapshot.

### D1
D1 keeps one latest completed row per form/context in `latest_completed_records`. An upload upserts that row only when its context-wide freshness tuple `(clientUpdatedAt, localVersion, aggregateId)` is newer. Existing immutable v1 revisions remain for migration and history compatibility only.

### SharePoint
SharePoint is an archive/delivery destination, not part of form submission. Immutable canonical JSON is the authoritative backup artifact; Excel is its readable representation.

## 2. Identity and context ownership

An `aggregate_id` and `form_key` are permanent for the life of a record.

The Worker alone normalizes logical context. Examples:

```text
Daily:       2026-09-03
Shift:       2026-09-03|shift=Day
Form 2:      2026-09-03|shift=Day|boiler=3
Timed:       2026-09-03|time=08:00
```

`context_claims` has a unique `(form_key, context_key)` key. An offline device may create a UUID, but D1 grants the canonical ownership claim. A collision becomes an explicit Attention state; it never silently merges.

Boiler context is limited to 2, 3 or 4.

## 3. Local durability

Typing changes only the local working aggregate. A checkpoint is one IndexedDB transaction. The UI says **Saved on this tablet** only after that transaction commits.

Semantic operations create immutable outbox commands:

- Save draft
- Complete
- Amend draft
- Complete amendment
- Move
- Replace
- Resolve conflict

Multiple tabs use `BroadcastChannel` for coherence and `navigator.locks` where available to elect one replay leader. If simultaneous network delivery still occurs, server-side idempotency prevents duplicate effects.

## 4. Command protocol and completed uploads

Every command includes:

- immutable `commandId`
- permanent `aggregateId`
- form identity/version
- `baseRevision`
- operator identity/name
- normalized-context inputs
- lifecycle intent
- frozen value snapshot
- client-observed timestamp

The Worker calculates a canonical fingerprint. `command_receipts.command_id` is unique.

If the same command arrives again with the same fingerprint, the saved outcome is returned. Reusing a command ID with different bytes is rejected.

The active v2 completed-upload path validates form keys and field values against the shared form manifest. Form 2 OH-ALK is recomputed by the Worker. Derived forms cannot be uploaded. A stale upload is ignored when its freshness tuple is not newer than the row already owning that form/context, even when it came from a different local entry.

The retained v1 command endpoint still commits, for compatibility, in one D1 transaction:

1. context claim changes,
2. immutable revision,
3. aggregate current/published pointers,
4. current numeric observations,
5. backup dirty dates / derived stale markers where applicable,
6. conflict-resolution cleanup, and
7. the exact command receipt.

The database also has triggers protecting sequential revision numbers, immutable form identity, revision/form consistency and valid aggregate revision pointers.

## 5. Published vs working revision

A completed record can be amended, but its previous completed revision remains `published_revision` until the new amendment is explicitly completed.

Active data viewing and backups use `latest_completed_records`. The legacy published revision remains available to history compatibility routes.

A Move explicitly changes context. If the destination is already owned, the Worker returns a collision. Replace requires confirmation and preserves the destination as a `superseded` immutable revision before transferring the context claim.

## 6. Derived forms

### Form 2

```text
OH-ALK = (P-ALK × 2) - M-ALK
```

The UI computes it for immediate feedback. The submitted OH-ALK value is ignored and the Worker recomputes the authoritative accepted value.

### Forms 5 and 6
They remain **canonical server projections**, never ordinary tablet submissions. The tablet may calculate an ephemeral local-first presentation from durable source records and use the canonical projection as fallback.

An accepted published Form 8 revision atomically marks the affected dates stale and marks their backups dirty. Derivation then runs independently. If derivation fails, Form 8 is still safely accepted and Attention records the projection problem.

A Form 8 date affects:

- the same date, and
- the next calendar date, because deltas depend on the exact previous date.

No “most recent available date” substitution is allowed.

Form 5 and Form 6 have no active manual adjustment or attention workflow. Historical adjustment rows, if present from v1, are deactivated and never applied to a recalculated projection.

Form 6 has exactly:

- current-date C.W. Makeup
- current minus previous-calendar-date C.W. Makeup
- current-date Tower Makeup

Derived numeric observations are separately indexed so Form 5/6 retain the same history/trend experience without pretending they are ordinary submitted revisions.

## 7. Backup generations

A backup generation is immutable once its canonical JSON/hash are frozen.

A D1 transactional snapshot reads completed rows from `latest_completed_records`, available Form 5/Form 6 projections, and a snapshot boundary. Waiting projections are included and do not make the generation Not Ready.

The frozen generation has:

- `generation_id`
- incrementing generation number for the plant date
- snapshot boundary
- exact canonical JSON string
- SHA-256 payload hash
- delivery ID
- exact included revision/projection IDs

Retries reuse the same frozen bytes and IDs.

## 8. Cloudflare Workflow / Power Automate

`BackupWorkflow` is the durable orchestrator. A manual run returns HTTP `202` quickly. The System page reads D1/Workflow state rather than waiting for Power Automate synchronously.

Workflow steps refresh derivations, freeze a generation and deliver it with bounded retries. Network ambiguity becomes `reconciling`, not a false failure.

Power Automate is intentionally a dumb SharePoint adapter. It checks the shared header, writes immutable JSON/XLSX, writes a receipt last, and echoes identity metadata. A retry first searches for the receipt and reconciles an already-completed write.

Only an exact response containing the expected generation ID, hash, JSON filename, XLSX filename and receipt filename changes D1 to `verified`.

## 9. Upgrade boundary

The Worker publishes protocol/schema metadata. An incompatible PWA is blocked from writes. Before a service-worker reload, the open form is asked to complete a durable local checkpoint. Unresolved IndexedDB work is never automatically pruned during an upgrade.
