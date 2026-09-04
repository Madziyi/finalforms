PRAGMA foreign_keys = ON;

CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_metadata(key, value) VALUES
  ('schema_version', '1'),
  ('protocol_version', '1'),
  ('fresh_database', 'true');

CREATE TABLE operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO operators(id, name) VALUES
  ('operator-marj','Marj'),
  ('operator-justin','Justin'),
  ('operator-kyle','Kyle'),
  ('operator-mikolaj','Mikolaj'),
  ('operator-richard','Richard'),
  ('operator-jordon','Jordon'),
  ('operator-other','Other');

CREATE TABLE aggregates (
  aggregate_id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 0,
  published_revision INTEGER,
  lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','completed','superseded')),
  context_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_aggregates_form ON aggregates(form_key);
CREATE INDEX idx_aggregates_context ON aggregates(context_key);

CREATE TABLE context_claims (
  form_key TEXT NOT NULL,
  context_key TEXT NOT NULL,
  aggregate_id TEXT NOT NULL UNIQUE,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(form_key, context_key),
  FOREIGN KEY(aggregate_id) REFERENCES aggregates(aggregate_id) ON DELETE CASCADE
);

CREATE TABLE revisions (
  revision_id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  form_key TEXT NOT NULL,
  form_version INTEGER NOT NULL,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('draft','completed','superseded')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0,1)),
  context_key TEXT NOT NULL,
  operator_id TEXT,
  operator_name TEXT NOT NULL,
  plant_date TEXT NOT NULL,
  shift TEXT,
  time_slot TEXT,
  boiler_number INTEGER,
  values_json TEXT NOT NULL,
  provenance_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(aggregate_id, revision),
  UNIQUE(command_id),
  FOREIGN KEY(aggregate_id) REFERENCES aggregates(aggregate_id) ON DELETE CASCADE
);
CREATE INDEX idx_revisions_date_form ON revisions(plant_date, form_key);
CREATE INDEX idx_revisions_published ON revisions(aggregate_id, is_published);

CREATE TABLE command_receipts (
  command_id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_json TEXT NOT NULL,
  outcome TEXT NOT NULL,
  applied_revision INTEGER,
  response_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_command_receipts_aggregate ON command_receipts(aggregate_id, received_at);

CREATE TABLE numeric_observations (
  revision_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  form_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  plant_date TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  numeric_value REAL NOT NULL,
  is_published INTEGER NOT NULL CHECK(is_published IN (0,1)),
  PRIMARY KEY(revision_id, field_key),
  FOREIGN KEY(revision_id) REFERENCES revisions(revision_id) ON DELETE CASCADE,
  FOREIGN KEY(aggregate_id) REFERENCES aggregates(aggregate_id) ON DELETE CASCADE
);
CREATE INDEX idx_numeric_trend ON numeric_observations(form_key, field_key, plant_date, measured_at);

CREATE TABLE attention_items (
  attention_id TEXT PRIMARY KEY,
  aggregate_id TEXT,
  plant_date TEXT,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','error')),
  message TEXT NOT NULL,
  details_json TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(aggregate_id) REFERENCES aggregates(aggregate_id) ON DELETE CASCADE
);
CREATE INDEX idx_attention_open ON attention_items(resolved_at, severity, created_at);

CREATE TABLE derived_projections (
  projection_id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL CHECK(form_key IN ('daily-consumption-totals','makeup')),
  plant_date TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('current','waiting','stale','attention','failed')),
  formula_version INTEGER NOT NULL,
  source_revisions_json TEXT NOT NULL DEFAULT '[]',
  base_values_json TEXT NOT NULL DEFAULT '{}',
  effective_values_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(form_key, plant_date)
);
CREATE INDEX idx_projection_date ON derived_projections(plant_date, form_key, status);

CREATE TABLE derived_numeric_observations (
  projection_id TEXT NOT NULL,
  projection_revision INTEGER NOT NULL,
  form_key TEXT NOT NULL CHECK(form_key IN ('daily-consumption-totals','makeup')),
  field_key TEXT NOT NULL,
  plant_date TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  numeric_value REAL NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  PRIMARY KEY(projection_id, projection_revision, field_key),
  FOREIGN KEY(projection_id) REFERENCES derived_projections(projection_id) ON DELETE CASCADE
);
CREATE INDEX idx_derived_numeric_trend ON derived_numeric_observations(form_key, field_key, plant_date, measured_at, is_current);

CREATE TABLE projection_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  projection_id TEXT NOT NULL,
  projection_revision INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  operator_id TEXT,
  operator_name TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'keep' CHECK(decision IN ('keep','recalculate')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  FOREIGN KEY(projection_id) REFERENCES derived_projections(projection_id) ON DELETE CASCADE
);
CREATE INDEX idx_projection_adjustments_active ON projection_adjustments(projection_id, active);

CREATE TABLE backup_dirty_dates (
  plant_date TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  first_dirty_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_dirty_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_generations (
  generation_id TEXT PRIMARY KEY,
  plant_date TEXT NOT NULL,
  generation_number INTEGER NOT NULL,
  snapshot_boundary TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('not_ready','ready','delivering','reconciling','verified','failed')),
  canonical_json TEXT,
  payload_hash TEXT,
  delivery_id TEXT,
  workflow_instance_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_at TEXT,
  verified_at TEXT,
  UNIQUE(plant_date, generation_number),
  UNIQUE(delivery_id)
);
CREATE INDEX idx_backup_generation_date ON backup_generations(plant_date, generation_number DESC);
CREATE INDEX idx_backup_generation_status ON backup_generations(status, created_at);

CREATE TABLE backup_generation_items (
  generation_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('revision','projection')),
  item_id TEXT NOT NULL,
  form_key TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  PRIMARY KEY(generation_id, item_type, item_id),
  FOREIGN KEY(generation_id) REFERENCES backup_generations(generation_id) ON DELETE CASCADE
);

CREATE TABLE backup_deliveries (
  delivery_id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','delivering','reconciling','verified','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  request_hash TEXT NOT NULL,
  response_json TEXT,
  json_file_name TEXT,
  xlsx_file_name TEXT,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(generation_id) REFERENCES backup_generations(generation_id) ON DELETE CASCADE
);

CREATE VIEW published_records AS
SELECT r.*
FROM revisions r
JOIN aggregates a ON a.aggregate_id = r.aggregate_id
WHERE a.published_revision = r.revision
  AND a.lifecycle <> 'superseded';

CREATE TRIGGER trg_revision_sequential
BEFORE INSERT ON revisions
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.revision <> COALESCE((SELECT current_revision FROM aggregates WHERE aggregate_id = NEW.aggregate_id), -1) + 1
    THEN RAISE(ABORT, 'stale_revision')
  END;
END;

CREATE TRIGGER trg_aggregate_form_immutable
BEFORE UPDATE OF form_key ON aggregates
FOR EACH ROW
WHEN NEW.form_key <> OLD.form_key
BEGIN
  SELECT RAISE(ABORT, 'aggregate_form_immutable');
END;

CREATE TRIGGER trg_revision_form_matches_aggregate
BEFORE INSERT ON revisions
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.form_key <> (SELECT form_key FROM aggregates WHERE aggregate_id = NEW.aggregate_id)
    THEN RAISE(ABORT, 'revision_form_mismatch')
  END;
END;

CREATE TRIGGER trg_context_claim_form_matches_aggregate
BEFORE INSERT ON context_claims
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.form_key <> (SELECT form_key FROM aggregates WHERE aggregate_id = NEW.aggregate_id)
    THEN RAISE(ABORT, 'context_claim_form_mismatch')
  END;
END;

CREATE TRIGGER trg_current_revision_must_exist
BEFORE UPDATE OF current_revision ON aggregates
FOR EACH ROW
WHEN NEW.current_revision > 0
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM revisions WHERE aggregate_id=NEW.aggregate_id AND revision=NEW.current_revision)
    THEN RAISE(ABORT, 'current_revision_missing')
  END;
END;

CREATE TRIGGER trg_published_revision_must_exist
BEFORE UPDATE OF published_revision ON aggregates
FOR EACH ROW
WHEN NEW.published_revision IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM revisions WHERE aggregate_id=NEW.aggregate_id AND revision=NEW.published_revision AND is_published=1)
    THEN RAISE(ABORT, 'published_revision_missing')
  END;
END;

