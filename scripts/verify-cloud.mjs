import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cleanSlate = process.argv.includes("--clean-slate");

function runWrangler(args) {
  const command = process.platform === "win32" ? process.execPath : "npx";
  const commandArgs = process.platform === "win32"
    ? [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), ...args]
    : ["wrangler", ...args];
  return execFileSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["inherit", "pipe", "inherit"],
  });
}

const sql = `SELECT
  (SELECT COUNT(*) FROM operators) AS operators,
  (SELECT COUNT(*) FROM latest_completed_records) AS latest_completed_records,
  (SELECT COUNT(*) FROM aggregates) AS aggregates,
  (SELECT COUNT(*) FROM revisions) AS revisions,
  (SELECT COUNT(*) FROM command_receipts) AS command_receipts,
  (SELECT COUNT(*) FROM context_claims) AS context_claims,
  (SELECT COUNT(*) FROM derived_projections) AS derived_projections,
  (SELECT COUNT(*) FROM derived_numeric_observations) AS derived_numeric_observations,
  (SELECT COUNT(*) FROM backup_generations) AS backup_generations,
  (SELECT COUNT(*) FROM backup_deliveries) AS backup_deliveries,
  (SELECT value FROM app_metadata WHERE key='schema_version') AS schema_version,
  (SELECT value FROM app_metadata WHERE key='protocol_version') AS protocol_version,
  (SELECT value FROM app_metadata WHERE key='fresh_database') AS fresh_database;`;
const out = runWrangler(["d1", "execute", "DB", "--remote", "--command", sql, "--json"]);
let parsed;
try { parsed = JSON.parse(out); } catch { console.log(out); throw new Error("Could not parse Wrangler verification output."); }
const first = Array.isArray(parsed) ? parsed[0] : parsed;
const row = first?.results?.[0] ?? first?.result?.[0]?.results?.[0] ?? null;
if (!row) { console.log(JSON.stringify(parsed, null, 2)); throw new Error("D1 verification returned no result row."); }
console.log("Remote D1 verification:");
console.table([row]);
if (Number(row.operators) < 7) throw new Error("Operator seed data is incomplete.");
if (String(row.schema_version) !== "2" || String(row.protocol_version) !== "2") throw new Error("Protocol/schema metadata does not match v2.");
if (cleanSlate) {
  for (const key of ["latest_completed_records","aggregates","revisions","command_receipts","context_claims","derived_projections","derived_numeric_observations","backup_generations","backup_deliveries"]) {
    if (Number(row[key]) !== 0) throw new Error(`Clean-slate verification failed: ${key} is ${row[key]}, expected 0.`);
  }
  console.log("Clean-slate remote target verified: no operational records exist.");
} else {
  console.log("Remote D1 schema and metadata verified. Operational row counts were reported but not required to be zero.");
}
