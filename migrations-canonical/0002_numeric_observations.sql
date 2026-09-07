-- Current published numeric readings for the canonical local-first records.
-- A canonical record has only one current revision, so observations are keyed
-- by aggregate and field rather than retaining superseded revisions here.
CREATE TABLE numeric_observations (
  aggregate_id TEXT NOT NULL,
  form_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  plant_date TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  numeric_value REAL NOT NULL,
  is_published INTEGER NOT NULL CHECK(is_published IN (0,1)),
  PRIMARY KEY(aggregate_id, field_key),
  FOREIGN KEY(aggregate_id) REFERENCES canonical_records(canonical_id) ON DELETE CASCADE
);

CREATE INDEX idx_numeric_observations_history
  ON numeric_observations(form_key, is_published, field_key, measured_at DESC);
