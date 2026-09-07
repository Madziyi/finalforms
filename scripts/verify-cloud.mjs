import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cleanSlate = process.argv.includes("--clean-slate");
const config = "wrangler.canonical.jsonc";

function runWrangler(args) {
  const command = process.platform === "win32" ? process.execPath : "npx";
  const commandArgs = process.platform === "win32"
    ? [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), ...args]
    : ["wrangler", ...args];
  return execFileSync(command, [...commandArgs, "--config", config], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["inherit", "pipe", "inherit"],
  });
}

const sql = `SELECT
  (SELECT COUNT(*) FROM operators) AS operators,
  (SELECT COUNT(*) FROM canonical_records) AS canonical_records,
  (SELECT COUNT(*) FROM canonical_record_tombstones) AS canonical_record_tombstones,
  (SELECT COUNT(*) FROM canonical_sync_receipts) AS canonical_sync_receipts,
  (SELECT COUNT(*) FROM numeric_observations) AS numeric_observations,
  (SELECT COUNT(*) FROM derived_projections) AS derived_projections,
  (SELECT COUNT(*) FROM derived_numeric_observations) AS derived_numeric_observations,
  (SELECT COUNT(*) FROM projection_adjustments) AS projection_adjustments,
  (SELECT COUNT(*) FROM backup_dirty_dates) AS backup_dirty_dates,
  (SELECT COUNT(*) FROM backup_generations) AS backup_generations,
  (SELECT COUNT(*) FROM backup_deliveries) AS backup_deliveries,
  (SELECT COUNT(*) FROM backup_generation_items) AS backup_generation_items,
  (SELECT COUNT(*) FROM attention_items) AS attention_items,
  (SELECT value FROM app_metadata WHERE key='schema_version') AS schema_version,
  (SELECT value FROM app_metadata WHERE key='protocol_version') AS protocol_version,
  (SELECT value FROM app_metadata WHERE key='fresh_database') AS fresh_database,
  (SELECT COALESCE(group_concat(name, ','), '') FROM sqlite_master WHERE type='table' AND name IN ('latest_completed_records','aggregates','revisions','command_receipts','context_claims')) AS legacy_tables`.replace(/\s+/g, " ").trim();
const out = runWrangler(["d1", "execute", "DB", "--remote", "--command", sql, "--json"]);
let parsed;
try { parsed = JSON.parse(out); } catch { console.log(out); throw new Error("Could not parse Wrangler verification output."); }
const first = Array.isArray(parsed) ? parsed[0] : parsed;
const row = first?.results?.[0] ?? first?.result?.[0]?.results?.[0] ?? null;
if (!row) { console.log(JSON.stringify(parsed, null, 2)); throw new Error("D1 verification returned no result row."); }
console.log("Remote D1 verification:");
console.table([row]);
if (Number(row.operators) < 7) throw new Error("Canonical operator seed data is incomplete.");
if (String(row.schema_version) !== "3" || String(row.protocol_version) !== "3") throw new Error("Protocol/schema metadata does not match canonical v3.");
if (String(row.legacy_tables)) throw new Error(`Legacy tables are present in the canonical database: ${row.legacy_tables}`);
if (cleanSlate) {
  if (String(row.fresh_database) !== "true") throw new Error("Clean-slate canonical verification requires fresh_database=true.");
  for (const key of ["canonical_records","canonical_record_tombstones","canonical_sync_receipts","numeric_observations","derived_projections","derived_numeric_observations","projection_adjustments","backup_dirty_dates","backup_generations","backup_generation_items","backup_deliveries","attention_items"]) {
    if (Number(row[key]) !== 0) throw new Error(`Clean-slate verification failed: ${key} is ${row[key]}, expected 0.`);
  }
  console.log("Clean-slate remote canonical v3 target verified: no operational rows exist.");
} else {
  console.log("Remote canonical v3 schema and metadata verified. Operational row counts were reported but not required to be zero.");
}
