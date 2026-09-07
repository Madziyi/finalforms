PRAGMA foreign_keys = ON;

CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO app_metadata(key,value) VALUES ('schema_version','3'),('protocol_version','3'),('fresh_database','true');

CREATE TABLE operators (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO operators(id,name) VALUES
 ('operator-marj','Marj'),('operator-justin','Justin'),('operator-kyle','Kyle'),('operator-mikolaj','Mikolaj'),
 ('operator-richard','Richard'),('operator-jordon','Jordon'),('operator-other','Other');

CREATE TABLE canonical_records (
  canonical_id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL,
  form_version INTEGER NOT NULL,
  context_key TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  plant_date TEXT NOT NULL,
  shift TEXT,
  time_slot TEXT,
  boiler_number INTEGER,
  values_json TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation > 0),
  revision INTEGER NOT NULL CHECK(revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  UNIQUE(form_key,context_key)
);
CREATE INDEX idx_canonical_records_date ON canonical_records(form_key,plant_date,updated_at);
CREATE INDEX idx_canonical_records_revision ON canonical_records(canonical_id,generation,revision);

CREATE TABLE canonical_record_tombstones (
  canonical_id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL,
  context_key TEXT,
  moved_to_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  tombstoned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT NOT NULL DEFAULT 'moved'
);
CREATE INDEX idx_canonical_tombstones_destination ON canonical_record_tombstones(form_key,moved_to_id);

CREATE TABLE canonical_sync_receipts (
  sync_id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  request_hash TEXT NOT NULL,
  outcome TEXT NOT NULL,
  response_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_canonical_sync_receipts_record ON canonical_sync_receipts(canonical_id,generation,received_at);

CREATE TABLE attention_items (
  attention_id TEXT PRIMARY KEY, canonical_id TEXT, plant_date TEXT,
  category TEXT NOT NULL, code TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('info','warning','error')),
  message TEXT NOT NULL, details_json TEXT, resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_attention_open ON attention_items(resolved_at,severity,created_at);

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
  UNIQUE(form_key,plant_date)
);
CREATE INDEX idx_projection_date ON derived_projections(plant_date,form_key,status);
CREATE TABLE derived_numeric_observations (
  projection_id TEXT NOT NULL, projection_revision INTEGER NOT NULL,
  form_key TEXT NOT NULL CHECK(form_key IN ('daily-consumption-totals','makeup')),
  field_key TEXT NOT NULL, plant_date TEXT NOT NULL, measured_at TEXT NOT NULL,
  numeric_value REAL NOT NULL, is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  PRIMARY KEY(projection_id,projection_revision,field_key), FOREIGN KEY(projection_id) REFERENCES derived_projections(projection_id) ON DELETE CASCADE
);
CREATE INDEX idx_derived_numeric_trend ON derived_numeric_observations(form_key,field_key,plant_date,measured_at,is_current);
CREATE TABLE projection_adjustments (
  adjustment_id TEXT PRIMARY KEY, projection_id TEXT NOT NULL, projection_revision INTEGER NOT NULL,
  field_key TEXT NOT NULL, value_json TEXT NOT NULL, operator_id TEXT, operator_name TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'keep' CHECK(decision IN ('keep','recalculate')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, superseded_at TEXT,
  FOREIGN KEY(projection_id) REFERENCES derived_projections(projection_id) ON DELETE CASCADE
);

CREATE TABLE backup_dirty_dates (plant_date TEXT PRIMARY KEY, reason TEXT NOT NULL, first_dirty_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_dirty_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE backup_generations (
  generation_id TEXT PRIMARY KEY, plant_date TEXT NOT NULL, generation_number INTEGER NOT NULL, snapshot_boundary TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('not_ready','ready','delivering','reconciling','verified','failed')),
  canonical_json TEXT, payload_hash TEXT, delivery_id TEXT, workflow_instance_id TEXT, attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ready_at TEXT, verified_at TEXT,
  UNIQUE(plant_date,generation_number), UNIQUE(delivery_id)
);
CREATE INDEX idx_backup_generation_date ON backup_generations(plant_date,generation_number DESC);
CREATE TABLE backup_generation_items (generation_id TEXT NOT NULL, item_type TEXT NOT NULL CHECK(item_type IN ('record','projection')), item_id TEXT NOT NULL, form_key TEXT NOT NULL, revision_number INTEGER NOT NULL, PRIMARY KEY(generation_id,item_type,item_id), FOREIGN KEY(generation_id) REFERENCES backup_generations(generation_id) ON DELETE CASCADE);
CREATE TABLE backup_deliveries (
  delivery_id TEXT PRIMARY KEY, generation_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','delivering','reconciling','verified','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0, request_hash TEXT NOT NULL, response_json TEXT, json_file_name TEXT, xlsx_file_name TEXT,
  last_error TEXT, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(generation_id) REFERENCES backup_generations(generation_id) ON DELETE CASCADE
);
