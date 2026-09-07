import { canonicalRecordId, isCanonicalRecordId } from "../../shared/canonical";
import { allFields, getForm } from "../../shared/forms";
import { nextCalendarDate, normalizeContext, PROTOCOL_VERSION, shiftMeasuredAt } from "../../shared/safetyContract";
import type { CanonicalRecord, CompletedRecordUpload, SyncReceipt } from "../../shared/types";
import { DomainError, validateFormValues } from "./validation";
import { sha256Hex, stableStringify } from "./hash";

type CanonicalRow = {
  canonical_id: string; form_key: string; form_version: number; context_key: string;
  operator_id: string | null; operator_name: string; plant_date: string; shift: string | null;
  time_slot: string | null; boiler_number: number | null; values_json: string;
  generation: number; revision: number; created_at: string; updated_at: string; client_updated_at: string;
};
type TombstoneRow = { canonical_id: string; form_key: string; context_key: string | null; moved_to_id: string; generation: number; revision: number; tombstoned_at: string };

function canonical(row: CanonicalRow): CanonicalRecord {
  return {
    aggregateId: String(row.canonical_id), formKey: String(row.form_key), contextKey: String(row.context_key),
    revision: Number(row.revision), generation: Number(row.generation), publishedRevision: Number(row.revision), lifecycle: "completed",
    operatorId: row.operator_id ?? null, operator: String(row.operator_name), date: String(row.plant_date), shift: row.shift ?? null,
    timeSlot: row.time_slot ?? null, boilerNumber: row.boiler_number == null ? null : Number(row.boiler_number), values: JSON.parse(row.values_json),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), provenance: { source: "canonical-sync", generation: Number(row.generation), revision: Number(row.revision) },
  };
}
function tombstoneRecord(row: TombstoneRow): CanonicalRecord {
  return {
    aggregateId: row.canonical_id, formKey: row.form_key, contextKey: row.context_key, revision: Number(row.revision), generation: Number(row.generation),
    publishedRevision: null, lifecycle: "superseded", operatorId: null, operator: "System", date: row.context_key?.slice(0, 10) ?? "", shift: null,
    timeSlot: null, boilerNumber: null, values: {}, createdAt: row.tombstoned_at, updatedAt: row.tombstoned_at,
    provenance: { source: "canonical-sync", tombstone: true, movedToId: row.moved_to_id },
  };
}
function generationOf(payload: Partial<CompletedRecordUpload>) { return payload.generation ?? payload.localVersion; }

function measuredAt(record: CanonicalRecord) {
  if (record.timeSlot) return `${record.date}T${record.timeSlot}:00`;
  return shiftMeasuredAt(record.date, record.shift as "Day" | "Night" | "Extra" | null);
}

function deleteNumericObservationStatements(db: D1Database, obsoleteAggregateIds: Iterable<string>) {
  const statements: D1PreparedStatement[] = [];
  const deleted = new Set<string>();
  for (const aggregateId of obsoleteAggregateIds) {
    if (deleted.has(aggregateId)) continue;
    deleted.add(aggregateId);
    statements.push(db.prepare(`DELETE FROM numeric_observations WHERE aggregate_id=?`).bind(aggregateId));
  }
  return statements;
}

function insertNumericObservationStatements(db: D1Database, record: CanonicalRecord) {
  const statements: D1PreparedStatement[] = [];
  const observedAt = measuredAt(record);
  const indexableFields = new Map(allFields(getForm(record.formKey)!).map((field) => [field.key, field]));
  for (const [fieldKey, value] of Object.entries(record.values)) {
    const field = indexableFields.get(fieldKey);
    if (field?.showHistory === false || (field?.trendable === false && field.type !== "paired-number")) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      statements.push(db.prepare(`INSERT INTO numeric_observations(aggregate_id,form_key,field_key,plant_date,measured_at,numeric_value,is_published) VALUES(?,?,?,?,?,?,1)`)
        .bind(record.aggregateId, record.formKey, fieldKey, record.date, observedAt, value));
      continue;
    }
    // Paired form inputs are indexed as two numeric components and joined back
    // into a single operator-facing value (for example, 75/45) by the client.
    if (typeof value === "object" && value !== null && "first" in value && "second" in value) {
      for (const [part, numericValue] of [["first", value.first], ["second", value.second]] as const) {
        if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) continue;
        statements.push(db.prepare(`INSERT INTO numeric_observations(aggregate_id,form_key,field_key,plant_date,measured_at,numeric_value,is_published) VALUES(?,?,?,?,?,?,1)`)
          .bind(record.aggregateId, record.formKey, `${fieldKey}:${part}`, record.date, observedAt, numericValue));
      }
    }
  }
  return statements;
}

export function validateCompletedUpload(input: unknown): CompletedRecordUpload {
  if (!input || typeof input !== "object") throw new DomainError("invalid_upload", "Completed upload must be an object.", 422);
  const payload = input as Partial<CompletedRecordUpload>;
  const record = payload.record as Partial<CanonicalRecord> | undefined;
  if (payload.protocolVersion !== PROTOCOL_VERSION || !record || record.lifecycle !== "completed") throw new DomainError("incompatible", `Canonical sync protocol ${PROTOCOL_VERSION} is required.`, 426);
  const form = getForm(String(record.formKey));
  if (!form || form.schedule === "derived") throw new DomainError("invalid_upload", "Only operator-completed forms may be uploaded.", 422);
  if (typeof record.aggregateId !== "string" || !isCanonicalRecordId(form.key, record.aggregateId)) throw new DomainError("invalid_identity", "aggregateId must be a globally unique form-prefixed canonical ID.", 422);
  if (typeof payload.syncId !== "string" || !payload.syncId.trim()) throw new DomainError("invalid_sync_id", "syncId is required.", 422);
  if (typeof record.operatorId !== "string" || !record.operatorId.trim() || typeof record.operator !== "string" || !record.operator.trim()) throw new DomainError("operator_required", "Select an operator before completing a record.", 422);
  if (typeof record.date !== "string") throw new DomainError("invalid_context", "A valid plant date is required.", 422);
  const generation = generationOf(payload);
  if (!Number.isInteger(generation) || Number(generation) < 1) throw new DomainError("invalid_generation", "generation must be a positive integer.", 422);
  if (payload.baseRevision !== null && payload.baseRevision !== undefined && (!Number.isInteger(payload.baseRevision) || Number(payload.baseRevision) < 0)) throw new DomainError("invalid_revision", "baseRevision must be a non-negative integer or null.", 422);
  if (typeof payload.clientUpdatedAt !== "string" || !Number.isFinite(Date.parse(payload.clientUpdatedAt))) throw new DomainError("invalid_timestamp", "clientUpdatedAt must be an ISO timestamp.", 422);
  if (payload.movedFromId != null && (typeof payload.movedFromId !== "string" || !isCanonicalRecordId(form.key, payload.movedFromId))) throw new DomainError("invalid_move", "movedFromId must use the same form-prefixed canonical ID namespace.", 422);
  let contextKey: string;
  try { contextKey = normalizeContext(form.key, { date: record.date, shift: record.shift as any, timeSlot: record.timeSlot, boilerNumber: record.boilerNumber as any }); }
  catch (error) { throw new DomainError("invalid_context", error instanceof Error ? error.message : String(error), 422); }
  if (record.contextKey != null && record.contextKey !== contextKey) throw new DomainError("invalid_context", "Record context does not match its date and context fields.", 422);
  if (record.aggregateId !== canonicalRecordId(form.key, { date: record.date, shift: record.shift as any, timeSlot: record.timeSlot, boilerNumber: record.boilerNumber as any })) throw new DomainError("invalid_identity", "aggregateId must exactly match the selected operational context.", 422);
  const normalized = validateFormValues(form.key, form.version, { date: record.date, shift: record.shift as any, timeSlot: record.timeSlot, boilerNumber: record.boilerNumber as any }, record.values);
  if (!Number.isInteger(payload.localVersion) || Number(payload.localVersion) < 1) throw new DomainError("invalid_revision", "localVersion must be a positive revision number.", 422);
  record.contextKey = normalized.contextKey; record.values = normalized.values; record.generation = Number(generation); record.revision = Number(payload.localVersion); record.publishedRevision = null;
  // Generation is the tablet freshness fence; localVersion is the snapshot
  // version within that generation. They must not be collapsed during parsing.
  return { protocolVersion: PROTOCOL_VERSION, syncId: payload.syncId, record: record as CanonicalRecord & { lifecycle: "completed" }, generation: Number(generation), localVersion: Number(payload.localVersion), baseRevision: payload.baseRevision == null ? null : Number(payload.baseRevision), clientUpdatedAt: new Date(payload.clientUpdatedAt).toISOString(), movedFromId: payload.movedFromId ?? null };
}

async function saveReceipt(db: D1Database, result: SyncReceipt, payload: CompletedRecordUpload, hash: string) {
  await db.prepare(`INSERT OR IGNORE INTO canonical_sync_receipts(sync_id,canonical_id,generation,request_hash,outcome,response_json) VALUES(?,?,?,?,?,?)`).bind(payload.syncId, result.aggregateId, Number(payload.generation ?? payload.localVersion), hash, result.outcome, JSON.stringify(result)).run();
}

// The HTTP response is intentionally a union (accepted/current/moved/collision).
// Keep this boundary loose while older test fixtures are replaced by canonical-sync tests.
export async function upsertCompletedRecord(db: D1Database, input: unknown): Promise<any> {
  const payload = validateCompletedUpload(input); const record = payload.record; const form = getForm(record.formKey)!; const hash = await sha256Hex(stableStringify(payload));
  const priorReceipt = await db.prepare(`SELECT request_hash,response_json FROM canonical_sync_receipts WHERE sync_id=?`).bind(payload.syncId!).first<{ request_hash: string; response_json: string }>();
  if (priorReceipt) { if (priorReceipt.request_hash !== hash) throw new DomainError("sync_id_reused", "This sync ID was already used for different contents.", 409); const prior = JSON.parse(priorReceipt.response_json) as SyncReceipt; return { ...prior, outcome: prior.outcome === "accepted" ? "duplicate" : prior.outcome }; }
  const oldTombstone = await db.prepare(`SELECT * FROM canonical_record_tombstones WHERE canonical_id=?`).bind(record.aggregateId).first<TombstoneRow>();
  if (oldTombstone && !payload.movedFromId && Number(payload.generation) <= oldTombstone.generation) { const result: SyncReceipt = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "moved", movedToId: oldTombstone.moved_to_id, record: tombstoneRecord(oldTombstone), message: "This canonical ID was moved; use the destination ID." }; await saveReceipt(db, result, payload, hash); return result; }
  const current = await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(record.aggregateId).first<CanonicalRow>();
  const contextOwner = await db.prepare(`SELECT * FROM canonical_records WHERE form_key=? AND context_key=?`).bind(record.formKey, record.contextKey).first<CanonicalRow>();
  const generation = Number(payload.generation ?? payload.localVersion);
  if (contextOwner && contextOwner.canonical_id !== record.aggregateId && !payload.movedFromId) { const result: SyncReceipt = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "collision", conflict: canonical(contextOwner), message: "Another canonical record already owns this context. Replace it explicitly if intended." }; await saveReceipt(db, result, payload, hash); return result; }
  if (current) {
    if (generation < Number(current.generation) || (generation === Number(current.generation) && Number(payload.localVersion) <= Number(current.revision))) { const result: SyncReceipt = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "stale", record: canonical(current), message: "An equal or newer revision is already stored." }; await saveReceipt(db, result, payload, hash); return result; }
    if (payload.baseRevision !== current.revision) { const result: SyncReceipt = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "conflict", conflict: canonical(current), message: "The canonical record changed before this generation was uploaded." }; await saveReceipt(db, result, payload, hash); return result; }
  }
  const source = payload.movedFromId ? await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(payload.movedFromId).first<CanonicalRow>() : null;
  if (payload.movedFromId && !source) { const destination = await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(record.aggregateId).first<CanonicalRow>(); if (destination) { const result: SyncReceipt = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "duplicate", record: canonical(destination), message: "The moved destination is already stored." }; await saveReceipt(db, result, payload, hash); return result; } throw new DomainError("move_source_missing", "The source canonical ID no longer exists and the destination is not stored.", 409); }
  if (source && payload.baseRevision !== source.revision) { const result: SyncReceipt = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "conflict", conflict: canonical(source), message: "The source record changed before this move was uploaded." }; await saveReceipt(db, result, payload, hash); return result; }
  const effectiveGeneration = source ? Number(source.generation) + 1 : generation;
  const nextRevision = source ? 1 : Number(payload.localVersion); const now = new Date().toISOString(); const createdAt = current?.created_at ?? source?.created_at ?? record.createdAt ?? now;
  const savedRecord: CanonicalRecord = { ...record, revision: nextRevision, generation: effectiveGeneration, publishedRevision: nextRevision, updatedAt: now, createdAt, provenance: { source: "canonical-sync", generation: effectiveGeneration, revision: nextRevision, movedFromId: payload.movedFromId ?? null } };
  const affectedDates = new Set([record.date]); if (source) affectedDates.add(source.plant_date);
  const result: SyncReceipt & { affectedDates: string[] } = { syncId: payload.syncId!, aggregateId: record.aggregateId, outcome: "accepted", revision: nextRevision, record: savedRecord, affectedDates: [...affectedDates].sort().flatMap((date) => [date, nextCalendarDate(date, 1)]) };
  const statements: D1PreparedStatement[] = [];
  const obsoleteAggregateIds = new Set<string>([record.aggregateId]);
  if (source) obsoleteAggregateIds.add(source.canonical_id);
  if (current) obsoleteAggregateIds.add(current.canonical_id);
  statements.push(...deleteNumericObservationStatements(db, obsoleteAggregateIds));
  if (source) statements.push(db.prepare(`INSERT OR REPLACE INTO canonical_record_tombstones(canonical_id,form_key,context_key,moved_to_id,generation,revision) VALUES(?,?,?,?,?,?)`).bind(source.canonical_id, source.form_key, source.context_key, record.aggregateId, source.generation, source.revision), db.prepare(`DELETE FROM canonical_records WHERE canonical_id=?`).bind(source.canonical_id));
  // A newer causal move may restore a formerly tombstoned context (A → B → A).
  if (oldTombstone) statements.push(db.prepare(`DELETE FROM canonical_record_tombstones WHERE canonical_id=?`).bind(record.aggregateId));
  if (current) statements.push(db.prepare(`DELETE FROM canonical_records WHERE canonical_id=?`).bind(current.canonical_id));
  statements.push(db.prepare(`INSERT INTO canonical_records(canonical_id,form_key,form_version,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,generation,revision,created_at,updated_at,client_updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(savedRecord.aggregateId, savedRecord.formKey, form.version, savedRecord.contextKey, savedRecord.operatorId, savedRecord.operator, savedRecord.date, savedRecord.shift, savedRecord.timeSlot, savedRecord.boilerNumber, JSON.stringify(savedRecord.values), effectiveGeneration, nextRevision, createdAt, now, payload.clientUpdatedAt));
  statements.push(...insertNumericObservationStatements(db, savedRecord));
  for (const date of affectedDates) { statements.push(db.prepare(`INSERT INTO backup_dirty_dates(plant_date,reason) VALUES(?,?) ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=CURRENT_TIMESTAMP`).bind(date, `Canonical ${form.key} revision changed`)); if (form.key === "integrator-readings") statements.push(db.prepare(`UPDATE derived_projections SET status='stale',updated_at=CURRENT_TIMESTAMP WHERE plant_date=?`).bind(date)); }
  statements.push(db.prepare(`UPDATE app_metadata SET value='false',updated_at=CURRENT_TIMESTAMP WHERE key='fresh_database'`), db.prepare(`INSERT INTO canonical_sync_receipts(sync_id,canonical_id,generation,request_hash,outcome,response_json) VALUES(?,?,?,?,?,?)`).bind(payload.syncId, savedRecord.aggregateId, generation, hash, result.outcome, JSON.stringify(result)));
  await db.batch(statements); return result;
}

export async function listLatestCompleted(db: D1Database, formKey?: string, date?: string) { const args: unknown[] = []; const clauses: string[] = []; if (formKey) { clauses.push("form_key=?"); args.push(formKey); } if (date) { clauses.push("plant_date=?"); args.push(date); } const result = await db.prepare(`SELECT * FROM canonical_records ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY plant_date DESC,COALESCE(time_slot,''),COALESCE(shift,''),COALESCE(boiler_number,0),canonical_id LIMIT 500`).bind(...args).all<CanonicalRow>(); return (result.results ?? []).map(canonical); }
export async function getLatestCompleted(db: D1Database, aggregateId: string) { const row = await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(aggregateId).first<CanonicalRow>(); return row ? canonical(row) : null; }
export async function getCanonicalTombstone(db: D1Database, aggregateId: string) { const row = await db.prepare(`SELECT * FROM canonical_record_tombstones WHERE canonical_id=?`).bind(aggregateId).first<TombstoneRow>(); return row ? tombstoneRecord(row) : null; }
