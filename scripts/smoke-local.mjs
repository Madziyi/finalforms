import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const sql = `SELECT
  (SELECT COUNT(*) FROM operators) operators,
  (SELECT COUNT(*) FROM latest_completed_records) latest_completed_records,
 (SELECT COUNT(*) FROM aggregates) aggregates,
 (SELECT COUNT(*) FROM revisions) revisions,
 (SELECT COUNT(*) FROM context_claims) context_claims,
 (SELECT COUNT(*) FROM derived_projections) derived_projections,
 (SELECT COUNT(*) FROM backup_generations) backup_generations,
 (SELECT value FROM app_metadata WHERE key='schema_version') schema_version,
 (SELECT value FROM app_metadata WHERE key='protocol_version') protocol_version;`;
const output = execFileSync(command, ["wrangler", "d1", "execute", "DB", "--local", "--command", sql, "--json"], {
  cwd: root, encoding: "utf8", shell: process.platform === "win32"
});
const parsed = JSON.parse(output);
const first = Array.isArray(parsed) ? parsed[0] : parsed;
const row = first?.results?.[0] ?? first?.result?.[0]?.results?.[0];
console.table([row]);
if (!row || Number(row.operators) < 7 || Number(row.latest_completed_records) !== 0 || Number(row.aggregates) !== 0 || Number(row.revisions) !== 0 || Number(row.context_claims) !== 0 || Number(row.derived_projections) !== 0 || Number(row.backup_generations) !== 0 || String(row.schema_version) !== "2" || String(row.protocol_version) !== "2") process.exit(1);
console.log("Local v2 clean-slate smoke check passed.");
