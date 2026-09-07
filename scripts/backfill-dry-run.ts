// @ts-nocheck
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { allFields, getForm } from "../shared/forms.ts";
import type { FieldDefinition, FormDefinition, Values } from "../shared/types.ts";
import { stableStringify } from "../worker/domain/hash.ts";

export const DRY_RUN_VERSION = "2.0.0";
export const SOURCE_DATABASE = "ecc-operator-v1-production";
export const TARGET_DATABASE = "ecc-operator-v1-canonical";
export const IMPORTABLE_FORM_KEYS = [
  "ecc-cooling-tower-water-control-tests",
  "boiler-water-control-tests",
  "yst-yk-chiller",
  "boiler-water-pretreatment-condensate-tests",
  "integrator-readings",
  "gas-turbine-log-sheet",
] as const;

const CURRENT_TIME_SLOTS = new Set(["03:00", "07:00", "11:00", "15:00", "19:00", "23:00"]);
export const APPROVED_LEGACY_SLOTS = ["02:00", "06:00", "10:00", "14:00", "18:00", "22:00"] as const;
export const APPROVED_SLOT_MAP: Record<string, string> = {
  "02:00": "03:00", "06:00": "07:00", "10:00": "11:00",
  "14:00": "15:00", "18:00": "19:00", "22:00": "23:00",
};
const APPROVED_SLOT_SET = new Set<string>(APPROVED_LEGACY_SLOTS);
export const APPROVED_FORM_COUNTS: Record<string, number> = {
  "ecc-cooling-tower-water-control-tests": 6,
  "boiler-water-control-tests": 6,
  "yst-yk-chiller": 10,
  "boiler-water-pretreatment-condensate-tests": 9,
  "integrator-readings": 5,
  "gas-turbine-log-sheet": 10,
};
export const FORCED_PUMP_SOURCE_AGGREGATE_ID = "c8911f6a-db6a-45da-a451-67a2ba4d4d87";
const FORM2_DROPPED_KEYS = new Set(["oh_alk", "steam_total", "makeup_total"]);
const FORM8_DROPPED_KEYS = new Set(["oat_high", "oat_low"]);
const FORM9_DROPPED_KEYS = new Set(["gas_fuel_inlet_pressure", "gas_fuel_supply_pressure"]);
const PUMP_ALIASES = ["pump_sp", "pump_st", "pump_sp_reading", "pump_st_reading"] as const;

export type LegacyRow = Record<string, unknown>;
export type TargetOwner = { canonical_id: string; form_key: string; context_key: string };

export type BackfillAnomaly = {
  source_identity: string;
  form_key: string;
  plant_date: string | null;
  context_key: string | null;
  kind: string;
  field: string;
  source_value_type: string;
  reason: string;
  blocking: boolean;
  disposition: string;
};

export type CandidateRecord = {
  canonical_id: string | null;
  form_key: string;
  target_form_version: number | null;
  context_key: string | null;
  operator_id: string | null;
  operator_name: string | null;
  plant_date: string | null;
  shift: string | null;
  time_slot: string | null;
  boiler_number: number | null;
  created_at: string | null;
  updated_at: string | null;
  client_updated_at: string | null;
  local_revision: number;
  values: Values;
  source_identity: string;
  source_hash: string;
  disposition: "ready" | "ready_with_warnings" | "collision" | "blocked";
  collisions: string[];
};

export type TransformResult = {
  candidates: CandidateRecord[];
  anomalies: BackfillAnomaly[];
  sourceTotal: number;
  eligibleRows: number;
  excludedRows: number;
  excludedByForm: Record<string, number>;
  sourceByForm: Record<string, number>;
  dispositionCounts: Record<string, number>;
  targetCollisions: number;
};

function text(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function sourceValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function dateIsValid(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sourceIdentity(row: LegacyRow): string {
  const aggregate = text(row.aggregate_id) ?? "missing-aggregate-id";
  const form = text(row.form_key) ?? "missing-form-key";
  const context = text(row.context_key) ?? "missing-context-key";
  const revision = text(row.local_revision) ?? "0";
  return `${form}:${aggregate}@local-${revision}:${context}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseValues(row: LegacyRow): Record<string, unknown> | null {
  if (row.values_json && typeof row.values_json === "object" && !Array.isArray(row.values_json)) {
    return row.values_json as Record<string, unknown>;
  }
  if (typeof row.values_json !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(row.values_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function canonicalId(form: FormDefinition, date: string, timeSlot: string | null, shift: string | null, boiler: number | null): string {
  const parts = [`F${String(form.number).padStart(2, "0")}`, date];
  if (form.hasTimeSlot && timeSlot) parts.push(timeSlot.replace(":", ""));
  if (form.hasShift && shift) parts.push(shift === "Night" ? "1" : shift === "Day" ? "2" : "3");
  if (form.hasBoiler && boiler != null) parts.push(String(boiler));
  return parts.join("-");
}

function contextKey(form: FormDefinition, date: string, timeSlot: string | null, shift: string | null, boiler: number | null): string {
  const parts = [date];
  if (form.hasShift && shift) parts.push(`shift=${shift}`);
  if (form.hasTimeSlot && timeSlot) parts.push(`time=${timeSlot}`);
  if (form.hasBoiler && boiler != null) parts.push(`boiler=${boiler}`);
  return parts.join("|");
}

function addAnomaly(
  anomalies: BackfillAnomaly[],
  row: LegacyRow,
  kind: string,
  field: string,
  value: unknown,
  reason: string,
  blocking = false,
  disposition: "pending" | "accepted" = "pending",
) {
  anomalies.push({
    source_identity: sourceIdentity(row),
    form_key: text(row.form_key) ?? "",
    plant_date: text(row.plant_date),
    context_key: text(row.context_key),
    kind,
    field,
    source_value_type: sourceValueType(value),
    reason,
    blocking,
    disposition,
  });
}

function addAcceptedNote(
  anomalies: BackfillAnomaly[], row: LegacyRow, kind: string, field: string, value: unknown, reason: string,
) {
  addAnomaly(anomalies, row, kind, field, value, reason, false, "accepted");
}

function pairValue(value: unknown): { first: number | null; second: number | null } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const first = finiteNumber(value[0]);
    const second = finiteNumber(value[1]);
    return first != null && second != null ? { first, second } : null;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const first = finiteNumber(object.first ?? object.sp);
    const second = finiteNumber(object.second ?? object.st);
    return first != null && second != null ? { first, second } : null;
  }
  if (typeof value === "string") {
    const pieces = value.trim().split(/\s*(?:\/|,|\||;)\s*/);
    if (pieces.length === 2) {
      const first = finiteNumber(pieces[0]);
      const second = finiteNumber(pieces[1]);
      return first != null && second != null ? { first, second } : null;
    }
  }
  return null;
}

function addDirectField(
  values: Values,
  anomalies: BackfillAnomaly[],
  row: LegacyRow,
  field: FieldDefinition,
  value: unknown,
) {
  if (value === null || value === "") {
    values[field.key] = null;
    return;
  }
  if (field.type === "number" || field.type === "computed") {
    const parsed = finiteNumber(value);
    if (parsed == null) {
      addAnomaly(anomalies, row, "conversion", field.key, value, "Numeric source value is missing or non-numeric; field omitted.");
      return;
    }
    values[field.key] = parsed;
    return;
  }
  if (field.type === "duration") {
    const parsed = finiteNumber(value);
    if (parsed == null || parsed < 0 || !Number.isInteger(parsed)) {
      addAnomaly(anomalies, row, "conversion", field.key, value, "Duration source value is not a non-negative whole number; field omitted.");
      return;
    }
    values[field.key] = parsed;
    return;
  }
  if (field.type === "paired-number") {
    const pair = pairValue(value);
    if (!pair) {
      addAnomaly(anomalies, row, "conversion", field.key, value, "Paired numeric source value is not parseable; field omitted.");
      return;
    }
    values[field.key] = pair;
    return;
  }
  if (field.type === "select") {
    if (typeof value !== "string" || !field.options?.some((option) => option.value === value)) {
      addAnomaly(anomalies, row, "conversion", field.key, value, "Selection is not accepted by the current form; field omitted.");
      return;
    }
    values[field.key] = value;
    return;
  }
  if (field.type === "text") {
    if (typeof value !== "string") {
      addAnomaly(anomalies, row, "conversion", field.key, value, "Text source value is not a string; field omitted.");
      return;
    }
    values[field.key] = value;
  }
}

function transformValues(row: LegacyRow, form: FormDefinition, raw: Record<string, unknown>, anomalies: BackfillAnomaly[]): Values {
  const values: Values = {};
  const consumed = new Set<string>();
  const fields = new Map(allFields(form).map((field) => [field.key, field]));

  const consume = (key: string) => consumed.add(key);
  const drop = (key: string, reason: string) => {
    if (key in raw) {
      consume(key);
      addAcceptedNote(anomalies, row, "accepted_omission", key, raw[key], reason);
    }
  };

  if (form.number === 1 && "molybdenum" in raw) {
    consume("molybdenum");
    const mapped = finiteNumber(raw.molybdenum);
    if (mapped == null) addAnomaly(anomalies, row, "conversion", "molybdenum", raw.molybdenum, "Legacy Molybdenum is non-numeric; ptsa omitted.");
    else if ("ptsa" in raw) addAcceptedNote(anomalies, row, "accepted_field_collision", "ptsa", raw.ptsa, "Both legacy molybdenum and ptsa exist; direct ptsa wins.");
    else values.ptsa = mapped;
  }

  if (form.number === 1 && ("pump_sp_st" in raw || PUMP_ALIASES.some((key) => key in raw))) {
    const keys = ["pump_sp_st", ...PUMP_ALIASES].filter((key) => key in raw);
    keys.forEach(consume);
    let pair = "pump_sp_st" in raw ? pairValue(raw.pump_sp_st) : null;
    if (!pair) {
      const sp = raw.pump_sp ?? raw.pump_sp_reading;
      const st = raw.pump_st ?? raw.pump_st_reading;
      pair = finiteNumber(sp) != null && finiteNumber(st) != null
        ? { first: finiteNumber(sp), second: finiteNumber(st) }
        : null;
    }
    if (!pair && text(row.aggregate_id) === FORCED_PUMP_SOURCE_AGGREGATE_ID) {
      values.pump_sp_st = { first: 75, second: 60 };
      addAcceptedNote(anomalies, row, "approved_forced_transform", "pump_sp_st", raw.pump_sp_st, "Approved exception: the formerly unparseable legacy Pump Sp/St candidate is forced to 75/60.");
    } else if (!pair) addAnomaly(anomalies, row, "conversion", "pump_sp_st", raw.pump_sp_st ?? raw.pump_sp, "Legacy Pump Sp/St is not parseable as two numeric readings; field omitted.");
    else values.pump_sp_st = pair;
  }

  if (form.number === 2) {
    for (const key of ["p_alk", "m_alk"]) {
      consume(key);
      const parsed = finiteNumber(raw[key]);
      if (parsed == null) addAnomaly(anomalies, row, "conversion", key, raw[key], `Legacy ${key} is missing or non-numeric; derived burette reading omitted.`);
      else {
        const buretteKey = key === "p_alk" ? "p_alk_burette" : "m_alk_burette";
        values[buretteKey] = parsed / 20;
        values[key] = parsed;
      }
    }
    values.oh_alk = typeof values.p_alk === "number" && typeof values.m_alk === "number"
      ? (values.p_alk * 2) - values.m_alk
      : null;
    for (const key of FORM2_DROPPED_KEYS) drop(key, "Legacy calculated/display-only field is not imported; current rules recompute or derive it.");
  }

  if (form.number === 8) {
    for (const key of FORM8_DROPPED_KEYS) drop(key, "Form 8 OAT extrema are currently derived from Form 9 and are not imported.");
  }

  if (form.number === 9) {
    for (const key of FORM9_DROPPED_KEYS) drop(key, "Retired gas-fuel pressure field is intentionally omitted from the canonical Form 9 record.");
  }

  for (const [key, value] of Object.entries(raw)) {
    if (consumed.has(key)) continue;
    const field = fields.get(key);
    if (!field) {
      if (form.number === 9 && FORM9_DROPPED_KEYS.has(key)) {
        addAcceptedNote(anomalies, row, "accepted_omission", key, value, "Retired gas-fuel pressure field is intentionally omitted from the canonical Form 9 record.");
      } else {
        addAnomaly(anomalies, row, "unknown_field", key, value, "Source field is not accepted by the current form; omitted.");
      }
      consumed.add(key);
      continue;
    }
    if (field.calculated) {
      addAnomaly(anomalies, row, "dropped_field", key, value, "Current form marks this field calculated/display-only; omitted from operational values.");
      consumed.add(key);
      continue;
    }
    addDirectField(values, anomalies, row, field, value);
    consumed.add(key);
  }
  return values;
}

function contextFor(row: LegacyRow, form: FormDefinition, anomalies: BackfillAnomaly[], targetTimeSlot = text(row.time_slot)) {
  const date = text(row.plant_date);
  const shift = text(row.shift);
  const sourceTimeSlot = text(row.time_slot);
  const timeSlot = targetTimeSlot;
  const boilerRaw = row.boiler_number;
  const boiler = boilerRaw == null || boilerRaw === "" ? null : finiteNumber(boilerRaw);
  let blocked = false;

  if (!dateIsValid(date)) {
    addAnomaly(anomalies, row, "invalid_context", "plant_date", row.plant_date, "Plant date is not an ISO date.", true);
    blocked = true;
  }
  if (form.hasShift) {
    if (shift !== "Day" && shift !== "Night" && shift !== "Extra") {
      addAnomaly(anomalies, row, "invalid_context", "shift", row.shift, "Shift must be preserved as Day, Night, or an existing Extra; no shift was invented.", true);
      blocked = true;
    }
  } else if (shift === "Extra") {
    addAnomaly(anomalies, row, "invalid_context", "shift", row.shift, "Extra is not a valid context for a time-slot/daily form and was not invented or remapped.", true);
    blocked = true;
  }
  if (form.hasTimeSlot) {
    if (!timeSlot || !/^\d{2}:\d{2}$/.test(timeSlot)) {
      addAnomaly(anomalies, row, "invalid_context", "time_slot", row.time_slot, "Time slot is not an exact HH:MM string.", true);
      blocked = true;
    } else if (!CURRENT_TIME_SLOTS.has(sourceTimeSlot ?? "")) {
      addAcceptedNote(anomalies, row, "accepted_slot_mapping", "time_slot", sourceTimeSlot, `Approved historical slot ${sourceTimeSlot} is mapped to canonical slot ${timeSlot}.`);
    }
  }
  if (form.hasBoiler && ![2, 3, 4].includes(boiler as number)) {
    addAnomaly(anomalies, row, "invalid_context", "boiler_number", row.boiler_number, "Boiler context must be 2, 3, or 4.", true);
    blocked = true;
  }
  if (!dateIsValid(date)) return { date: null, shift, timeSlot, boiler: boiler == null ? null : boiler, context: null, id: null, blocked };
  const safeBoiler = boiler == null ? null : boiler;
  if (blocked) return { date, shift, timeSlot, boiler: safeBoiler, context: null, id: null, blocked };
  return {
    date,
    shift,
    timeSlot,
    boiler: safeBoiler,
    context: contextKey(form, date, timeSlot, shift, safeBoiler),
    id: canonicalId(form, date, timeSlot, shift, safeBoiler),
    blocked,
  };
}

function targetKey(formKey: string, context: string | null): string {
  return `${formKey}\u0000${context ?? ""}`;
}

export function transformLegacyRows(rows: LegacyRow[], targetOwners: TargetOwner[] = []): TransformResult {
  const candidates: CandidateRecord[] = [];
  const anomalies: BackfillAnomaly[] = [];
  const sourceByForm: Record<string, number> = {};
  const excludedByForm: Record<string, number> = {};
  const targetByContext = new Map(targetOwners.map((owner) => [targetKey(owner.form_key, owner.context_key), owner]));
  const targetById = new Map(targetOwners.map((owner) => [owner.canonical_id, owner]));
  const seenCandidateContext = new Map<string, string>();
  let eligibleRows = 0;
  let excludedRows = 0;
  let targetCollisions = 0;

  for (const row of rows) {
    const formKey = text(row.form_key) ?? "";
    const form = getForm(formKey);
    const sourceSlot = text(row.time_slot);
    const selected = Boolean(form && IMPORTABLE_FORM_KEYS.includes(formKey as typeof IMPORTABLE_FORM_KEYS[number]) && form.schedule !== "derived"
      && (!form.hasTimeSlot || APPROVED_SLOT_SET.has(sourceSlot ?? "")));
    const identity = sourceIdentity(row);
    if (!selected) {
      excludedRows += 1;
      excludedByForm[formKey] = (excludedByForm[formKey] ?? 0) + 1;
      addAcceptedNote(anomalies, row, form?.hasTimeSlot ? "approved_slot_exclusion" : "excluded_form", form?.hasTimeSlot ? "time_slot" : "form_key", form?.hasTimeSlot ? row.time_slot : formKey, form?.hasTimeSlot ? "Source slot is outside the approved six legacy slots and is excluded entirely." : "Source form is outside the approved current-record import set; row omitted.");
      continue;
    }
    eligibleRows += 1;
    sourceByForm[formKey] = (sourceByForm[formKey] ?? 0) + 1;
    const raw = parseValues(row);
    if (!raw) addAnomaly(anomalies, row, "invalid_values", "values_json", row.values_json, "values_json is not a JSON object; no operational values imported.", true);
    const targetTimeSlot = form.hasTimeSlot ? (APPROVED_SLOT_MAP[sourceSlot!] ?? sourceSlot) : null;
    const context = contextFor(row, form, anomalies, targetTimeSlot);
    const values = raw ? transformValues(row, form, raw, anomalies) : {};
    const sourceHash = sha256(stableStringify(row));
    const collisions: string[] = [];
    if (context.context && targetByContext.has(targetKey(formKey, context.context))) collisions.push("target_context");
    if (context.id && targetById.has(context.id)) collisions.push("target_id");
    if (context.context && seenCandidateContext.has(targetKey(formKey, context.context))) collisions.push("candidate_context");
    if (collisions.length) targetCollisions += 1;
    if (context.context && context.id) seenCandidateContext.set(targetKey(formKey, context.context), identity);
    if (!text(row.operator_id) || !text(row.operator_name) || !text(row.created_at) || !text(row.updated_at) || !text(row.client_updated_at)) {
      addAnomaly(anomalies, row, "invalid_metadata", "source_metadata", null, "Operator and source timestamps are required for canonical preservation.", true);
    }
    const rowAnomalies = anomalies.filter((anomaly) => anomaly.source_identity === identity && anomaly.disposition === "pending");
    const blocked = rowAnomalies.some((anomaly) => anomaly.blocking) || !raw || context.blocked;
    const disposition: CandidateRecord["disposition"] = blocked
      ? "blocked"
      : collisions.length
        ? "collision"
        : rowAnomalies.length
          ? "ready_with_warnings"
          : "ready";
    rowAnomalies.forEach((anomaly) => { anomaly.disposition = disposition; });
    candidates.push({
      canonical_id: context.id,
      form_key: formKey,
      target_form_version: form.version,
      context_key: context.context,
      operator_id: text(row.operator_id),
      operator_name: text(row.operator_name),
      plant_date: context.date,
      shift: context.shift,
      time_slot: context.timeSlot,
      boiler_number: context.boiler,
      created_at: text(row.created_at),
      updated_at: text(row.updated_at),
      client_updated_at: text(row.client_updated_at),
      local_revision: Number(row.local_revision ?? 0),
      values,
      source_identity: identity,
      source_hash: sourceHash,
      disposition,
      collisions,
    });
  }

  const dispositionCounts: Record<string, number> = {};
  for (const candidate of candidates) dispositionCounts[candidate.disposition] = (dispositionCounts[candidate.disposition] ?? 0) + 1;
  return { candidates, anomalies, sourceTotal: rows.length, eligibleRows, excludedRows, excludedByForm, sourceByForm, dispositionCounts, targetCollisions };
}

function resultRows(response: unknown): LegacyRow[] {
  const first = Array.isArray(response) ? response[0] : response;
  const rows = (first as { results?: unknown[] })?.results ?? (first as { result?: Array<{ results?: unknown[] }> })?.result?.[0]?.results ?? [];
  return Array.isArray(rows) ? rows as LegacyRow[] : [];
}

function runWranglerJson(args: string[]): unknown {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  try {
    const output = execFileSync(process.execPath, [wrangler, ...args, "--config", "wrangler.canonical.jsonc", "--json"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    throw new Error(`Wrangler read-only query failed.\n${stdout}\n${stderr}`.trim());
  }
}

function csvCell(value: unknown): string {
  const stringValue = String(value ?? "");
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function anomaliesCsv(anomalies: BackfillAnomaly[]): string {
  const headers = ["source_identity", "form_key", "plant_date", "context_key", "kind", "field", "source_value_type", "reason", "blocking", "disposition"];
  return [headers, ...anomalies.map((anomaly) => headers.map((header) => anomaly[header as keyof BackfillAnomaly]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n") + "\r\n";
}

function countByForm(candidates: CandidateRecord[]) {
  const counts: Record<string, Record<string, number>> = {};
  for (const candidate of candidates) {
    counts[candidate.form_key] ??= {};
    counts[candidate.form_key][candidate.disposition] = (counts[candidate.form_key][candidate.disposition] ?? 0) + 1;
  }
  return counts;
}

function fileHash(content: string): string { return sha256(content); }

function reportMarkdown(input: {
  result: TransformResult;
  targetCount: number;
  sourceTimestamp: string;
  targetTimestamp: string;
  sourceHash: string;
  manifestHash: string;
  outputDir: string;
}) {
  const { result } = input;
  const formLines = Object.entries(result.sourceByForm).sort().map(([form, count]) => `| ${form} | ${count} | ${Object.values(countByForm(result.candidates)[form] ?? {}).reduce((a, b) => a + b, 0)} |`).join("\n");
  const warningCount = result.anomalies.filter((anomaly) => anomaly.disposition === "pending").length;
  const auditCount = result.anomalies.filter((anomaly) => anomaly.disposition === "accepted").length;
  const blockingCount = result.anomalies.filter((anomaly) => anomaly.blocking).length;
  return `# Approved legacy canonical backfill dry-run

- Mode: **approved-dry-run** (no remote writes, migrations, deploys, or secrets changes)
- Tool version: \`${DRY_RUN_VERSION}\`
- Source database/table: \`${SOURCE_DATABASE}.latest_completed_records\`
- Target database/table: \`${TARGET_DATABASE}.canonical_records\`
- Source query timestamp: \`${input.sourceTimestamp}\`
- Target query timestamp: \`${input.targetTimestamp}\`
- Source query SHA-256: \`${input.sourceHash}\`
- Manifest SHA-256: \`${input.manifestHash}\`
- Artifact directory: \`${input.outputDir}\`

## Counts

| Metric | Count |
| --- | ---: |
| Source rows fetched | ${result.sourceTotal} |
| Eligible current completed rows | ${result.eligibleRows} |
| Excluded rows | ${result.excludedRows} |
| Target canonical rows observed | ${input.targetCount} |
| Candidate rows written | ${result.candidates.length} |
| Ready | ${result.dispositionCounts.ready ?? 0} |
| Ready with warnings | ${result.dispositionCounts.ready_with_warnings ?? 0} |
| Collisions | ${result.dispositionCounts.collision ?? 0} |
| Blocked | ${result.dispositionCounts.blocked ?? 0} |
| Target/context collisions | ${result.targetCollisions} |
| Warnings | ${warningCount} |
| Accepted policy audit notes | ${auditCount} |
| Blocking anomalies | ${blockingCount} |

## Per-form counts

| Form | Source rows | Candidate rows |
| --- | ---: | ---: |
${formLines || "| *(none)* | 0 | 0 |"}

## Transformation decisions

- Only rows from the current completed-record table were considered; drafts, revisions, receipts, projections, adjustments, and backups were not queried or imported.
- Forms 1, 2, 3, 7, 8, and 9 are eligible. Forms 5 and 6 and any other source form are excluded; old derived projections are never imported.
- Form 1 maps legacy \`molybdenum\` to \`ptsa\` and converts Pump Sp/St to the current paired numeric shape when parseable.
- Form 2 derives burette readings from legacy P/M values, recomputes P/M/OH using current rules, and omits legacy OH and totals.
- Form 8 omits legacy OAT high/low because current display values derive from Form 9.
- Forms 3 and 9 import only old slots 02:00, 06:00, 10:00, 14:00, 18:00, and 22:00, mapped to 03:00, 07:00, 11:00, 15:00, 19:00, and 23:00. All other slots are excluded entirely.
- Approved omissions, retired Form 9 gas-fuel pressure fields, and the one approved Form 1 Pump Sp/St correction are audit notes in \`anomalies.csv\`, not warnings.
- Any other unknown, invalid, or non-convertible field is a warning or blocking anomaly and cannot be applied.
- Candidate IDs and contexts are deterministic. Existing target context/ID ownership is reported as a collision; no row is overwritten.

## Warnings and anomalies

See [anomalies.csv](./anomalies.csv). Values are not repeated there; only source identity, type, field, and reason are included.

## Limitations

This artifact is the immutable input to the guarded apply tool. The apply tool bypasses interactive four-hour validation for the approved mapped legacy slots and regenerates Forms 5/6 from canonical Form 8/Form 9 inputs.
`;
}

export function buildArtifacts(result: TransformResult, input: {
  sourceTimestamp: string;
  targetTimestamp: string;
  sourceQueryHash: string;
  targetCount: number;
  outputDir: string;
}) {
  const records = result.candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + (result.candidates.length ? "\n" : "");
  const anomalies = anomaliesCsv(result.anomalies);
  const manifestCore = {
    version: DRY_RUN_VERSION,
    mode: "approved-dry-run",
    policy: {
      approved_form_counts: APPROVED_FORM_COUNTS,
      legacy_slots: APPROVED_LEGACY_SLOTS,
      slot_map: APPROVED_SLOT_MAP,
      forced_pump_source_aggregate_id: FORCED_PUMP_SOURCE_AGGREGATE_ID,
    },
    source: { database: SOURCE_DATABASE, table: "latest_completed_records", query_timestamp: input.sourceTimestamp, query_sha256: input.sourceQueryHash },
    target: { database: TARGET_DATABASE, table: "canonical_records", query_timestamp: input.targetTimestamp, observed_row_count: input.targetCount },
    counts: { ...result, candidates: result.candidates.length, anomalies: result.anomalies.length },
    files: { records_ndjson_sha256: fileHash(records), anomalies_csv_sha256: fileHash(anomalies) },
  };
  const manifestHash = sha256(stableStringify(manifestCore));
  const manifest = { ...manifestCore, manifest_sha256: manifestHash };
  const report = reportMarkdown({ ...input, sourceHash: input.sourceQueryHash, result, manifestHash });
  mkdirSync(input.outputDir, { recursive: true });
  writeFileSync(join(input.outputDir, "records.ndjson"), records, "utf8");
  writeFileSync(join(input.outputDir, "anomalies.csv"), anomalies, "utf8");
  writeFileSync(join(input.outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(input.outputDir, "REPORT.md"), report, "utf8");
  return { manifestHash, records, anomalies, manifest, report };
}

export function runRemoteDryRun() {
  const sourceTimestamp = new Date().toISOString();
  const sourceResponse = runWranglerJson(["d1", "execute", SOURCE_DATABASE, "--remote", "--command", "SELECT * FROM latest_completed_records ORDER BY form_key, plant_date, context_key, aggregate_id"]);
  const sourceRows = resultRows(sourceResponse);
  const sourceQueryHash = sha256(stableStringify(sourceRows));
  const targetTimestamp = new Date().toISOString();
  const targetResponse = runWranglerJson(["d1", "execute", "DB", "--remote", "--command", "SELECT canonical_id, form_key, context_key FROM canonical_records ORDER BY form_key, context_key, canonical_id"]);
  const targetRows = resultRows(targetResponse) as TargetOwner[];
  const result = transformLegacyRows(sourceRows, targetRows);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const outputDir = join(root, "outputs", "backfill-dry-run", stamp);
  const artifacts = buildArtifacts(result, { sourceTimestamp, targetTimestamp, sourceQueryHash, targetCount: targetRows.length, outputDir });
  console.log(JSON.stringify({ outputDir, sourceRows: sourceRows.length, targetRows: targetRows.length, ...result.dispositionCounts, manifestSha256: artifacts.manifestHash }, null, 2));
  return artifacts;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runRemoteDryRun();
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 2;
  }
}
