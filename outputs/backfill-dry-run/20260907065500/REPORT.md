# Legacy canonical backfill dry-run

- Mode: **dry-run** (no remote writes, migrations, deploys, or secrets changes)
- Tool version: `1.0.0`
- Source database/table: `ecc-operator-v1-production.latest_completed_records`
- Target database/table: `ecc-operator-v1-canonical.canonical_records`
- Source query timestamp: `2026-09-07T06:54:56.797Z`
- Target query timestamp: `2026-09-07T06:54:59.055Z`
- Source query SHA-256: `5d0bdba695062529b18a89b7315d4f6a102c9c42cd59c71cf1dbb29a164e5677`
- Manifest SHA-256: `d63f53389b269a2a43d2b03f3855b8158c08ff0115d03aae209c5b2b36de4d76`
- Artifact directory: `C:\Users\stanm\ecc_operator_pwa_v1_rebuild\outputs\backfill-dry-run\20260907065500`

## Counts

| Metric | Count |
| --- | ---: |
| Source rows fetched | 64 |
| Eligible current completed rows | 64 |
| Excluded rows | 0 |
| Target canonical rows observed | 0 |
| Candidate rows written | 64 |
| Ready | 14 |
| Ready with warnings | 50 |
| Collisions | 0 |
| Blocked | 0 |
| Target/context collisions | 0 |
| Non-blocking anomalies | 97 |
| Blocking anomalies | 0 |

## Per-form counts

| Form | Source rows | Candidate rows |
| --- | ---: | ---: |
| boiler-water-control-tests | 6 | 6 |
| boiler-water-pretreatment-condensate-tests | 9 | 9 |
| ecc-cooling-tower-water-control-tests | 6 | 6 |
| gas-turbine-log-sheet | 19 | 19 |
| integrator-readings | 5 | 5 |
| yst-yk-chiller | 19 | 19 |

## Transformation decisions

- Only rows from the current completed-record table were considered; drafts, revisions, receipts, projections, adjustments, and backups were not queried or imported.
- Forms 1, 2, 3, 7, 8, and 9 are eligible. Forms 5 and 6 and any other source form are excluded; old derived projections are never imported.
- Form 1 maps legacy `molybdenum` to `ptsa` and converts Pump Sp/St to the current paired numeric shape when parseable.
- Form 2 derives burette readings from legacy P/M values, recomputes P/M/OH using current rules, and omits legacy OH and totals.
- Form 8 omits legacy OAT high/low because current display values derive from Form 9.
- Forms 3, 4, and 9 retain source time-slot strings exactly. Historical two-hour slots are recorded as anomalies and must bypass current interactive four-hour validation during apply.
- Unknown, retired, invalid, or calculated/display-only fields are omitted and listed in `anomalies.csv`.
- Candidate IDs and contexts are deterministic. Existing target context/ID ownership is reported as a collision; no row is overwritten.

## Warnings and anomalies

See [anomalies.csv](./anomalies.csv). Values are not repeated there; only source identity, type, field, and reason are included.

## Limitations

This artifact proposes candidates only. It does not prove that a later apply can accept legacy contexts through the current interactive validation path, and it does not regenerate Forms 5/6. A later apply phase must explicitly handle legacy slot contexts and then recompute derived projections from canonical Form 8 input data.
