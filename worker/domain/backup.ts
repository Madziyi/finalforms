import { FORMS, allFields } from "../../shared/forms";
import { nextCalendarDate } from "../../shared/safetyContract";
import type { Values } from "../../shared/types";
import { sha256Hex, stableStringify } from "./hash";

export const BACKUP_CONTRACT_VERSION = "ecc-backup-v2";
const STANDARD_COLUMNS = [
  "backupGenerationId","payloadHash","snapshotBoundary","recordType","aggregateId","revisionId","revision","date","time","shift","boilerNumber","operator","operatorId","status","formVersion","sourceRevisions","manualAdjustments","warnings"
];

type EnvLike = { DB: D1Database; POWER_AUTOMATE_BACKUP_URL?: string; POWER_AUTOMATE_BACKUP_KEY?: string };
type PublishedRow = {
  revision_id:string; aggregate_id:string; revision:number; form_key:string; form_version:number; lifecycle:string; operator_id:string|null; operator_name:string; plant_date:string; shift:string|null; time_slot:string|null; boiler_number:number|null; values_json:string; provenance_json:string|null; created_at:string;
};
type ProjectionRow = {
  projection_id:string; form_key:"daily-consumption-totals"|"makeup"; plant_date:string; revision:number; status:string; source_revisions_json:string; effective_values_json:string; warnings_json:string;
};

type GenerationRow = {
  generation_id:string; plant_date:string; generation_number:number; snapshot_boundary:string; status:string; canonical_json:string|null; payload_hash:string|null; delivery_id:string|null; created_at:string; workflow_instance_id:string|null; last_error?:string|null;
};

export function torontoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(now);
  const get = (type:string) => parts.find((p)=>p.type===type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function previousTorontoDate(now = new Date()) { return nextCalendarDate(torontoDate(now), -1); }

function flattenPublished(row: PublishedRow) {
  const values = JSON.parse(row.values_json) as Values;
  return {
    recordType: "published_revision",
    aggregateId: row.aggregate_id,
    revisionId: row.revision_id,
    revision: Number(row.revision),
    date: row.plant_date,
    time: row.time_slot,
    shift: row.shift,
    boilerNumber: row.boiler_number,
    operator: row.operator_name,
    operatorId: row.operator_id,
    status: row.lifecycle,
    formVersion: Number(row.form_version),
    sourceRevisions: null,
    manualAdjustments: row.provenance_json ? JSON.parse(row.provenance_json) : null,
    warnings: null,
    ...values,
  };
}
function flattenProjection(row: ProjectionRow) {
  return {
    recordType: "derived_projection",
    aggregateId: row.projection_id,
    revisionId: row.projection_id,
    revision: Number(row.revision),
    date: row.plant_date,
    time: null,
    shift: null,
    boilerNumber: null,
    operator: "System",
    operatorId: null,
    status: row.status,
    formVersion: 2,
    sourceRevisions: JSON.parse(row.source_revisions_json),
    manualAdjustments: null,
    warnings: JSON.parse(row.warnings_json),
    ...(JSON.parse(row.effective_values_json) as Values),
  };
}

export async function buildBackupGeneration(db: D1Database, plantDate: string): Promise<{ ready: boolean; generation?: GenerationRow; reason?: string }> {
  const existing = await db.prepare(`SELECT * FROM backup_generations WHERE plant_date=? ORDER BY generation_number DESC LIMIT 1`).bind(plantDate).first<GenerationRow>();
  const dirty = await db.prepare(`SELECT last_dirty_at FROM backup_dirty_dates WHERE plant_date=?`).bind(plantDate).first<{last_dirty_at:string}>();
  if (existing?.canonical_json && existing.payload_hash && existing.status !== "verified" && (!dirty || dirty.last_dirty_at <= existing.created_at)) return { ready: true, generation: existing };
  if (existing?.status === "verified" && (!dirty || dirty.last_dirty_at <= existing.created_at)) return { ready: true, generation: existing };
  if (existing?.status === "not_ready" && (!dirty || dirty.last_dirty_at <= existing.created_at)) return { ready: false, reason: existing.last_error ?? "Backup generation is waiting for dependencies." };

  // One D1 batch freezes latest completed records, projections, and the boundary
  // from the same transactional snapshot. Legacy published revisions are not a
  // normal backup source; migration 0003 backfills them into this table.
  const [publishedResult, projectionResult, boundaryResult] = await db.batch([
    db.prepare(`SELECT 'local-'||aggregate_id||'-'||local_revision AS revision_id,aggregate_id,local_revision AS revision,form_key,form_version,'completed' AS lifecycle,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,NULL AS provenance_json,created_at FROM latest_completed_records WHERE plant_date=? ORDER BY form_key,time_slot,shift,boiler_number,aggregate_id`).bind(plantDate),
    db.prepare(`SELECT projection_id,form_key,plant_date,revision,status,source_revisions_json,effective_values_json,warnings_json FROM derived_projections WHERE plant_date=? ORDER BY form_key`).bind(plantDate),
    db.prepare(`SELECT CURRENT_TIMESTAMP AS boundary`),
  ]);
  const snapshotBoundary = String((boundaryResult.results?.[0] as any)?.boundary ?? new Date().toISOString());
  const publishedRows = (publishedResult.results ?? []) as unknown as PublishedRow[];
  const projectionRows = (projectionResult.results ?? []) as unknown as ProjectionRow[];
  const generationId = crypto.randomUUID();
  const generationNumber = Number(existing?.generation_number ?? 0) + 1;
  const forms = [] as any[];
  for (const form of FORMS) {
    const fieldKeys = allFields(form).map((f)=>f.key);
    let entries: any[] = [];
    if (form.number === 5 || form.number === 6) {
      const projection = projectionRows.find((p)=>p.form_key===form.key);
      if (projection) entries = [flattenProjection(projection)];
    } else {
      entries = publishedRows.filter((r)=>r.form_key===form.key).map(flattenPublished);
    }
    forms.push({ formId: form.key, formName: form.name, formVersion: form.version, worksheetName: form.backupWorksheetName, standardColumns: STANDARD_COLUMNS, fieldKeys, entries });
  }
  for (const form of forms) for (const entry of form.entries) {
    entry.backupGenerationId = generationId;
    entry.snapshotBoundary = snapshotBoundary;
    // payloadHash is deliberately outside the hashed bytes to avoid self-referential hashing.
    entry.payloadHash = null;
  }
  const payload = { schemaVersion: 2, contractVersion: BACKUP_CONTRACT_VERSION, backupDate: plantDate, generatedAt: snapshotBoundary, generationId, generationNumber, snapshotBoundary, forms };
  const authoritativeJson = stableStringify(payload);
  const authoritativeHash = await sha256Hex(authoritativeJson);
  const deliveryId = generationId;
  const shortHash = authoritativeHash.slice(0,12);
  const xlsxFileName = `ECC_Operator_Backup_${plantDate}_G${String(generationNumber).padStart(3,"0")}_${shortHash}.xlsx`;
  const jsonFileName = `ECC_Operator_Backup_${plantDate}_G${String(generationNumber).padStart(3,"0")}_${shortHash}.json`;
  const receiptFileName = `ECC_Operator_Backup_${plantDate}_G${String(generationNumber).padStart(3,"0")}_${shortHash}_${generationId}.receipt.json`;

  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO backup_generations(generation_id,plant_date,generation_number,snapshot_boundary,status,canonical_json,payload_hash,delivery_id,ready_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(generationId, plantDate, generationNumber, snapshotBoundary, "ready", authoritativeJson, authoritativeHash, deliveryId),
    db.prepare(`INSERT INTO backup_deliveries(delivery_id,generation_id,status,request_hash) VALUES(?,?,?,?)`).bind(deliveryId, generationId, "pending", authoritativeHash),
  ];
  for (const row of publishedRows) statements.push(db.prepare(`INSERT INTO backup_generation_items(generation_id,item_type,item_id,form_key,revision_number) VALUES(?,?,?,?,?)`).bind(generationId,"revision",row.revision_id,row.form_key,Number(row.revision)));
  for (const row of projectionRows) statements.push(db.prepare(`INSERT INTO backup_generation_items(generation_id,item_type,item_id,form_key,revision_number) VALUES(?,?,?,?,?)`).bind(generationId,"projection",row.projection_id,row.form_key,Number(row.revision)));
  await db.batch(statements);
  return { ready: true, generation: { generation_id:generationId, plant_date:plantDate, generation_number:generationNumber, snapshot_boundary:snapshotBoundary, status:"ready", canonical_json:authoritativeJson, payload_hash:authoritativeHash, delivery_id:deliveryId, created_at:snapshotBoundary, workflow_instance_id:null, xlsxFileName, jsonFileName, receiptFileName } as any };
}

export async function getGeneration(db: D1Database, generationId: string) {
  return db.prepare(`SELECT * FROM backup_generations WHERE generation_id=?`).bind(generationId).first<GenerationRow>();
}

export async function deliverBackupGeneration(env: EnvLike, generationId: string): Promise<{ outcome:"verified"|"permanent_failure"; response?:unknown; message?:string }> {
  const generation = await getGeneration(env.DB, generationId);
  if (!generation?.canonical_json || !generation.payload_hash || !generation.delivery_id) throw new Error("Backup generation is not frozen and ready.");
  if (generation.status === "verified") return { outcome:"verified" };
  if (!env.POWER_AUTOMATE_BACKUP_URL || !env.POWER_AUTOMATE_BACKUP_KEY) {
    await env.DB.prepare(`UPDATE backup_generations SET status='failed',last_error='Power Automate secrets are not configured.' WHERE generation_id=?`).bind(generationId).run();
    await env.DB.prepare(`UPDATE backup_deliveries SET status='failed',last_error='Power Automate secrets are not configured.',updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(generation.delivery_id).run();
    return { outcome:"permanent_failure", message:"Power Automate secrets are not configured." };
  }
  const shortHash = generation.payload_hash.slice(0,12);
  const jsonFileName = `ECC_Operator_Backup_${generation.plant_date}_G${String(generation.generation_number).padStart(3,"0")}_${shortHash}.json`;
  const xlsxFileName = `ECC_Operator_Backup_${generation.plant_date}_G${String(generation.generation_number).padStart(3,"0")}_${shortHash}.xlsx`;
  const receiptFileName = `ECC_Operator_Backup_${generation.plant_date}_G${String(generation.generation_number).padStart(3,"0")}_${shortHash}_${generation.generation_id}.receipt.json`;
  const envelope = {
    contractVersion: BACKUP_CONTRACT_VERSION,
    deliveryId: generation.delivery_id,
    generationId: generation.generation_id,
    generationNumber: Number(generation.generation_number),
    backupDate: generation.plant_date,
    payloadHash: generation.payload_hash,
    jsonFileName,
    xlsxFileName,
    receiptFileName,
    canonicalJson: generation.canonical_json,
  };
  await env.DB.batch([
    env.DB.prepare(`UPDATE backup_generations SET status='delivering',attempt_count=attempt_count+1,last_error=NULL WHERE generation_id=?`).bind(generationId),
    env.DB.prepare(`UPDATE backup_deliveries SET status='delivering',attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(generation.delivery_id),
  ]);
  let response: Response;
  try {
    response = await fetch(env.POWER_AUTOMATE_BACKUP_URL, { method:"POST", headers:{ "Content-Type":"application/json", "X-ECC-Backup-Key": env.POWER_AUTOMATE_BACKUP_KEY }, body: stableStringify(envelope) });
  } catch (error) {
    const message = `Delivery network outcome is ambiguous: ${String(error)}`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE backup_generations SET status='reconciling',last_error=? WHERE generation_id=?`).bind(message,generationId),
      env.DB.prepare(`UPDATE backup_deliveries SET status='reconciling',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(message,generation.delivery_id),
    ]);
    throw error;
  }
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw:text }; }
  if (!response.ok) {
    const message = `Power Automate returned HTTP ${response.status}: ${text.slice(0,1200)}`;
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    await env.DB.batch([
      env.DB.prepare(`UPDATE backup_generations SET status=?,last_error=? WHERE generation_id=?`).bind(permanent?"failed":"reconciling",message,generationId),
      env.DB.prepare(`UPDATE backup_deliveries SET status=?,last_error=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(permanent?"failed":"reconciling",message,JSON.stringify(body),generation.delivery_id),
    ]);
    if (permanent) return { outcome:"permanent_failure", response:body, message };
    throw new Error(message);
  }
  const verified = body?.success === true
    && body?.generationId === generation.generation_id
    && body?.payloadHash === generation.payload_hash
    && body?.jsonFileName === jsonFileName
    && body?.xlsxFileName === xlsxFileName
    && body?.receiptFileName === receiptFileName;
  if (!verified) {
    const message = "Power Automate response did not echo the exact generation ID, payload hash, and immutable filenames.";
    await env.DB.batch([
      env.DB.prepare(`UPDATE backup_generations SET status='reconciling',last_error=? WHERE generation_id=?`).bind(message,generationId),
      env.DB.prepare(`UPDATE backup_deliveries SET status='reconciling',last_error=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(message,JSON.stringify(body),generation.delivery_id),
    ]);
    throw new Error(message);
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE backup_generations SET status='verified',verified_at=CURRENT_TIMESTAMP,last_error=NULL WHERE generation_id=?`).bind(generationId),
    env.DB.prepare(`UPDATE backup_deliveries SET status='verified',response_json=?,json_file_name=?,xlsx_file_name=?,last_error=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(JSON.stringify(body),body.jsonFileName ?? jsonFileName,body.xlsxFileName ?? xlsxFileName,generation.delivery_id),
    env.DB.prepare(`DELETE FROM backup_dirty_dates WHERE plant_date=? AND last_dirty_at <= ?`).bind(generation.plant_date,generation.created_at),
  ]);
  return { outcome:"verified", response:body };
}

export async function backupStatus(db: D1Database, plantDate?: string) {
  const where = plantDate ? "WHERE g.plant_date=?" : "";
  const stmt = db.prepare(`SELECT g.*,d.status delivery_status,d.attempt_count delivery_attempts,d.json_file_name,d.xlsx_file_name,d.last_error delivery_error FROM backup_generations g LEFT JOIN backup_deliveries d ON d.generation_id=g.generation_id ${where} ORDER BY g.plant_date DESC,g.generation_number DESC LIMIT 100`);
  const result = plantDate ? await stmt.bind(plantDate).all() : await stmt.all();
  return result.results ?? [];
}

export async function dirtyDates(db: D1Database, throughDate?: string) {
  const result = throughDate
    ? await db.prepare(`SELECT plant_date FROM backup_dirty_dates WHERE plant_date<=? ORDER BY plant_date LIMIT 30`).bind(throughDate).all<{plant_date:string}>()
    : await db.prepare(`SELECT plant_date FROM backup_dirty_dates ORDER BY plant_date LIMIT 30`).all<{plant_date:string}>();
  return (result.results ?? []).map((r)=>r.plant_date);
}
