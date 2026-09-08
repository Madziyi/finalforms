import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allFields, getForm } from "../shared/forms.ts";
import { canonicalRecordId } from "../shared/canonical.ts";
import type { Values } from "../shared/types.ts";
import { stableStringify } from "../worker/domain/hash.ts";
import {
  calculateDerivedProjections,
  FORMULA_VERSION,
  projectionRefreshDatesFromRows,
  type DerivedSourceRow,
} from "../worker/domain/derivations.ts";

export const REFRESH_TOOL_VERSION = "1.0.0";

type TargetName = "canonical" | "staging";
type JsonRow = Record<string, unknown>;
type ProjectionRow = {
  projection_id: string;
  form_key: "daily-consumption-totals" | "makeup";
  plant_date: string;
  revision: number;
  status: string;
  formula_version: number;
  source_revisions_json: string;
  base_values_json: string;
  effective_values_json: string;
  warnings_json: string;
  created_at: string;
  updated_at: string;
};
type OatSourceRow = DerivedSourceRow & { time_slot: string | null };

const TARGETS: Record<TargetName, { config: string; database: string; databaseId: string; workflow: string }> = {
  canonical: {
    config: "wrangler.canonical.jsonc",
    database: "ecc-operator-v1-canonical",
    databaseId: "e80248dd-c895-4704-b36a-c5abb08bf110",
    workflow: "ecc-backup-canonical",
  },
  staging: {
    config: "wrangler.staging.jsonc",
    database: "ecc-operator-v1-staging",
    databaseId: "92706a75-55f0-4050-a9e0-3ddbaef19ec0",
    workflow: "ecc-backup-staging",
  },
};

const root = fileURLToPath(new URL("..", import.meta.url));

function fail(message: string): never { throw new Error(message); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function text(value: unknown): string { return String(value ?? ""); }
function sql(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Refusing to emit non-finite SQL number.");
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}
function resultRows(response: unknown): JsonRow[] {
  const first = Array.isArray(response) ? response[0] : response;
  const rows = (first as { results?: unknown[] })?.results ?? (first as { result?: Array<{ results?: unknown[] }> })?.result?.[0]?.results ?? [];
  return Array.isArray(rows) ? rows as JsonRow[] : [];
}
function parseJsonc(path: string): JsonRow {
  const source = readFileSync(path, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(source) as JsonRow;
}
function runWranglerQuery(configPath: string, command: string): JsonRow[] {
  const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  try {
    const output = execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", "--remote", "--config", configPath, "--command", command, "--json"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
    return resultRows(JSON.parse(output));
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? text((error as { stdout?: unknown }).stdout) : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? text((error as { stderr?: unknown }).stderr) : "";
    throw new Error(`Projection refresh read-only query failed.\n${stdout}\n${stderr}`.trim());
  }
}
function runWranglerFile(configPath: string, filePath: string) {
  const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  try {
    return execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", "--remote", "--config", configPath, "--file", filePath, "--json"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? text((error as { stdout?: unknown }).stdout) : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? text((error as { stderr?: unknown }).stderr) : "";
    throw new Error(`Projection refresh apply failed.\n${stdout}\n${stderr}`.trim());
  }
}
function canonicalSource(row: JsonRow): DerivedSourceRow {
  return {
    revision_id: `${text(row.canonical_id)}@r${Number(row.revision)}`,
    aggregate_id: text(row.canonical_id),
    revision: Number(row.revision),
    plant_date: text(row.plant_date),
    values_json: text(row.values_json),
  };
}
function oatSource(row: JsonRow): OatSourceRow {
  return { ...canonicalSource(row), time_slot: row.time_slot == null ? null : text(row.time_slot) };
}
function validateTarget(target: TargetName, configPath: string) {
  const expected = TARGETS[target];
  const absoluteConfig = resolve(root, configPath);
  if (basename(absoluteConfig) !== expected.config) fail(`Target ${target} requires ${expected.config}.`);
  const config = parseJsonc(absoluteConfig);
  if (text(config.name) !== (target === "canonical" ? "ecc-operator-pwa-v1-canonical" : "ecc-operator-pwa-v1-staging")) fail("Worker name does not match the selected target.");
  const databases = Array.isArray(config.d1_databases) ? config.d1_databases as JsonRow[] : [];
  const database = databases[0];
  if (!database || text(database.binding) !== "DB" || text(database.database_name) !== expected.database || text(database.database_id) !== expected.databaseId) fail("D1 binding/name/ID does not match the selected target.");
  if (text(config.workflows && (config.workflows as JsonRow[])[0]?.name) !== expected.workflow) fail("Workflow binding does not match the selected target.");
  return absoluteConfig;
}

function loadSnapshot(configPath: string) {
  const form8 = runWranglerQuery(configPath, "SELECT canonical_id,revision,plant_date,values_json FROM canonical_records WHERE form_key='integrator-readings' ORDER BY plant_date,revision,canonical_id");
  const form9 = runWranglerQuery(configPath, "SELECT canonical_id,revision,plant_date,time_slot,values_json FROM canonical_records WHERE form_key='gas-turbine-log-sheet' ORDER BY plant_date,time_slot,revision,canonical_id");
  const projections = runWranglerQuery(configPath, "SELECT projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json,created_at,updated_at FROM derived_projections ORDER BY form_key,plant_date");
  const immutable = {
    canonicalRecords: runWranglerQuery(configPath, "SELECT * FROM canonical_records ORDER BY canonical_id"),
    receipts: runWranglerQuery(configPath, "SELECT * FROM canonical_sync_receipts ORDER BY sync_id"),
    operators: runWranglerQuery(configPath, "SELECT * FROM operators ORDER BY id"),
    backupGenerations: runWranglerQuery(configPath, "SELECT * FROM backup_generations ORDER BY generation_id"),
    backupDeliveries: runWranglerQuery(configPath, "SELECT * FROM backup_deliveries ORDER BY delivery_id"),
  };
  return {
    form8: form8.map(canonicalSource),
    form9: form9.map(oatSource),
    projections: projections as unknown as ProjectionRow[],
    sourceHash: sha256(stableStringify({ form8, form9 })),
    projectionHash: sha256(stableStringify(projections)),
    immutableHash: sha256(stableStringify(immutable)),
    immutableCounts: Object.fromEntries(Object.entries(immutable).map(([key, rows]) => [key, rows.length])),
  };
}

function changed(existing: ProjectionRow | undefined, formKey: "daily-consumption-totals" | "makeup", values: Values, status: string, refs: unknown[], warnings: string[]) {
  if (!existing) return true;
  return existing.status !== status
    || Number(existing.formula_version) !== FORMULA_VERSION
    || stableStringify(JSON.parse(existing.source_revisions_json)) !== stableStringify(refs)
    || stableStringify(JSON.parse(existing.base_values_json)) !== stableStringify(values)
    || stableStringify(JSON.parse(existing.effective_values_json)) !== stableStringify(values)
    || stableStringify(JSON.parse(existing.warnings_json)) !== stableStringify(warnings)
    || existing.form_key !== formKey;
}

function buildPlan(target: TargetName, releaseSha: string, snapshot: ReturnType<typeof loadSnapshot>, fromDate?: string) {
  const existingByKey = new Map(snapshot.projections.map((row) => [`${row.form_key}|${row.plant_date}`, row]));
  const sourceBaseDates = [...new Set(snapshot.form8.map((row) => row.plant_date))]
    .filter((date) => !fromDate || date >= fromDate)
    .sort();
  const dates = [...new Set([
    ...snapshot.projections.map((row) => row.plant_date),
    ...projectionRefreshDatesFromRows(sourceBaseDates, snapshot.form8),
  ])].filter((date) => !fromDate || date >= fromDate).sort();
  const projections = dates.flatMap((plantDate) => {
    const calculation = calculateDerivedProjections(plantDate, snapshot.form8, snapshot.form9.filter((row) => row.plant_date === plantDate));
    return ([
      ["daily-consumption-totals", calculation.form5.values, calculation.form5.status, calculation.form5.sourceRefs],
      ["makeup", calculation.form6.values, calculation.form6.status, calculation.form6.sourceRefs],
    ] as const).map(([formKey, values, status, refs]) => {
      const existing = existingByKey.get(`${formKey}|${plantDate}`);
      const isChanged = changed(existing, formKey, values, status, refs, calculation.warnings);
      return {
        projectionId: existing?.projection_id ?? canonicalRecordId(formKey, plantDate),
        formKey,
        plantDate,
        existingRevision: existing?.revision ?? null,
        nextRevision: isChanged ? Number(existing?.revision ?? 0) + 1 : Number(existing?.revision ?? 0),
        changed: isChanged,
        before: existing ? {
          revision: existing.revision,
          status: existing.status,
          formulaVersion: existing.formula_version,
          sourceRefs: JSON.parse(existing.source_revisions_json),
          values: JSON.parse(existing.effective_values_json),
          warnings: JSON.parse(existing.warnings_json),
        } : null,
        status,
        formulaVersion: FORMULA_VERSION,
        sourceRefs: refs,
        values,
        warnings: calculation.warnings,
      };
    });
  });
  return {
    toolVersion: REFRESH_TOOL_VERSION,
    target,
    releaseSha,
    formulaVersion: FORMULA_VERSION,
    generatedAt: new Date().toISOString(),
    affectedDates: dates,
    sourceHash: snapshot.sourceHash,
    projectionHash: snapshot.projectionHash,
    immutableHash: snapshot.immutableHash,
    immutableCounts: snapshot.immutableCounts,
    projections,
  };
}

function buildApplySql(plan: ReturnType<typeof buildPlan>, appliedAt: string) {
  const statements = ["BEGIN TRANSACTION;"];
  const trendable = new Map(plan.projections.map((projection) => [projection.formKey, new Set(allFields(getForm(projection.formKey)!).filter((field) => field.trendable).map((field) => field.key))]));
  for (const projection of plan.projections.filter((candidate) => candidate.changed)) {
    const valuesJson = stableStringify(projection.values);
    const refsJson = stableStringify(projection.sourceRefs);
    const warningsJson = stableStringify(projection.warnings);
    if (projection.existingRevision == null) {
      statements.push(`INSERT INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json,created_at,updated_at) VALUES(${sql(projection.projectionId)},${sql(projection.formKey)},${sql(projection.plantDate)},${projection.nextRevision},${sql(projection.status)},${projection.formulaVersion},${sql(refsJson)},${sql(valuesJson)},${sql(valuesJson)},${sql(warningsJson)},${sql(appliedAt)},${sql(appliedAt)});`);
    } else {
      statements.push(`UPDATE derived_projections SET revision=${projection.nextRevision},status=${sql(projection.status)},formula_version=${projection.formulaVersion},source_revisions_json=${sql(refsJson)},base_values_json=${sql(valuesJson)},effective_values_json=${sql(valuesJson)},warnings_json=${sql(warningsJson)},updated_at=${sql(appliedAt)} WHERE projection_id=${sql(projection.projectionId)} AND revision=${projection.existingRevision};`);
    }
    statements.push(`UPDATE derived_numeric_observations SET is_current=0 WHERE projection_id=${sql(projection.projectionId)};`);
    for (const [fieldKey, value] of Object.entries(projection.values)) {
      if (!trendable.get(projection.formKey)?.has(fieldKey) || typeof value !== "number" || !Number.isFinite(value)) continue;
      statements.push(`INSERT INTO derived_numeric_observations(projection_id,projection_revision,form_key,field_key,plant_date,measured_at,numeric_value,is_current) VALUES(${sql(projection.projectionId)},${projection.nextRevision},${sql(projection.formKey)},${sql(fieldKey)},${sql(projection.plantDate)},${sql(`${projection.plantDate}T23:59:00`)},${value},1);`);
    }
    statements.push(`INSERT INTO backup_dirty_dates(plant_date,reason,first_dirty_at,last_dirty_at) VALUES(${sql(projection.plantDate)},${sql(`Historical ${projection.formKey} projection refresh`)},${sql(appliedAt)},${sql(appliedAt)}) ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=excluded.last_dirty_at;`);
  }
  statements.push("COMMIT;");
  return statements.join("\n") + "\n";
}

function projectionMatches(row: ProjectionRow | undefined, candidate: ReturnType<typeof buildPlan>["projections"][number]) {
  return Boolean(row)
    && row!.projection_id === candidate.projectionId
    && Number(row!.revision) === candidate.nextRevision
    && row!.status === candidate.status
    && Number(row!.formula_version) === candidate.formulaVersion
    && stableStringify(JSON.parse(row!.source_revisions_json)) === stableStringify(candidate.sourceRefs)
    && stableStringify(JSON.parse(row!.effective_values_json)) === stableStringify(candidate.values)
    && stableStringify(JSON.parse(row!.warnings_json)) === stableStringify(candidate.warnings);
}

function plannedProjectionsMatch(snapshot: ReturnType<typeof loadSnapshot>, plan: ReturnType<typeof buildPlan> & { planHash?: string }) {
  const byId = new Map(snapshot.projections.map((row) => [row.projection_id, row]));
  return plan.projections.filter((candidate) => candidate.changed).every((candidate) => projectionMatches(byId.get(candidate.projectionId), candidate));
}

function writePlan(outputDir: string, plan: ReturnType<typeof buildPlan>) {
  mkdirSync(outputDir, { recursive: true });
  const core = { ...plan };
  const planHash = sha256(stableStringify(core));
  const withHash = { ...plan, planHash };
  writeFileSync(join(outputDir, "plan.json"), `${JSON.stringify(withHash, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDir, "REPORT.md"), `# Historical projection refresh dry-run\n\n- Mode: **dry-run** (no remote writes)\n- Target: \`${plan.target}\`\n- Release SHA: \`${plan.releaseSha}\`\n- Formula version: \`${plan.formulaVersion}\`\n- Affected dates: ${plan.affectedDates.length}\n- Changed projections: ${plan.projections.filter((projection) => projection.changed).length}\n- Source hash: \`${plan.sourceHash}\`\n- Immutable-table hash: \`${plan.immutableHash}\`\n\nThe plan reads canonical Form 8/Form 9 rows and writes only current derived projections, derived numeric observations, and backup-dirty dates during apply. Canonical records, receipts, operators, backup generations, and backup deliveries are guarded by the recorded immutable-table hash.\n\nApply only this exact plan after explicit release-owner approval.\n`, "utf8");
  return { ...withHash, outputDir };
}

function loadPlan(path: string) {
  const plan = JSON.parse(readFileSync(path, "utf8")) as ReturnType<typeof buildPlan> & { planHash: string };
  const supplied = plan.planHash;
  const core = { ...plan } as Record<string, unknown>;
  delete core.planHash;
  if (sha256(stableStringify(core)) !== supplied) fail("Plan hash does not match its contents.");
  if (plan.toolVersion !== REFRESH_TOOL_VERSION || plan.formulaVersion !== FORMULA_VERSION) fail("Plan was produced by an incompatible refresh tool/formula version.");
  return plan;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const target = value("--target") as TargetName | undefined;
  const config = value("--config");
  if (!target || !TARGETS[target]) fail("Use --target canonical|staging.");
  if (!config) fail("Use --config with the matching wrangler config.");
  const dryRun = args.includes("--dry-run");
  const apply = value("--apply");
  if (dryRun === Boolean(apply)) fail("Choose exactly one of --dry-run or --apply <plan.json>.");
  return { target, config, dryRun, planPath: apply, output: value("--output"), releaseSha: value("--release-sha"), fromDate: value("--from"), approval: value("--approval") };
}

export function main() {
  const options = parseArgs();
  const configPath = validateTarget(options.target, options.config);
  if (!options.releaseSha || !/^[0-9a-f]{40}$/.test(options.releaseSha)) fail("--release-sha must be a full 40-character SHA.");
  if (options.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.fromDate)) fail("--from must be YYYY-MM-DD.");
  if (options.dryRun) {
    if (!options.output) fail("Dry-run requires --output outside the repository for its evidence.");
    const snapshot = loadSnapshot(configPath);
    const plan = buildPlan(options.target, options.releaseSha, snapshot, options.fromDate);
    console.log(JSON.stringify(writePlan(resolve(options.output), plan), null, 2));
    return;
  }
  if (!options.planPath || !options.approval) fail("Apply requires --apply <plan.json> and --approval <recorded approval text>.");
  const plan = loadPlan(resolve(options.planPath));
  if (plan.target !== options.target || plan.releaseSha !== options.releaseSha) fail("Plan target or release SHA does not match this apply command.");
  if (!options.output) fail("Apply requires --output outside the repository for its evidence.");
  const before = loadSnapshot(configPath);
  if (before.sourceHash !== plan.sourceHash || before.immutableHash !== plan.immutableHash) fail("Canonical source or immutable-table state changed since dry-run; refusing to apply the stale plan.");
  const alreadyApplied = before.projectionHash !== plan.projectionHash && plannedProjectionsMatch(before, plan);
  if (before.projectionHash !== plan.projectionHash && !alreadyApplied) fail("Projection state changed since dry-run; refusing to apply the stale plan.");
  const appliedAt = new Date().toISOString();
  const outputDir = resolve(options.output);
  mkdirSync(outputDir, { recursive: true });
  const sqlText = buildApplySql(plan, appliedAt);
  const sqlPath = join(outputDir, "apply.sql");
  writeFileSync(sqlPath, sqlText, "utf8");
  const wranglerOutput = alreadyApplied || !plan.projections.some((projection) => projection.changed) ? "Plan is already applied or has no changes; no remote write was issued.\n" : runWranglerFile(configPath, sqlPath);
  const after = loadSnapshot(configPath);
  if (after.sourceHash !== plan.sourceHash || after.immutableHash !== plan.immutableHash) fail("Immutable/source state changed during apply; investigate before retrying.");
  if (!plannedProjectionsMatch(after, plan)) fail("Post-apply projection verification failed; investigate before retrying.");
  const result = { mode: "apply", target: options.target, releaseSha: options.releaseSha, approval: options.approval, appliedAt, affectedDates: plan.affectedDates, changedProjections: plan.projections.filter((projection) => projection.changed), wranglerOutput };
  writeFileSync(join(outputDir, "apply-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

try { main(); } catch (error) { console.error(String(error instanceof Error ? error.message : error)); process.exitCode = 2; }
