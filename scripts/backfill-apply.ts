// @ts-nocheck
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_FORM_COUNTS, DRY_RUN_VERSION, FORCED_PUMP_SOURCE_AGGREGATE_ID, SOURCE_DATABASE, TARGET_DATABASE, type CandidateRecord } from "./backfill-dry-run.ts";
import { allFields, getForm } from "../shared/forms.ts";
import { deriveForm8OatExtrema } from "../shared/form8Oat.ts";
import { calculateForm5And6, DERIVED_FORMULA_VERSION } from "../shared/formulas.ts";
import { stableStringify } from "../worker/domain/hash.ts";

export const APPLY_TOOL_VERSION = "1.0.0";
export const REQUIRED_MIGRATION = "0002_numeric_observations.sql";
const BASELINE_MIGRATION = "0001_canonical_baseline.sql";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const SOURCE_QUERY = "SELECT * FROM latest_completed_records ORDER BY form_key, plant_date, context_key, aggregate_id";
const TARGET_OWNER_QUERY = "SELECT canonical_id,form_key,context_key FROM canonical_records ORDER BY form_key,context_key,canonical_id";
const LEGACY_TABLE_NAMES = ["latest_completed_records", "aggregates", "revisions", "command_receipts", "context_claims"];

export function auditKey(manifestHash: string) { return "backfill_canonical_manifest_" + manifestHash; }
export function classifyExistingApply(markerValue: unknown, manifestHash: string) {
  if (!markerValue) return "ready";
  let marker: any;
  try { marker = JSON.parse(String(markerValue)); } catch { throw new Error("Existing backfill audit marker is not valid JSON; refusing to continue."); }
  if (marker.manifest_hash !== manifestHash) throw new Error("Existing backfill audit marker does not match the approved manifest; refusing to continue.");
  return "already-applied";
}
function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function sql(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function jsonSql(value: unknown) { return sql(stableStringify(value)); }
function nextCalendarDate(date: string, delta: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
}
function shiftMeasuredAt(date: string, shift: string | null) { return date + "T" + (shift === "Extra" ? "06:00:00" : shift === "Day" ? "12:00:00" : "23:59:00"); }
function projectionId(formKey: string, date: string) {
  const form = getForm(formKey)!;
  return "F" + String(form.number).padStart(2, "0") + "-" + date;
}
function resultSets(response: unknown): Array<Record<string, unknown>> {
  const sets = Array.isArray(response) ? response : [response];
  return sets.flatMap((set: any) => Array.isArray(set?.results) ? set.results : Array.isArray(set?.result) ? set.result.flatMap((item: any) => item?.results ?? []) : []);
}
function oneRow(response: unknown) { return resultSets(response)[0] ?? {}; }
function runWrangler(args: string[], json = false) {
  const full = [...args, "--config", "wrangler.canonical.jsonc", ...(json ? ["--json"] : [])];
  return execFileSync(process.execPath, [WRANGLER, ...full], { cwd: ROOT, encoding: "utf8", shell: false, stdio: ["inherit", "pipe", "pipe"] });
}
function runWranglerJson(args: string[]) { return JSON.parse(runWrangler(args, true)); }

type Manifest = {
  version: string; mode: string; manifest_sha256: string;
  source: { database: string; table: string; query_sha256: string };
  target: { database: string; table: string; observed_row_count: number };
  counts: { candidates: number; sourceTotal: number; eligibleRows: number; excludedRows: number; sourceByForm: Record<string, number>; dispositionCounts: Record<string, number>; targetCollisions: number };
  files: { records_ndjson_sha256: string; anomalies_csv_sha256: string };
  policy: Record<string, unknown>;
};

function loadManifest(manifestPath: string) {
  const artifactDir = dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const recordsText = readFileSync(join(artifactDir, "records.ndjson"), "utf8");
  const anomaliesText = readFileSync(join(artifactDir, "anomalies.csv"), "utf8");
  const candidates = recordsText.trim() ? recordsText.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  validateManifest(manifest, candidates, recordsText, anomaliesText);
  return { manifest, candidates, artifactDir };
}

export function validateManifest(manifest: Manifest, candidates: CandidateRecord[], recordsText: string, anomaliesText: string) {
  if (manifest.mode !== "approved-dry-run") throw new Error("Apply requires an approved-dry-run manifest.");
  if (manifest.version !== DRY_RUN_VERSION) throw new Error("Manifest version does not match the current dry-run tool.");
  const supplied = manifest.manifest_sha256;
  const core = { ...manifest } as any;
  delete core.manifest_sha256;
  if (sha256(stableStringify(core)) !== supplied) throw new Error("Manifest hash does not match its contents.");
  if (sha256(recordsText) !== manifest.files.records_ndjson_sha256 || sha256(anomaliesText) !== manifest.files.anomalies_csv_sha256) throw new Error("Manifest artifact hash mismatch.");
  if (manifest.source.database !== SOURCE_DATABASE || manifest.target.database !== TARGET_DATABASE || manifest.target.observed_row_count !== 0) throw new Error("Manifest source/target identity or empty-target assertion is invalid.");
  if (candidates.length !== 46 || manifest.counts.candidates !== 46 || manifest.counts.eligibleRows !== 46 || manifest.counts.sourceTotal !== 64 || manifest.counts.excludedRows !== 18) throw new Error("Approved manifest must contain exactly 46 candidates from the expected 64-row source snapshot.");
  const disposition = manifest.counts.dispositionCounts;
  if ((disposition.ready ?? 0) !== 46 || (disposition.ready_with_warnings ?? 0) !== 0 || (disposition.blocked ?? 0) !== 0 || (disposition.collision ?? 0) !== 0 || manifest.counts.targetCollisions !== 0) throw new Error("Approved manifest has warnings, blocked rows, or collisions.");
  for (const [formKey, count] of Object.entries(APPROVED_FORM_COUNTS)) if (manifest.counts.sourceByForm[formKey] !== count) throw new Error("Approved manifest count mismatch for " + formKey + ".");
  const forced = candidates.find((candidate) => candidate.source_identity.includes(FORCED_PUMP_SOURCE_AGGREGATE_ID));
  if (!forced || forced.values.pump_sp_st?.first !== 75 || forced.values.pump_sp_st?.second !== 60) throw new Error("Approved forced Pump Sp/St candidate is missing or incorrect.");
  const slots = ["03:00", "07:00", "11:00", "15:00", "19:00", "23:00"];
  if (candidates.some((candidate) => (candidate.form_key === "yst-yk-chiller" || candidate.form_key === "gas-turbine-log-sheet") && !slots.includes(candidate.time_slot))) throw new Error("Approved slot mapping contains a non-canonical time slot.");
}

function measuredAt(candidate: CandidateRecord) { return candidate.time_slot ? candidate.plant_date + "T" + candidate.time_slot + ":00" : shiftMeasuredAt(candidate.plant_date, candidate.shift); }
function numericRows(candidates: CandidateRecord[]) {
  const rows: any[] = [];
  for (const candidate of candidates) {
    const fields = new Map(allFields(getForm(candidate.form_key)!).map((field) => [field.key, field]));
    for (const [fieldKey, value] of Object.entries(candidate.values)) {
      const field = fields.get(fieldKey);
      if (field?.showHistory === false || (field?.trendable === false && field.type !== "paired-number")) continue;
      if (typeof value === "number" && Number.isFinite(value)) rows.push({ aggregate_id: candidate.canonical_id, form_key: candidate.form_key, field_key: fieldKey, plant_date: candidate.plant_date, measured_at: measuredAt(candidate), numeric_value: value });
      else if (value && typeof value === "object" && "first" in value && "second" in value) for (const part of ["first", "second"]) if (typeof value[part] === "number" && Number.isFinite(value[part])) rows.push({ aggregate_id: candidate.canonical_id, form_key: candidate.form_key, field_key: fieldKey + ":" + part, plant_date: candidate.plant_date, measured_at: measuredAt(candidate), numeric_value: value[part] });
    }
  }
  return rows;
}
function sourceRef(candidate: CandidateRecord) { return { aggregateId: candidate.canonical_id, revisionId: candidate.canonical_id + "@r1", revision: 1, plantDate: candidate.plant_date }; }
function projectionRows(candidates: CandidateRecord[], appliedAt: string) {
  const form8 = new Map(candidates.filter((candidate) => candidate.form_key === "integrator-readings").map((candidate) => [candidate.plant_date, candidate]));
  const form9 = candidates.filter((candidate) => candidate.form_key === "gas-turbine-log-sheet");
  const dates = new Set<string>();
  for (const date of form8.keys()) { dates.add(date); dates.add(nextCalendarDate(date, 1)); }
  const rows: any[] = [];
  for (const plantDate of [...dates].sort()) {
    const previousDate = nextCalendarDate(plantDate, -1);
    const current = form8.get(plantDate);
    const previous = form8.get(previousDate);
    const calculated = calculateForm5And6({ currentValues: current?.values ?? {}, previousValues: previous?.values ?? {}, currentDate: plantDate, previousDate, hasCurrent: Boolean(current), hasPrevious: Boolean(previous) });
    const oatRecords = form9.filter((candidate) => candidate.plant_date === plantDate).map((candidate) => ({ date: candidate.plant_date, timeSlot: candidate.time_slot, values: candidate.values, status: "completed", lifecycle: "completed" }));
    const extrema = deriveForm8OatExtrema(oatRecords, plantDate, "oat_memorial");
    const form5 = { ...calculated.form5, oat_high: extrema.status === "ready" ? extrema.values.oat_high ?? null : null, oat_low: extrema.status === "ready" ? extrema.values.oat_low ?? null : null };
    const refs = [...(previous ? [sourceRef(previous)] : []), ...(current ? [sourceRef(current)] : [])];
    const form5Refs = [...refs, ...form9.filter((candidate) => candidate.plant_date === plantDate).sort((a, b) => (a.time_slot + ":" + a.canonical_id).localeCompare(b.time_slot + ":" + b.canonical_id)).map(sourceRef)];
    rows.push({ projection_id: projectionId("daily-consumption-totals", plantDate), form_key: "daily-consumption-totals", plant_date: plantDate, status: calculated.status, formula_version: DERIVED_FORMULA_VERSION, source_revisions_json: form5Refs, base_values: form5, effective_values: form5, warnings: calculated.warnings, updated_at: appliedAt });
    rows.push({ projection_id: projectionId("makeup", plantDate), form_key: "makeup", plant_date: plantDate, status: calculated.status, formula_version: DERIVED_FORMULA_VERSION, source_revisions_json: refs, base_values: calculated.form6, effective_values: calculated.form6, warnings: calculated.warnings, updated_at: appliedAt });
  }
  return rows;
}

export function buildApplySql(candidates: CandidateRecord[], manifestHash: string, sourceHash: string, appliedAt: string) {
  if (candidates.length !== 46) throw new Error("Apply SQL requires exactly 46 candidates.");
  const statements: string[] = [];
  for (const candidate of candidates) statements.push("INSERT OR IGNORE INTO canonical_records(canonical_id,form_key,form_version,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,generation,revision,created_at,updated_at,client_updated_at) VALUES(" + [candidate.canonical_id, candidate.form_key, candidate.target_form_version, candidate.context_key, candidate.operator_id, candidate.operator_name, candidate.plant_date, candidate.shift, candidate.time_slot, candidate.boiler_number, stableStringify(candidate.values), 1, 1, candidate.created_at, candidate.updated_at, candidate.client_updated_at].map(sql).join(",") + ");");
  for (const row of numericRows(candidates)) statements.push("INSERT OR IGNORE INTO numeric_observations(aggregate_id,form_key,field_key,plant_date,measured_at,numeric_value,is_published) VALUES(" + [row.aggregate_id, row.form_key, row.field_key, row.plant_date, row.measured_at, row.numeric_value, 1].map(sql).join(",") + ");");
  const projections = projectionRows(candidates, appliedAt);
  for (const projection of projections) {
    statements.push("INSERT OR IGNORE INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json,created_at,updated_at) VALUES(" + [projection.projection_id, projection.form_key, projection.plant_date, 1, projection.status, projection.formula_version, stableStringify(projection.source_revisions_json), stableStringify(projection.base_values), stableStringify(projection.effective_values), stableStringify(projection.warnings), appliedAt, appliedAt].map(sql).join(",") + ");");
    const trendable = new Set(allFields(getForm(projection.form_key)!).filter((field) => field.trendable).map((field) => field.key));
    for (const [fieldKey, value] of Object.entries(projection.effective_values)) if (trendable.has(fieldKey) && typeof value === "number" && Number.isFinite(value)) statements.push("INSERT OR IGNORE INTO derived_numeric_observations(projection_id,projection_revision,form_key,field_key,plant_date,measured_at,numeric_value,is_current) VALUES(" + [projection.projection_id, 1, projection.form_key, fieldKey, projection.plant_date, projection.plant_date + "T23:59:00", value, 1].map(sql).join(",") + ");");
  }
  const dirtyDates = new Set(candidates.map((candidate) => candidate.plant_date));
  for (const projection of projections) dirtyDates.add(projection.plant_date);
  for (const date of [...dirtyDates].sort()) statements.push("INSERT INTO backup_dirty_dates(plant_date,reason,first_dirty_at,last_dirty_at) VALUES(" + [date, "Canonical backfill imported records and regenerated projections", appliedAt, appliedAt].map(sql).join(",") + ") ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=excluded.last_dirty_at;");
  const marker = { source_database: SOURCE_DATABASE, target_database: TARGET_DATABASE, source_hash: sourceHash, manifest_hash: manifestHash, count: candidates.length, tool_version: APPLY_TOOL_VERSION, applied_at: appliedAt };
  statements.push("INSERT OR IGNORE INTO app_metadata(key,value,updated_at) VALUES(" + [auditKey(manifestHash), stableStringify(marker), appliedAt].map(sql).join(",") + ");");
  statements.push("UPDATE app_metadata SET value='false',updated_at=" + sql(appliedAt) + " WHERE key='fresh_database';");
  return statements.join("\n") + "\n";
}

function verifySql() {
  return "SELECT COUNT(*) AS canonical_records FROM canonical_records;\n" +
    "SELECT form_key,COUNT(*) AS count FROM canonical_records GROUP BY form_key ORDER BY form_key;\n" +
    "SELECT time_slot,COUNT(*) AS count FROM canonical_records WHERE form_key IN ('yst-yk-chiller','gas-turbine-log-sheet') GROUP BY time_slot ORDER BY time_slot;\n" +
    "SELECT COUNT(*) AS excluded_slots FROM canonical_records WHERE form_key IN ('yst-yk-chiller','gas-turbine-log-sheet') AND time_slot IN ('00:00','04:00','08:00','12:00','16:00','20:00');\n" +
    "SELECT COUNT(*) AS numeric_observations FROM numeric_observations;\nSELECT COUNT(*) AS derived_projections FROM derived_projections;\nSELECT COUNT(*) AS derived_numeric_observations FROM derived_numeric_observations;\n" +
    "SELECT COUNT(*) AS legacy_tables FROM sqlite_master WHERE type='table' AND name IN (" + LEGACY_TABLE_NAMES.map(sql).join(",") + ");\n" +
    "SELECT COUNT(*) AS oat_persisted FROM canonical_records WHERE form_key='integrator-readings' AND (json_type(values_json,'$.oat_high') IS NOT NULL OR json_type(values_json,'$.oat_low') IS NOT NULL);\n" +
    "SELECT COUNT(*) AS retired_gas_persisted FROM canonical_records WHERE form_key='gas-turbine-log-sheet' AND (json_type(values_json,'$.gas_fuel_inlet_pressure') IS NOT NULL OR json_type(values_json,'$.gas_fuel_supply_pressure') IS NOT NULL);\n" +
    "SELECT field_key,COUNT(*) AS count FROM numeric_observations WHERE field_key IN ('p_alk','m_alk','oh_alk') GROUP BY field_key ORDER BY field_key;\n" +
    "SELECT canonical_id,values_json FROM canonical_records WHERE canonical_id IN ('F01-2026-09-05-1','F02-2026-09-02-1-2') ORDER BY canonical_id;";
}
function verifyExpected(response: unknown, scope: string) {
  const rows = resultSets(response);
  const find = (key: string) => rows.find((row) => key in row);
  const count = (key: string) => Number(find(key)?.[key] ?? -1);
  if (count("canonical_records") !== 46 || count("excluded_slots") !== 0 || count("oat_persisted") !== 0 || count("retired_gas_persisted") !== 0 || count("legacy_tables") !== 0) throw new Error(scope + ": canonical/exclusion verification failed.");
  if (count("numeric_observations") <= 0 || count("derived_projections") !== 12 || count("derived_numeric_observations") <= 0) throw new Error(scope + ": numeric/projection verification failed.");
  const formCounts = rows.filter((row) => "form_key" in row).map((row) => row.form_key + ":" + row.count).sort();
  const expected = Object.entries(APPROVED_FORM_COUNTS).map(([key, value]) => key + ":" + value).sort();
  if (JSON.stringify(formCounts) !== JSON.stringify(expected)) throw new Error(scope + ": per-form counts do not match the approved selection.");
  const timeRows = rows.filter((row) => "time_slot" in row);
  const allowedSlots = new Set(["03:00", "07:00", "11:00", "15:00", "19:00", "23:00"]);
  if (timeRows.some((row) => !allowedSlots.has(String(row.time_slot))) || timeRows.reduce((sum, row) => sum + Number(row.count), 0) !== 20) throw new Error(scope + ": Form 3/Form 9 slots are not exactly the approved six canonical slots.");
  const rawIndexRows = rows.filter((row) => "field_key" in row);
  if (rawIndexRows.length !== 3 || rawIndexRows.some((row) => Number(row.count) <= 0)) throw new Error(scope + ": Form 2 numeric fields were not indexed.");
  const special = rows.filter((row) => "canonical_id" in row);
  const pump = JSON.parse(String(special.find((row) => row.canonical_id === "F01-2026-09-05-1")?.values_json ?? "{}"));
  if (pump.pump_sp_st?.first !== 75 || pump.pump_sp_st?.second !== 60) throw new Error(scope + ": forced Pump Sp/St value is incorrect.");
  const form2 = JSON.parse(String(special.find((row) => row.canonical_id === "F02-2026-09-02-1-2")?.values_json ?? "{}"));
  if (form2.p_alk !== 652 || form2.m_alk !== 732 || form2.oh_alk !== 572 || "p_alk_burette" in form2 || "m_alk_burette" in form2) throw new Error(scope + ": Form 2 direct P/M reconstruction is incorrect.");
  return { scope, rows };
}
export function runLocalSmoke(sqlText: string, outputDir: string) {
  const persist = mkdtempSync(join(tmpdir(), "ecc-canonical-backfill-"));
  try {
    const sqlPath = join(outputDir, "apply.sql");
    writeFileSync(sqlPath, sqlText, "utf8");
    runWrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", persist]);
    runWrangler(["d1", "execute", "DB", "--local", "--persist-to", persist, "--file", sqlPath]);
    const verification = runWranglerJson(["d1", "execute", "DB", "--local", "--persist-to", persist, "--command", verifySql()]);
    verifyExpected(verification, "disposable local canonical D1");
    writeFileSync(join(outputDir, "local-verification.json"), JSON.stringify(verification, null, 2) + "\n", "utf8");
    return verification;
  } finally { rmSync(persist, { recursive: true, force: true }); }
}
function migrationGate() {
  const rows = resultSets(runWranglerJson(["d1", "execute", "DB", "--remote", "--command", "SELECT name FROM d1_migrations ORDER BY id"]));
  const names = new Set(rows.map((row) => String(row.name)));
  if (!names.has(BASELINE_MIGRATION)) throw new Error("Canonical baseline migration is not applied; refusing unrelated migrations.");
  if (names.has(REQUIRED_MIGRATION)) return { applied: false, names: [...names] };
  const localMigrationFiles = readdirSync(join(ROOT, "migrations-canonical")).filter((name) => name.endsWith(".sql"));
  if (localMigrationFiles.some((name) => ![BASELINE_MIGRATION, REQUIRED_MIGRATION].includes(name))) throw new Error("Additional canonical migrations are present locally; refusing to apply anything besides the required numeric-observations migration.");
  if ([...names].some((name) => name !== BASELINE_MIGRATION)) throw new Error("Canonical migration history contains an unexpected migration; refusing to apply.");
  runWrangler(["d1", "migrations", "apply", "DB", "--remote"]);
  const after = new Set(resultSets(runWranglerJson(["d1", "execute", "DB", "--remote", "--command", "SELECT name FROM d1_migrations ORDER BY id"])).map((row) => String(row.name)));
  if (!after.has(REQUIRED_MIGRATION)) throw new Error("Required numeric-observations migration did not apply.");
  return { applied: true, names: [...after] };
}
function remoteVerification(manifestHash: string) {
  const response = runWranglerJson(["d1", "execute", "DB", "--remote", "--command", verifySql() + "\nSELECT key,value FROM app_metadata WHERE key=" + sql(auditKey(manifestHash)) + ";"]);
  verifyExpected(response, "remote canonical D1");
  if (!resultSets(response).some((row) => row.key === auditKey(manifestHash))) throw new Error("Remote audit marker is missing.");
  return response;
}

export function applyManifest(manifestPath: string) {
  const loaded = loadManifest(manifestPath);
  const manifest = loaded.manifest;
  const candidates = loaded.candidates;
  const applyTimestamp = new Date().toISOString();
  const outputDir = join(ROOT, "outputs", "backfill-apply", applyTimestamp.replace(/[-:.TZ]/g, "").slice(0, 14));
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "final-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const sqlText = buildApplySql(candidates, manifest.manifest_sha256, manifest.source.query_sha256, applyTimestamp);
  const localVerification = runLocalSmoke(sqlText, outputDir);
  const marker = oneRow(runWranglerJson(["d1", "execute", "DB", "--remote", "--command", "SELECT value FROM app_metadata WHERE key=" + sql(auditKey(manifest.manifest_sha256))]));
  if (classifyExistingApply(marker.value, manifest.manifest_sha256) === "already-applied") {
    const verification = remoteVerification(manifest.manifest_sha256);
    writeFileSync(join(outputDir, "verification.json"), JSON.stringify(verification, null, 2) + "\n", "utf8");
    writeFileSync(join(outputDir, "applied-ids.json"), JSON.stringify({ status: "already-applied", manifest_hash: manifest.manifest_sha256, ids: candidates.map((candidate) => candidate.canonical_id) }, null, 2) + "\n", "utf8");
    writeFileSync(join(outputDir, "REPORT.md"), "# Canonical backfill apply\n\n- Status: already-applied\n- Remote mutation: none; the durable audit marker already exists.\n- Local disposable verification: passed\n- Remote post-check: passed\n", "utf8");
    return { status: "already-applied", outputDir, localVerification, migration: { applied: false, names: [] } };
  }
  const source = resultSets(runWranglerJson(["d1", "execute", SOURCE_DATABASE, "--remote", "--command", SOURCE_QUERY]));
  if (sha256(stableStringify(source)) !== manifest.source.query_sha256) throw new Error("Source manifest hash changed since the approved manifest was generated; refusing remote import.");
  const target = resultSets(runWranglerJson(["d1", "execute", "DB", "--remote", "--command", TARGET_OWNER_QUERY]));
  if (target.length !== 0) throw new Error("Canonical target is no longer empty; refusing remote import.");
  const migration = migrationGate();
  if (Number(oneRow(runWranglerJson(["d1", "execute", "DB", "--remote", "--command", "SELECT COUNT(*) AS count FROM canonical_records"])).count) !== 0) throw new Error("Canonical target became non-empty during migration gate; refusing remote import.");
  const sqlPath = join(outputDir, "apply.sql");
  writeFileSync(sqlPath, sqlText, "utf8");
  runWrangler(["d1", "execute", "DB", "--remote", "--file", sqlPath]);
  const verification = remoteVerification(manifest.manifest_sha256);
  writeFileSync(join(outputDir, "verification.json"), JSON.stringify(verification, null, 2) + "\n", "utf8");
  writeFileSync(join(outputDir, "applied-ids.json"), JSON.stringify({ status: "applied", manifest_hash: manifest.manifest_sha256, ids: candidates.map((candidate) => candidate.canonical_id) }, null, 2) + "\n", "utf8");
  writeFileSync(join(outputDir, "REPORT.md"), "# Canonical backfill apply\n\n- Status: applied\n- Source rows verified immediately before import: " + source.length + "\n- Canonical records inserted: 46\n- Numeric observations generated: " + numericRows(candidates).length + "\n- Derived Form 5/6 projections regenerated: " + projectionRows(candidates, applyTimestamp).length + "\n- Remote mutations: canonical records, numeric observations, projections, derived numeric observations, backup-dirty dates, fresh_database metadata, and audit marker.\n- Migration mutation: " + (migration.applied ? "0002_numeric_observations.sql only" : "none; already applied") + "\n- Local disposable verification: passed\n- Remote post-import verification: passed\n", "utf8");
  return { status: "applied", outputDir, localVerification, migration, verification };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifestPath = process.argv[2];
  if (!manifestPath) { console.error("Usage: node --experimental-strip-types scripts/backfill-apply.ts <approved-manifest.json>"); process.exitCode = 2; }
  else try { console.log(JSON.stringify(applyManifest(manifestPath), null, 2)); } catch (error) { console.error(String(error instanceof Error ? error.message : error)); process.exitCode = 2; }
}
