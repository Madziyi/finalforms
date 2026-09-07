import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const command = process.platform === "win32" ? process.execPath : "npx";
const persistToIndex = process.argv.indexOf("--persist-to");
const persistTo = persistToIndex >= 0 ? process.argv[persistToIndex + 1] : null;
if (persistToIndex >= 0 && !persistTo) throw new Error("--persist-to requires a directory path.");
const sql = `SELECT
 (SELECT COUNT(*) FROM operators) operators,
 (SELECT COUNT(*) FROM canonical_records) canonical_records,
 (SELECT COUNT(*) FROM canonical_record_tombstones) canonical_record_tombstones,
 (SELECT COUNT(*) FROM canonical_sync_receipts) canonical_sync_receipts,
 (SELECT COUNT(*) FROM numeric_observations) numeric_observations,
 (SELECT COUNT(*) FROM derived_projections) derived_projections,
 (SELECT COUNT(*) FROM derived_numeric_observations) derived_numeric_observations,
 (SELECT COUNT(*) FROM projection_adjustments) projection_adjustments,
 (SELECT COUNT(*) FROM backup_dirty_dates) backup_dirty_dates,
 (SELECT COUNT(*) FROM backup_generations) backup_generations,
 (SELECT COUNT(*) FROM backup_generation_items) backup_generation_items,
 (SELECT COUNT(*) FROM backup_deliveries) backup_deliveries,
 (SELECT COUNT(*) FROM attention_items) attention_items,
 (SELECT value FROM app_metadata WHERE key='schema_version') schema_version,
 (SELECT value FROM app_metadata WHERE key='protocol_version') protocol_version,
 (SELECT value FROM app_metadata WHERE key='fresh_database') fresh_database,
 (SELECT COALESCE(group_concat(name, ','), '') FROM sqlite_master WHERE type='table' AND name IN ('latest_completed_records','aggregates','revisions','command_receipts','context_claims')) legacy_tables`.replace(/\s+/g, " ").trim();
const wranglerArgs = process.platform === "win32"
  ? [join(root, "node_modules", "wrangler", "bin", "wrangler.js")]
  : ["wrangler"];
wranglerArgs.push("d1", "execute", "DB", "--local", "--config", "wrangler.canonical.jsonc");
if (persistTo) wranglerArgs.push("--persist-to", persistTo);
wranglerArgs.push("--command", sql, "--json");
const output = execFileSync(command, wranglerArgs, {
  cwd: root, encoding: "utf8", shell: false
});
const parsed = JSON.parse(output);
const first = Array.isArray(parsed) ? parsed[0] : parsed;
const row = first?.results?.[0] ?? first?.result?.[0]?.results?.[0];
console.table([row]);
const operationalKeys = ["canonical_records", "canonical_record_tombstones", "canonical_sync_receipts", "numeric_observations", "derived_projections", "derived_numeric_observations", "projection_adjustments", "backup_dirty_dates", "backup_generations", "backup_generation_items", "backup_deliveries", "attention_items"];
if (!row || Number(row.operators) < 7 || String(row.schema_version) !== "3" || String(row.protocol_version) !== "3" || String(row.fresh_database) !== "true" || String(row.legacy_tables)) process.exit(1);
if (operationalKeys.some((key) => Number(row[key]) !== 0)) process.exit(1);
console.log("Local canonical v3 clean-slate smoke check passed.");
