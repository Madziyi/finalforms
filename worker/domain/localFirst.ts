import { getForm } from "../../shared/forms";
import { nextCalendarDate, normalizeContext } from "../../shared/safetyContract";
import type { CanonicalRecord, CompletedRecordUpload } from "../../shared/types";
import { DomainError, validateFormValues } from "./validation";

type LatestRow = {
  aggregate_id: string;
  form_key: string;
  context_key: string;
  operator_id: string | null;
  operator_name: string;
  plant_date: string;
  shift: string | null;
  time_slot: string | null;
  boiler_number: number | null;
  values_json: string;
  local_revision: number;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  freshness_tiebreaker: string;
};

function canonical(row: LatestRow): CanonicalRecord {
  return {
    aggregateId: String(row.aggregate_id),
    formKey: String(row.form_key),
    contextKey: String(row.context_key),
    revision: Number(row.local_revision ?? 0),
    publishedRevision: Number(row.local_revision ?? 0),
    lifecycle: "completed",
    operatorId: row.operator_id ?? null,
    operator: String(row.operator_name),
    date: String(row.plant_date),
    shift: row.shift ?? null,
    timeSlot: row.time_slot ?? null,
    boilerNumber: row.boiler_number == null ? null : Number(row.boiler_number),
    values: JSON.parse(row.values_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    provenance: { source: "local-first" },
  };
}

function timestamp(value: string | null | undefined) {
  const parsed = value == null ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MIN_SAFE_INTEGER;
}

/** Compare the context-wide freshness tuple: timestamp, local version, UUID. */
function compareFreshness(incoming: { clientUpdatedAt: string; localVersion: number; aggregateId: string }, existing: Pick<LatestRow, "client_updated_at" | "local_revision" | "aggregate_id">) {
  const timeDifference = timestamp(incoming.clientUpdatedAt) - timestamp(existing.client_updated_at);
  if (timeDifference !== 0) return timeDifference > 0 ? 1 : -1;
  if (incoming.localVersion !== Number(existing.local_revision)) return incoming.localVersion > Number(existing.local_revision) ? 1 : -1;
  if (incoming.aggregateId === existing.aggregate_id) return 0;
  return incoming.aggregateId > existing.aggregate_id ? 1 : -1;
}

export function validateCompletedUpload(input: unknown): CompletedRecordUpload {
  if (!input || typeof input !== "object") throw new DomainError("invalid_upload", "Completed upload must be an object.");
  const payload = input as Partial<CompletedRecordUpload>;
  const record = payload.record as Partial<CanonicalRecord> | undefined;
  if (payload.protocolVersion !== 2 || !record || record.lifecycle !== "completed") {
    throw new DomainError("invalid_upload", "A v2 completed record is required.", 422);
  }

  const form = getForm(String(record.formKey));
  if (!form || form.schedule === "derived") throw new DomainError("invalid_upload", "Only operator-completed forms may be uploaded.", 422);
  if (typeof record.aggregateId !== "string" || !record.aggregateId.trim()) throw new DomainError("invalid_upload", "A record id is required.", 422);
  if (typeof record.operatorId !== "string" || !record.operatorId.trim() || typeof record.operator !== "string" || !record.operator.trim()) {
    throw new DomainError("operator_required", "Select an operator before completing a record.", 422);
  }
  if (typeof record.date !== "string") throw new DomainError("invalid_context", "A valid plant date is required.", 422);
  if (!Number.isInteger(record.revision) || Number(record.revision) < 0) throw new DomainError("invalid_upload", "record.revision must be a non-negative integer.", 422);
  if (!Number.isInteger(payload.localVersion) || Number(payload.localVersion) < 0) throw new DomainError("invalid_upload", "A non-negative local version is required.", 422);
  if (typeof payload.clientUpdatedAt !== "string" || !payload.clientUpdatedAt.trim() || !Number.isFinite(Date.parse(payload.clientUpdatedAt))) {
    throw new DomainError("invalid_timestamp", "clientUpdatedAt must be an ISO timestamp.", 422);
  }

  let contextKey: string;
  try {
    contextKey = normalizeContext(form.key, {
      date: record.date,
      shift: record.shift as any,
      timeSlot: record.timeSlot,
      boilerNumber: record.boilerNumber as any,
    });
  } catch (error) {
    throw new DomainError("invalid_context", error instanceof Error ? error.message : String(error), 422);
  }
  if (record.contextKey != null && record.contextKey !== contextKey) throw new DomainError("invalid_context", "Record context does not match its date and context fields.", 422);

  const normalized = validateFormValues(form.key, form.version, {
    date: record.date,
    shift: record.shift as any,
    timeSlot: record.timeSlot,
    boilerNumber: record.boilerNumber as any,
  }, record.values);
  record.contextKey = normalized.contextKey;
  record.values = normalized.values;
  record.revision = Number(payload.localVersion);
  record.publishedRevision = Number(payload.localVersion);
  return {
    protocolVersion: 2,
    record: record as CanonicalRecord & { lifecycle: "completed" },
    localVersion: Number(payload.localVersion),
    clientUpdatedAt: new Date(payload.clientUpdatedAt).toISOString(),
  };
}

export async function upsertCompletedRecord(db: D1Database, input: unknown) {
  const payload = validateCompletedUpload(input);
  const record = payload.record;
  const form = getForm(record.formKey)!;
  const incoming = { clientUpdatedAt: payload.clientUpdatedAt, localVersion: payload.localVersion, aggregateId: record.aggregateId };
  const existing = await db.prepare(`SELECT * FROM latest_completed_records WHERE form_key=? AND context_key=?`).bind(record.formKey, record.contextKey).first<LatestRow>();
  const priorContext = await db.prepare(`SELECT * FROM latest_completed_records WHERE aggregate_id=?`).bind(record.aggregateId).first<LatestRow>();

  const blocker = existing && compareFreshness(incoming, existing) <= 0
    ? existing
    : priorContext && priorContext.context_key !== record.contextKey && compareFreshness(incoming, priorContext) <= 0
      ? priorContext
      : null;
  if (blocker) return { outcome: "stale" as const, record: canonical(blocker), affectedDates: [] as string[] };

  const createdAt = existing?.created_at ?? record.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const valuesJson = JSON.stringify(record.values);
  const saved = await db.prepare(`
    INSERT INTO latest_completed_records(
      aggregate_id,form_key,form_version,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,
      values_json,local_revision,created_at,updated_at,client_updated_at,freshness_tiebreaker
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(form_key,context_key) DO UPDATE SET
      aggregate_id=excluded.aggregate_id,
      form_version=excluded.form_version,
      operator_id=excluded.operator_id,
      operator_name=excluded.operator_name,
      plant_date=excluded.plant_date,
      shift=excluded.shift,
      time_slot=excluded.time_slot,
      boiler_number=excluded.boiler_number,
      values_json=excluded.values_json,
      local_revision=excluded.local_revision,
      updated_at=excluded.updated_at,
      client_updated_at=excluded.client_updated_at,
      freshness_tiebreaker=excluded.freshness_tiebreaker
    WHERE excluded.client_updated_at > latest_completed_records.client_updated_at
       OR (excluded.client_updated_at = latest_completed_records.client_updated_at AND (
         excluded.local_revision > latest_completed_records.local_revision
         OR (excluded.local_revision = latest_completed_records.local_revision AND excluded.freshness_tiebreaker > latest_completed_records.freshness_tiebreaker)
       ))
  `).bind(
    record.aggregateId, record.formKey, form.version, record.contextKey, record.operatorId, record.operator,
    record.date, record.shift, record.timeSlot, record.boilerNumber, valuesJson, payload.localVersion,
    createdAt, updatedAt, payload.clientUpdatedAt, record.aggregateId,
  ).run();

  if (!saved.success) throw new Error("Cloudflare could not save the completed record.");
  const latest = await db.prepare(`SELECT * FROM latest_completed_records WHERE form_key=? AND context_key=?`).bind(record.formKey, record.contextKey).first<LatestRow>();
  if (!latest) throw new Error("Cloudflare could not read the completed record after saving.");
  if (compareFreshness(incoming, latest) < 0) return { outcome: "stale" as const, record: canonical(latest), affectedDates: [] as string[] };

  if (priorContext && priorContext.context_key !== record.contextKey) {
    await db.prepare(`DELETE FROM latest_completed_records WHERE aggregate_id=? AND context_key<>?`).bind(record.aggregateId, record.contextKey).run();
  }
  const dates = new Set([record.date]);
  if (priorContext && priorContext.context_key !== record.contextKey) {
    const oldDate = priorContext.context_key.split("|")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(oldDate)) dates.add(oldDate);
  }
  return {
    outcome: "accepted" as const,
    record: canonical(latest),
    affectedDates: [...dates].sort().flatMap((date) => [date, nextCalendarDate(date, 1)]),
  };
}

export async function listLatestCompleted(db: D1Database, formKey?: string, date?: string) {
  const args: unknown[] = [];
  const clauses: string[] = [];
  if (formKey) { clauses.push("form_key=?"); args.push(formKey); }
  if (date) { clauses.push("plant_date=?"); args.push(date); }
  const result = await db.prepare(`SELECT * FROM latest_completed_records ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY plant_date DESC,COALESCE(time_slot,''),COALESCE(shift,''),COALESCE(boiler_number,0),aggregate_id LIMIT 500`).bind(...args).all<LatestRow>();
  return (result.results ?? []).map(canonical);
}

export async function getLatestCompleted(db: D1Database, aggregateId: string) {
  const row = await db.prepare(`SELECT * FROM latest_completed_records WHERE aggregate_id=?`).bind(aggregateId).first<LatestRow>();
  return row ? canonical(row) : null;
}
