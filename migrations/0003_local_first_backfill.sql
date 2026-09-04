-- Phase 3 local-first freshness and legacy completed-record backfill.
-- Migrations 0001/0002 are intentionally immutable.
ALTER TABLE latest_completed_records ADD COLUMN client_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE latest_completed_records ADD COLUMN freshness_tiebreaker TEXT NOT NULL DEFAULT '';

UPDATE latest_completed_records
SET client_updated_at = CASE
  WHEN updated_at GLOB '????-??-?? ??:??:??' THEN replace(updated_at, ' ', 'T') || '.000Z'
  WHEN created_at GLOB '????-??-?? ??:??:??' THEN replace(created_at, ' ', 'T') || '.000Z'
  ELSE COALESCE(updated_at, created_at, '1970-01-01T00:00:00.000Z')
END,
freshness_tiebreaker = aggregate_id
WHERE client_updated_at = '1970-01-01T00:00:00.000Z' OR freshness_tiebreaker = '';

CREATE INDEX IF NOT EXISTS idx_latest_completed_freshness
  ON latest_completed_records(form_key, context_key, client_updated_at, local_revision, freshness_tiebreaker);

-- Only the currently published legacy revision for each context is eligible.
-- Existing local-first rows win conflicts so a migration never overwrites a
-- completed upload already accepted by the v2 table.
WITH legacy_latest AS (
  SELECT p.*, ROW_NUMBER() OVER (
    PARTITION BY p.form_key, p.context_key
    ORDER BY p.revision DESC, p.revision_id DESC
  ) AS row_number
  FROM published_records p
)
INSERT INTO latest_completed_records(
  aggregate_id, form_key, form_version, context_key, operator_id, operator_name,
  plant_date, shift, time_slot, boiler_number, values_json, local_revision,
  created_at, updated_at, client_updated_at, freshness_tiebreaker
)
SELECT
  aggregate_id, form_key, form_version, context_key, operator_id, operator_name,
  plant_date, shift, time_slot, boiler_number, values_json, revision,
  created_at, created_at,
  CASE
    WHEN created_at GLOB '????-??-?? ??:??:??' THEN replace(created_at, ' ', 'T') || '.000Z'
    ELSE created_at
  END,
  aggregate_id
FROM legacy_latest
WHERE row_number = 1
  AND NOT EXISTS (
    SELECT 1 FROM latest_completed_records l
    WHERE l.form_key = legacy_latest.form_key
      AND l.context_key = legacy_latest.context_key
  );

INSERT INTO app_metadata(key, value) VALUES ('schema_version', '2'), ('protocol_version', '2')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;
