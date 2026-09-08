# Historical projection refresh

`projection-refresh` is a guarded forward-repair tool for the server-owned Form 5/Form 6 projections. It reads canonical Form 8/Form 9 rows, calculates the shared Worker formula, and writes only `derived_projections`, `derived_numeric_observations`, and `backup_dirty_dates`.

It never imports or reseeds canonical data, applies migrations, or writes canonical records, sync receipts, operators, backup generations, or backup deliveries. It requires an explicit target/config pair and a full release SHA.

## Dry-run

Run from the release checkout and write evidence outside the repository:

```powershell
npx vite-node scripts/projection-refresh.ts --target staging --config wrangler.staging.jsonc --dry-run --release-sha <FULL_SHA> --output C:\path\to\evidence\projection-refresh-dry-run
```

The generated `plan.json` records the source hash, immutable-table hash, affected dates, actual source dates/revisions, previous projection values, new values, and revision changes.

## Apply

Apply only the exact, reviewed plan after release-owner approval:

```powershell
npx vite-node scripts/projection-refresh.ts --target staging --config wrangler.staging.jsonc --apply C:\path\to\evidence\projection-refresh-dry-run\plan.json --release-sha <FULL_SHA> --approval "Approved projection refresh for <FULL_SHA> against the staging D1 target." --output C:\path\to\evidence\projection-refresh-apply
```

Use `--target canonical --config wrangler.canonical.jsonc` only during the approved production maintenance window. Apply refuses a stale plan if canonical source rows, immutable-table contents, or projection state changed since dry-run. A completed plan can be safely rerun: the tool verifies the desired projection state and performs no second write.
