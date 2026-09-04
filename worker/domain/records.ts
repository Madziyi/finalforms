import type { CanonicalRecord, Values } from "../../shared/types";

type RevisionRow = {
  aggregate_id: string;
  revision: number;
  form_key: string;
  lifecycle: "draft" | "completed" | "superseded";
  context_key: string;
  operator_id: string | null;
  operator_name: string;
  plant_date: string;
  shift: string | null;
  time_slot: string | null;
  boiler_number: number | null;
  values_json: string;
  provenance_json: string | null;
  created_at: string;
  aggregate_created_at?: string;
  aggregate_updated_at?: string;
  published_revision?: number | null;
};

export function revisionRowToRecord(row: RevisionRow): CanonicalRecord {
  return {
    aggregateId: row.aggregate_id,
    formKey: row.form_key,
    contextKey: row.context_key,
    revision: Number(row.revision),
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision),
    lifecycle: row.lifecycle,
    operatorId: row.operator_id,
    operator: row.operator_name,
    date: row.plant_date,
    shift: row.shift,
    timeSlot: row.time_slot,
    boilerNumber: row.boiler_number == null ? null : Number(row.boiler_number),
    values: JSON.parse(row.values_json) as Values,
    provenance: row.provenance_json ? JSON.parse(row.provenance_json) : null,
    createdAt: row.aggregate_created_at ?? row.created_at,
    updatedAt: row.aggregate_updated_at ?? row.created_at,
  };
}

export async function getCanonicalRecord(db: D1Database, aggregateId: string, revision?: number): Promise<CanonicalRecord | null> {
  const row = revision == null
    ? await db.prepare(`
      SELECT r.*, a.published_revision, a.created_at aggregate_created_at, a.updated_at aggregate_updated_at
      FROM aggregates a JOIN revisions r ON r.aggregate_id=a.aggregate_id AND r.revision=a.current_revision
      WHERE a.aggregate_id=?
    `).bind(aggregateId).first<RevisionRow>()
    : await db.prepare(`
      SELECT r.*, a.published_revision, a.created_at aggregate_created_at, a.updated_at aggregate_updated_at
      FROM aggregates a JOIN revisions r ON r.aggregate_id=a.aggregate_id
      WHERE a.aggregate_id=? AND r.revision=?
    `).bind(aggregateId, revision).first<RevisionRow>();
  return row ? revisionRowToRecord(row) : null;
}

export async function getPublishedRecord(db: D1Database, aggregateId: string): Promise<CanonicalRecord | null> {
  const row = await db.prepare(`
    SELECT r.*, a.published_revision, a.created_at aggregate_created_at, a.updated_at aggregate_updated_at
    FROM aggregates a JOIN revisions r ON r.aggregate_id=a.aggregate_id AND r.revision=a.published_revision
    WHERE a.aggregate_id=? AND a.published_revision IS NOT NULL AND a.lifecycle <> 'superseded'
  `).bind(aggregateId).first<RevisionRow>();
  return row ? revisionRowToRecord(row) : null;
}

export async function getRevisionHistory(db:D1Database, aggregateId:string){
  const result=await db.prepare(`
    SELECT r.*,a.published_revision,a.created_at aggregate_created_at,a.updated_at aggregate_updated_at
    FROM revisions r JOIN aggregates a ON a.aggregate_id=r.aggregate_id
    WHERE r.aggregate_id=? ORDER BY r.revision DESC
  `).bind(aggregateId).all<RevisionRow & {operation:string;is_published:number}>();
  return (result.results??[]).map((row:any)=>({ ...revisionRowToRecord(row), operation:row.operation, isPublished:Boolean(row.is_published), revisionCreatedAt:row.created_at }));
}
