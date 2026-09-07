# ECC Canonical v3 Adversarial Qualification Runbook

Run against disposable/local data first, then a production-shaped disposable Cloudflare target. Record screenshots/logs/results. Do not use real operator readings for destructive scenarios.

## A. Local durability

1. Enter values, wait for **Saved on this tablet**, refresh. Exact values/context/operator must return.
2. Repeat, close browser completely, reopen PWA. Exact checkpoint must return.
3. Complete a draft while offline, restart device/browser, return online. The same immutable command must sync; no duplicate D1 revision may appear.
4. Simulate IndexedDB transaction failure/quota failure. UI must not show Saved; entered in-memory values must stay visible with a recovery warning.
5. Open same record in two tabs. Make an edit in one and a conflicting same-version edit in the other. Older/divergent checkpoint must not overwrite newer durable state.
6. With two tabs open, verify only one replay loop owns the Web Lock. Close it while commands are waiting; another tab must continue. Duplicate network delivery, if forced, must still have one server effect.

## B. Command/idempotency protocol

1. Send the exact same command ID/payload twice. Second result must be Duplicate with same accepted revision.
2. Reuse the same command ID with one changed byte/value. Must be rejected as `command_id_reused`.
3. Send a stale base revision. Must return Conflict and preserve both candidates.
4. Resolve conflict choosing whole server record; verify new canonical revision records resolution provenance.
5. Repeat choosing whole local record.
6. Force response loss after server commit, then retry. It must settle as Duplicate, not create another revision.
7. Queue two commands for one aggregate plus commands for another. Commands must remain ordered per aggregate while unrelated aggregate continues syncing.
8. Send invalid boiler 1/5, invalid time slot, unknown field, invalid select option and NaN/non-finite-equivalent input. Server must reject without canonical change.

## C. Context ownership / explicit replacement

1. Two brand-new canonical records claim the same date/time (Form 3/4/9) from separate offline sessions. One may win; the other must become Collision/Attention.
2. Choose **Keep existing destination**. No replacement occurs.
3. Repeat collision and choose **Replace destination** after confirmation. Destination receives a superseded immutable revision; source takes context; both histories remain queryable.
4. Change the destination between collision and Replace. Replace must conflict rather than overwrite newer work.
5. Move a completed record to free context. Old plant date becomes backup-dirty and new date becomes backup-dirty.

## D. Published amendment semantics

1. Complete a record and note published revision N.
2. Start amendment, save a draft. Data Viewing and backup selection must still use published N.
3. Complete amendment. New revision becomes published and old revision remains immutable history.
4. Crash/reload during amendment. Draft must recover while prior published revision remains intact.

## E. Derived forms

### Form 2
1. Enter P-ALK=500 and M-ALK=600. UI should show OH-ALK=400.
2. Tamper request OH-ALK to another number. D1 accepted revision must still store 400.
3. Blank either input. OH-ALK must be null, not zero.

### Form 5 / 6 exact-date behavior
1. Complete Form 8 for D-1 and D. Confirm Form 5/6 D become Current with source revision IDs for those exact dates.
2. Remove/use disposable setup without D-1. D must be Waiting; no older date may substitute.
3. Verify Form 6 fields are exactly current C.W. Makeup, D minus D-1 C.W. Makeup, current Tower Makeup.
4. Verify negative cumulative deltas produce null plus warning, never a silent negative usage.
5. Verify Form 5 ratios remain null when denominator is missing/zero.
6. Add a Form 5 manual adjustment. Base value and adjustment provenance must remain distinguishable.
7. Amend Form 8 D-1 or D. Form 5 with adjustment must become Attention. Verify **Keep manual** keeps adjustment and **Recalculate** deactivates it.
8. Amend Form 8 D. Verify derived successor closure includes D and D+1.
9. Verify Form 5/6 numeric trends use latest projection revisions and blank is distinct from zero.

## F. PWA upgrade / compatibility

1. Open an unsaved form, deploy a PWA update, accept reload. Open form must checkpoint before activation/reload.
2. Simulate Worker protocol mismatch. Writes must be blocked and local checkpoint/outbox retained.
3. Restore compatibility. Pending valid work must continue without manual re-entry.
4. Verify service worker update does not clear IndexedDB.

## G. Backup generation and delivery faults

1. Create completed data for a plant date. Build generation twice without data changes. Same frozen unverified generation must be reused rather than new bytes generated.
2. Verify backup contains completed published records only. Draft amendment must not appear.
3. With Form 8 present and Form 5/6 Waiting/Stale/Attention/Failed, backup must be Not Ready.
4. Once projections become Current, new ready generation must freeze exact canonical JSON and SHA-256 hash.
5. Repeat delivery request. SharePoint must contain one immutable JSON/XLSX/receipt set for that generation.
6. Kill/timeout Worker-to-Power-Automate response after SharePoint writes receipt. D1 must show Reconciling, then a later Workflow retry must find the receipt and mark the exact generation Verified.
7. Force Power Automate 429/5xx. Workflow retries with bounded backoff; form saving remains unaffected.
8. Force a permanent 4xx contract/auth error. Generation becomes Failed and remains visible for manual correction/retry.
9. Amend historical data after Verified generation. A new generation number must be created; earlier JSON/XLSX/receipt remains unchanged.
10. Verify Power Automate response with wrong generation ID/hash/filename does not set Verified.

## H. Form 9 AI

1. Capture a screen while online. Verify extracted values remain suggestions until operator reviews them.
2. Force uncertain/missing fields. They must be null/Check, never inferred.
3. Disable Gemini/network. Manual form entry must remain possible.
4. Inspect IndexedDB/D1/SharePoint payloads: image bytes must never be stored.

## I. Final release evidence

Required before cutover:

- TypeScript build/test logs
- clean local D1 smoke result
- clean remote D1 verification result
- Android offline/restart evidence
- duplicate/context/conflict/replace evidence
- derived exact-date and source-change evidence
- backup duplicate/timeout/reconciliation evidence
- final 9-sheet SharePoint workbook sample
- documented rollback/forward-repair procedure and production hold-point approval
