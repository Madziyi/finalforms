import { allFields, getForm } from "../shared/forms";
import { buildAiCapturePrompt, normalizeAiCaptureResponse } from "./domain/aiCapture";
import { APP_SCHEMA_VERSION, PROTOCOL_VERSION, nextCalendarDate, shiftMeasuredAt } from "../shared/safetyContract";
import type { CanonicalRecord, OperatorRecord, Values } from "../shared/types";
import { backupStatus, previousTorontoDate } from "./domain/backup";
import { recomputeDerivedDate } from "./domain/derivations";
import { DomainError } from "./domain/validation";
import { openAttention } from "./domain/db";
import { getLatestCompleted, listLatestCompleted, upsertCompletedRecord } from "./domain/localFirst";
import { materializeExportValues, type ExportMaterializationSources } from "./domain/exportMaterialization";
import type { Env } from "./env";
export { BackupWorkflow } from "./workflow";

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}
function fail(message: string, status: number, code = "error", details?: unknown) { return json({ error: { code, message, details } }, { status }); }
function isLocal(request: Request) { const h = new URL(request.url).hostname; return h === "localhost" || h === "127.0.0.1"; }
function authorized(request: Request, env: Env) {
  if (!env.DEVICE_TOKEN) return isLocal(request);
  return request.headers.get("X-ECC-Device-Token") === env.DEVICE_TOKEN;
}
function requireAuth(request: Request, env: Env) {
  if (!authorized(request, env)) throw new DomainError("forbidden", env.DEVICE_TOKEN ? "This tablet is not authorized." : "DEVICE_TOKEN is not configured.", env.DEVICE_TOKEN ? 403 : 503);
}

async function readJson(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new DomainError("content_type", "application/json is required.", 415);
  return request.json();
}

async function listOperators(db: D1Database) {
  const result = await db.prepare(`SELECT id,name,active,created_at,updated_at FROM operators ORDER BY active DESC,name`).all<any>();
  return (result.results ?? []).map((r):OperatorRecord=>({ id:r.id,name:r.name,active:Boolean(r.active),createdAt:r.created_at,updatedAt:r.updated_at }));
}

async function listRecords(db: D1Database, url: URL) {
  const formKey = url.searchParams.get("formKey");
  const plantDate = url.searchParams.get("date");
  const form = formKey ? getForm(formKey) : null;
  if (form?.schedule === "derived") {
    const args: unknown[] = [formKey];
    let sql = `SELECT * FROM derived_projections WHERE form_key=?`;
    if (plantDate) { sql += ` AND plant_date=?`; args.push(plantDate); }
    sql += ` ORDER BY plant_date DESC LIMIT 200`;
    const res = await db.prepare(sql).bind(...args).all<any>();
    return (res.results ?? []).map((r)=>({
      aggregateId:r.projection_id,formKey:r.form_key,contextKey:r.plant_date,revision:Number(r.revision),publishedRevision:Number(r.revision),lifecycle:r.status === "current" ? "completed" : "draft",operatorId:null,operator:"System",date:r.plant_date,shift:null,timeSlot:null,boilerNumber:null,values:JSON.parse(r.effective_values_json),provenance:{ status:r.status, sourceRevisions:JSON.parse(r.source_revisions_json), warnings:JSON.parse(r.warnings_json) },createdAt:r.created_at,updatedAt:r.updated_at,
    } satisfies CanonicalRecord));
  }
  return listLatestCompleted(db, formKey ?? undefined, plantDate ?? undefined);
}

function projectionRecord(row: any): CanonicalRecord {
  return {
    aggregateId: row.projection_id,
    formKey: row.form_key,
    contextKey: row.plant_date,
    revision: Number(row.revision),
    publishedRevision: Number(row.revision),
    lifecycle: row.status === "current" ? "completed" : "draft",
    operatorId: null,
    operator: "System",
    date: row.plant_date,
    shift: null,
    timeSlot: null,
    boilerNumber: null,
    values: JSON.parse(row.effective_values_json),
    provenance: { status: row.status, sourceRevisions: JSON.parse(row.source_revisions_json), warnings: JSON.parse(row.warnings_json) },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPublicRecords(db: D1Database, url: URL) {
  const formKey = url.searchParams.get("formKey");
  if (!formKey || !getForm(formKey)) throw new DomainError("unknown_form", "A valid formKey is required.");
  return (await listRecords(db, url)).filter((record) => record.lifecycle === "completed");
}

async function getPublicRecord(db: D1Database, aggregateId: string) {
  const projection = await db.prepare(`SELECT * FROM derived_projections WHERE projection_id=? AND status='current'`).bind(aggregateId).first<any>();
  if (projection) return projectionRecord(projection);
  const record = await getLatestCompleted(db, aggregateId);
  return record?.lifecycle === "completed" ? record : null;
}

async function trend(db: D1Database, url: URL) {
  const formKey = url.searchParams.get("formKey");
  const fieldKey = url.searchParams.get("fieldKey");
  const before = url.searchParams.get("before");
  const limit = Math.min(365, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));
  if (!formKey || !fieldKey) throw new DomainError("trend_args", "formKey and fieldKey are required.");
  const form = getForm(formKey);
  if (!form) throw new DomainError("unknown_form", "Unknown form.");
  if (form.schedule === "derived") {
    const args: unknown[] = [formKey, fieldKey];
    let sql = `SELECT projection_id AS aggregate_id,plant_date,measured_at,numeric_value FROM derived_numeric_observations WHERE form_key=? AND field_key=? AND is_current=1`;
    if (before) { sql += ` AND measured_at<?`; args.push(before); }
    sql += ` ORDER BY measured_at DESC LIMIT ?`; args.push(limit);
    const res = await db.prepare(sql).bind(...args).all<any>();
    return res.results ?? [];
  }
  const records = await listLatestCompleted(db, formKey);
  return records
    .map((record) => {
      const value = record.values[fieldKey];
      const measuredAt = record.timeSlot ? `${record.date}T${record.timeSlot}:00` : shiftMeasuredAt(record.date, record.shift as "Day" | "Night" | "Extra" | null);
      return { aggregate_id: record.aggregateId, plant_date: record.date, measured_at: measuredAt, numeric_value: value };
    })
    .filter((point) => typeof point.numeric_value === "number" && Number.isFinite(point.numeric_value) && (!before || point.measured_at < before))
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at))
    .slice(0, limit);
}

function csvEscape(value: unknown) {
  const s = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
async function exportCsv(db: D1Database, formKey: string) {
  const form = getForm(formKey); if (!form) throw new DomainError("unknown_form","Unknown form.");
  const url = new URL(`https://local/api/records?formKey=${encodeURIComponent(formKey)}`);
  const records = await listRecords(db,url) as CanonicalRecord[];
  let sources: ExportMaterializationSources = { form9Oat: [], form5Projections: [] };
  if (formKey === "gas-turbine-log-sheet" || formKey === "boiler-water-control-tests") {
    // Export materialization is read-only. These source queries intentionally
    // use the same shared contract as backup generation so display-only fields
    // cannot diverge between CSV and SharePoint/Excel output.
    const [oatResult, form5Result] = await db.batch([
      db.prepare(`SELECT plant_date,time_slot,values_json FROM canonical_records WHERE form_key='gas-turbine-log-sheet' ORDER BY plant_date,time_slot,canonical_id`),
      db.prepare(`SELECT plant_date,status,effective_values_json FROM derived_projections WHERE form_key='daily-consumption-totals' ORDER BY plant_date`),
    ]);
    sources = {
      form9Oat: (oatResult.results ?? []).map((row: any) => ({
        date: String(row.plant_date),
        timeSlot: row.time_slot ?? null,
        values: JSON.parse(row.values_json) as Values,
        status: "completed",
        lifecycle: "completed",
      })),
      form5Projections: (form5Result.results ?? []).map((row: any) => ({
        plantDate: String(row.plant_date),
        status: String(row.status),
        values: JSON.parse(row.effective_values_json) as Values,
      })),
    };
  }
  const fields = allFields(form).map((f)=>f.key);
  const headers = ["aggregateId","revision","date","timeSlot","shift","boilerNumber","operator","status",...fields];
  const lines = [headers.join(",")];
  for (const r of records) {
    const values = materializeExportValues(formKey, r.date, r.shift, r.values, sources);
    lines.push(headers.map((h)=>csvEscape(h in r ? (r as any)[h] : values[h])).join(","));
  }
  return new Response(lines.join("\r\n"), { headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${formKey}.csv"`} });
}

async function aiExtract(request: Request, env: Env) {
  if (!env.OPENAI_API_KEY) throw new DomainError("ai_not_configured", "OPENAI_API_KEY is not configured.", 503);
  const body = await readJson(request) as { imageBase64?:string; mimeType?:string };
  if (!body.imageBase64 || body.imageBase64.length > 9_000_000) throw new DomainError("image_invalid", "A compressed image under approximately 6 MB is required.");
  const prompt = buildAiCapturePrompt();
  const response = await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",store:false,reasoning:{effort:"low"},input:[{role:"user",content:[{type:"input_text",text:prompt},{type:"input_image",image_url:`data:${body.mimeType ?? "image/jpeg"};base64,${body.imageBase64}`,detail:"high"}]}],text:{format:{type:"json_object"}}})});
  const raw:any = await response.json().catch(()=>null);
  if (!response.ok) throw new DomainError("ai_error", `Gemini returned HTTP ${response.status}.`, 502, raw);
  const text = raw?.output_text ?? raw?.output?.flatMap((item:any)=>item.content??[]).filter((part:any)=>part.type==="output_text").map((part:any)=>part.text??"").join("") ?? "{}";
  let parsed:any; try { parsed=JSON.parse(text); } catch { throw new DomainError("ai_parse", "OpenAI did not return valid JSON.", 502); }
  return normalizeAiCaptureResponse(parsed);
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null,{status:204});
  if (url.pathname === "/api/meta" && request.method === "GET") return json({ protocolVersion:PROTOCOL_VERSION,schemaVersion:APP_SCHEMA_VERSION,serverTime:new Date().toISOString(),plantTimeZone:env.PLANT_TIME_ZONE,backupContractVersion:"ecc-backup-v2" });
  if (url.pathname === "/api/public/records" && request.method === "GET") return json({records:await listPublicRecords(env.DB,url)});
  const publicRecordMatch=url.pathname.match(/^\/api\/public\/records\/([^/]+)$/);
  if(publicRecordMatch && request.method === "GET"){
    const record=await getPublicRecord(env.DB,decodeURIComponent(publicRecordMatch[1]));
    if(!record) throw new DomainError("record_missing","Record not found.",404);
    return json({record});
  }
  if (url.pathname === "/api/public/trend" && request.method === "GET") return json({points:await trend(env.DB,url)});
  requireAuth(request,env);

  if (url.pathname === "/api/operators" && request.method === "GET") return json({operators:await listOperators(env.DB)});
  if (url.pathname === "/api/operators" && request.method === "POST") {
    const body=await readJson(request) as {name?:string}; const name=String(body.name??"").trim(); if(!name) throw new DomainError("operator_name","Operator name is required.");
    const id=`operator-${crypto.randomUUID()}`; await env.DB.prepare(`INSERT INTO operators(id,name) VALUES(?,?)`).bind(id,name).run(); return json({operator:{id,name,active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}},{status:201});
  }
  if (url.pathname.startsWith("/api/operators/") && request.method === "PATCH") {
    const id=decodeURIComponent(url.pathname.split("/").pop()!); const body=await readJson(request) as {name?:string;active?:boolean};
    const existing=await env.DB.prepare(`SELECT * FROM operators WHERE id=?`).bind(id).first<any>(); if(!existing) throw new DomainError("operator_missing","Operator not found.",404);
    const name=body.name===undefined?existing.name:String(body.name).trim(); const active=body.active===undefined?Number(existing.active):(body.active?1:0);
    await env.DB.prepare(`UPDATE operators SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,active,id).run(); return json({operator:{id,name,active:Boolean(active),createdAt:existing.created_at,updatedAt:new Date().toISOString()}});
  }
  if (url.pathname === "/api/completed" && request.method === "POST") {
    const payload=await readJson(request);
    const result=await upsertCompletedRecord(env.DB,payload);
    if(result.outcome==="accepted" && (result.record?.formKey==="integrator-readings" || result.record?.formKey==="gas-turbine-log-sheet")){
      const dates=new Set<string>((result.affectedDates as string[]|undefined)??[result.record.date,nextCalendarDate(result.record.date,1)]);
      ctx.waitUntil((async()=>{for(const date of dates){try{await recomputeDerivedDate(env.DB,date);}catch(error){console.error("Local-first projection refresh failed",date,error);await openAttention(env.DB,{plantDate:date,category:"derivation",code:"projection_refresh_failed",severity:"error",message:"Form 5/Form 6 recalculation failed after a completed Form 8 or Form 9 upload.",details:{error:String(error)}}).catch(()=>undefined);}}})());
    }
    return json(result);
  }
  if (url.pathname === "/api/records" && request.method === "GET") return json({records:await listRecords(env.DB,url)});
  if (url.pathname.startsWith("/api/records/") && request.method === "GET") {
    const id=decodeURIComponent(url.pathname.split("/").pop()!);
    const projection=await env.DB.prepare(`SELECT * FROM derived_projections WHERE projection_id=?`).bind(id).first<any>();
    if(projection) return json({current:projectionRecord(projection),published:null});
    const localCurrent=await getLatestCompleted(env.DB,id);if(localCurrent)return json({current:localCurrent,published:localCurrent});
    throw new DomainError("record_missing","Record not found.",404);
  }
  if (url.pathname === "/api/trend" && request.method === "GET") return json({points:await trend(env.DB,url)});
  if (url.pathname === "/api/history-batch" && request.method === "GET") {
    const formKey=url.searchParams.get("formKey"); if(!formKey) throw new DomainError("history_args","formKey is required.");
    const form=getForm(formKey); if(!form) throw new DomainError("unknown_form","Unknown form.");
    const observationSource=form.schedule==="derived"
      ? `SELECT field_key,projection_id AS aggregate_id,plant_date,measured_at,numeric_value FROM derived_numeric_observations WHERE form_key=? AND is_current=1`
      : `SELECT field_key,aggregate_id,plant_date,measured_at,numeric_value FROM numeric_observations WHERE form_key=? AND is_published=1`;
    const res=await env.DB.prepare(`SELECT field_key,aggregate_id,plant_date,measured_at,numeric_value FROM (SELECT field_key,aggregate_id,plant_date,measured_at,numeric_value,ROW_NUMBER() OVER(PARTITION BY field_key ORDER BY measured_at DESC) rn FROM (${observationSource})) WHERE rn<=5 ORDER BY field_key,measured_at DESC`).bind(formKey).all<any>();
    const history:Record<string,any[]>={}; for(const row of res.results??[])(history[row.field_key]??=[]).push(row); return json({history});
  }
  if (url.pathname === "/api/attention" && request.method === "GET") {
    const res=await env.DB.prepare(`SELECT * FROM attention_items WHERE resolved_at IS NULL ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,created_at DESC LIMIT 200`).all(); return json({items:res.results??[]});
  }
  if (url.pathname === "/api/backups/status" && request.method === "GET") return json({generations:await backupStatus(env.DB,url.searchParams.get("date")??undefined)});
  if (url.pathname === "/api/backups/run" && request.method === "POST") {
    const body=await readJson(request) as {plantDate?:string}; const plantDate=body.plantDate??previousTorontoDate();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(plantDate)) throw new DomainError("backup_date","plantDate must be YYYY-MM-DD.");
    const instance=await env.BACKUP_WORKFLOW.create({id:`backup-${plantDate}-${crypto.randomUUID().slice(0,8)}`,params:{plantDate,reason:"manual"},retention:{successRetention:"7 days",errorRetention:"30 days"}});
    return json({accepted:true,plantDate,workflowInstanceId:instance.id,status:await instance.status()},{status:202});
  }
  if (url.pathname.startsWith("/api/backups/workflow/") && request.method === "GET") { const id=decodeURIComponent(url.pathname.split("/").pop()!); const instance=await env.BACKUP_WORKFLOW.get(id); return json(await instance.status()); }
  if (url.pathname === "/api/ai/extract" && request.method === "POST") return json(await aiExtract(request,env));
  if (url.pathname === "/api/export" && request.method === "GET") { const formKey=url.searchParams.get("formKey"); if(!formKey) throw new DomainError("export_args","formKey is required."); return exportCsv(env.DB,formKey); }
  return fail("API route not found.",404,"not_found");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) return await api(request,env,ctx);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof DomainError) return fail(error.message,error.status,error.code,error.details);
      console.error(error); return fail("Unexpected server error.",500,"server_error",String(error));
    }
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    const instance = await env.BACKUP_WORKFLOW.create({
      id: `backup-cron-${controller.scheduledTime}`,
      params: { reason: "scheduled", scheduledAt },
      retention: { successRetention: "7 days", errorRetention: "30 days" },
    });
    console.log("Scheduled backup workflow created", instance.id, scheduledAt);
  }
} satisfies ExportedHandler<Env>;
