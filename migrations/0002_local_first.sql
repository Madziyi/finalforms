-- Local-first v2 storage. The v1 aggregates/revisions/receipts remain intact
-- so an already-applied baseline can be migrated without rewriting history.
CREATE TABLE IF NOT EXISTS latest_completed_records (
  aggregate_id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL,
  form_version INTEGER NOT NULL,
  context_key TEXT NOT NULL,
  operator_id TEXT,
  operator_name TEXT NOT NULL,
  plant_date TEXT NOT NULL,
  shift TEXT,
  time_slot TEXT,
  boiler_number INTEGER,
  values_json TEXT NOT NULL,
  local_revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(form_key, context_key)
);
CREATE INDEX IF NOT EXISTS idx_latest_completed_date ON latest_completed_records(form_key, plant_date, updated_at);
INSERT INTO app_metadata(key,value) VALUES ('schema_version','2'),('protocol_version','2')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
