import { allFields, getForm } from "../shared/forms";
import { buildAiCapturePrompt, normalizeAiCaptureResponse } from "./domain/aiCapture";
import { APP_SCHEMA_VERSION, PROTOCOL_VERSION, nextCalendarDate } from "../shared/safetyContract";
import type { CanonicalRecord, OperatorRecord, Values } from "../shared/types";
import { backupStatus, previousTorontoDate } from "./domain/backup";
import { processCommand } from "./domain/commands";
import { recomputeDerivedDate } from "./domain/derivations";
import { DomainError } from "./domain/validation";
import { openAttention } from "./domain/db";
import { getRevisionHistory } from "./domain/records";
import { getLatestCompleted, listLatestCompleted, upsertCompletedRecord } from "./domain/localFirst";
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

async function trend(db: D1Database, url: URL) {
  const formKey = url.searchParams.get("formKey");
  const fieldKey = url.searchParams.get("fieldKey");
  const before = url.searchParams.get("before");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));
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
      const measuredAt = record.timeSlot ? `${record.date}T${record.timeSlot}:00` : record.shift === "Day" ? `${record.date}T12:00:00` : `${record.date}T23:59:00`;
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
  const fields = allFields(form).map((f)=>f.key);
  const headers = ["aggregateId","revision","date","timeSlot","shift","boilerNumber","operator","status",...fields];
  const lines = [headers.join(",")];
  for (const r of records) lines.push(headers.map((h)=>csvEscape(h in r ? (r as any)[h] : r.values[h])).join(","));
  return new Response(lines.join("\r\n"), { headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${formKey}.csv"`} });
}

async function aiExtract(request: Request, env: Env) {
  if (!env.GEMINI_API_KEY) throw new DomainError("ai_not_configured", "GEMINI_API_KEY is not configured.", 503);
  const body = await readJson(request) as { imageBase64?:string; mimeType?:string };
  if (!body.imageBase64 || body.imageBase64.length > 9_000_000) throw new DomainError("image_invalid", "A compressed image under approximately 6 MB is required.");
  const prompt = buildAiCapturePrompt();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const response = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt},{inlineData:{mimeType:body.mimeType ?? "image/jpeg",data:body.imageBase64}}]}],generationConfig:{responseMimeType:"application/json",temperature:0}})});
  const raw:any = await response.json().catch(()=>null);
  if (!response.ok) throw new DomainError("ai_error", `Gemini returned HTTP ${response.status}.`, 502, raw);
  const text = raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text ?? "").join("") ?? "{}";
  let parsed:any; try { parsed=JSON.parse(text); } catch { throw new DomainError("ai_parse", "Gemini did not return valid JSON.", 502); }
  return normalizeAiCaptureResponse(parsed);
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null,{status:204});
  if (url.pathname === "/api/meta" && request.method === "GET") return json({ protocolVersion:PROTOCOL_VERSION,schemaVersion:APP_SCHEMA_VERSION,serverTime:new Date().toISOString(),plantTimeZone:env.PLANT_TIME_ZONE,backupContractVersion:"ecc-backup-v2" });
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
  if (url.pathname === "/api/commands" && request.method === "POST") {
    const raw=await readJson(request); const receipt=await processCommand(env.DB,raw);
    if ((receipt.outcome === "accepted" || receipt.outcome === "duplicate") && (raw as any).formKey === "integrator-readings" && receipt.publishedRevision === receipt.revision) {
      // Command acceptance is the reliability boundary. Derivation is intentionally after-response work: the
      // command transaction has already marked every affected projection stale and dirtied the backup dates.
      // A derivation failure therefore cannot turn an accepted Form 8 submission into a client-visible failure.
      const dates = receipt.derivedDates?.length ? receipt.derivedDates : [(raw as any).context.date];
      ctx.waitUntil((async()=>{
        for (const date of dates) {
          try { await recomputeDerivedDate(env.DB,date); }
          catch (error) {
            console.error("Derived projection refresh failed", date, error);
            await openAttention(env.DB,{plantDate:date,category:"derivation",code:"projection_refresh_failed",severity:"error",message:"Form 5/Form 6 recalculation failed after an accepted Form 8 revision. The source revision remains safe; retry derivation from System/backup workflow.",details:{error:String(error)}}).catch(()=>undefined);
          }
        }
      })());
    }
    return json(receipt);
  }
  if (url.pathname === "/api/completed" && request.method === "POST") {
    const payload=await readJson(request);
    const result=await upsertCompletedRecord(env.DB,payload);
    if(result.outcome==="accepted" && result.record.formKey==="integrator-readings"){
      const dates=new Set(result.affectedDates??[result.record.date,nextCalendarDate(result.record.date,1)]);
      ctx.waitUntil((async()=>{for(const date of dates){try{await recomputeDerivedDate(env.DB,date);}catch(error){console.error("Local-first projection refresh failed",date,error);await openAttention(env.DB,{plantDate:date,category:"derivation",code:"projection_refresh_failed",severity:"error",message:"Form 5/Form 6 recalculation failed after a completed Form 8 upload.",details:{error:String(error)}}).catch(()=>undefined);}}})());
    }
    return json(result);
  }
  if (url.pathname === "/api/records" && request.method === "GET") return json({records:await listRecords(env.DB,url)});
  const recordHistoryMatch=url.pathname.match(/^\/api\/records\/([^/]+)\/history$/);
  if(recordHistoryMatch && request.method === "GET"){const id=decodeURIComponent(recordHistoryMatch[1]);return json({revisions:await getRevisionHistory(env.DB,id)});}
  if (url.pathname.startsWith("/api/records/") && request.method === "GET") {
    const id=decodeURIComponent(url.pathname.split("/").pop()!);
    const projection=await env.DB.prepare(`SELECT * FROM derived_projections WHERE projection_id=?`).bind(id).first<any>();
    if(projection) return json({current:{aggregateId:projection.projection_id,formKey:projection.form_key,revision:Number(projection.revision),publishedRevision:Number(projection.revision),lifecycle:projection.status==="current"?"completed":"draft",contextKey:projection.plant_date,operatorId:null,operator:"System",date:projection.plant_date,shift:null,timeSlot:null,boilerNumber:null,values:JSON.parse(projection.effective_values_json),provenance:{status:projection.status,sourceRevisions:JSON.parse(projection.source_revisions_json),warnings:JSON.parse(projection.warnings_json)},createdAt:projection.created_at,updatedAt:projection.updated_at},published:null});
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
