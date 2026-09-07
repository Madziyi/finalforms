import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const forceNew = process.argv.includes("--force-new");
const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = new URL("../wrangler.canonical.jsonc", import.meta.url);
const configName = "wrangler.canonical.jsonc";
const configText = readFileSync(configPath, "utf8");
const idMatch = configText.match(/"database_id"\s*:\s*"([^"]+)"/);
const nameMatch = configText.match(/"database_name"\s*:\s*"([^"]+)"/);
if (!idMatch || !nameMatch) throw new Error("wrangler.canonical.jsonc is missing the D1 database binding.");
const existingId = idMatch[1];
const existingName = nameMatch[1];
const placeholder = "00000000-0000-0000-0000-000000000000";

function run(args, options = {}) {
  const command = process.platform === "win32" ? process.execPath : "npx";
  const commandArgs = process.platform === "win32"
    ? [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), ...args.slice(1)]
    : args;
  console.log(`> ${process.platform === "win32" ? "wrangler" : "npx wrangler"} ${args.slice(1).join(" ")}`);
  return execFileSync(command, [...commandArgs, "--config", configName], {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
    shell: false,
    ...options,
  });
}

function runJson(args) {
  const output = run([...args, "--json"], { capture: true });
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Could not parse Wrangler JSON output:\n${output}`);
  }
}

function resultRows(response) {
  const first = Array.isArray(response) ? response[0] : response;
  return first?.results ?? first?.result?.[0]?.results ?? [];
}

function applyRemoteMigrations() {
  // `wrangler d1 migrations apply --remote` sends each migration plus its
  // bookkeeping INSERT as one query request. The remote D1 query endpoint can
  // reject SQLite trigger bodies in that compound request as "incomplete
  // input", while the transactional --file importer handles them correctly.
  run(["wrangler", "d1", "execute", "DB", "--remote", "--command", `CREATE TABLE IF NOT EXISTS d1_migrations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );`]);

  const appliedResponse = runJson(["wrangler", "d1", "execute", "DB", "--remote", "--command", "SELECT name FROM d1_migrations ORDER BY id;"]);
  const applied = new Set(resultRows(appliedResponse).map((row) => row.name));
  const migrationNames = readdirSync(join(root, "migrations-canonical"))
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .sort();
  const tempRoot = mkdtempSync(join(tmpdir(), "ecc-d1-migrations-"));

  try {
    for (const migrationName of migrationNames) {
      if (applied.has(migrationName)) continue;
      const migrationSql = readFileSync(join(root, "migrations-canonical", migrationName), "utf8");
      const bundledPath = join(tempRoot, migrationName);
      const escapedName = migrationName.replaceAll("'", "''");
      writeFileSync(bundledPath, `${migrationSql}\nINSERT INTO d1_migrations (name) VALUES ('${escapedName}');\n`);
      run(["wrangler", "d1", "execute", "DB", "--remote", "--file", bundledPath]);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

let databaseName = existingName;
if (forceNew) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  databaseName = `ecc-operator-canonical-production-${stamp}`;
}

if (existingId === placeholder || forceNew) {
  console.log(`Creating fresh D1 database: ${databaseName}`);
  let output;
  try {
    output = run(["wrangler", "d1", "create", databaseName, "--location", "enam"], { capture: true });
  } catch (error) {
    const stdout = error?.stdout?.toString?.() ?? "";
    const stderr = error?.stderr?.toString?.() ?? "";
    throw new Error(`D1 creation failed.\n${stdout}\n${stderr}`);
  }
  process.stdout.write(output);
  const uuid = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!uuid) throw new Error("Wrangler created the database but its database_id could not be parsed from the output.");

  let next = readFileSync(configPath, "utf8");
  next = next.replace(/"database_name"\s*:\s*"[^"]+"/, `"database_name": "${databaseName}"`);
  next = next.replace(/"database_id"\s*:\s*"[^"]+"/, `"database_id": "${uuid}"`);
  writeFileSync(configPath, next);
  console.log(`Updated wrangler.canonical.jsonc with D1 id ${uuid}`);
} else {
  console.log(`Using configured D1 database ${existingName} (${existingId}).`);
}

applyRemoteMigrations();
console.log("> node scripts/verify-cloud.mjs");
execFileSync(process.execPath, ["scripts/verify-cloud.mjs", "--clean-slate"], { cwd: root, stdio: "inherit" });
console.log("\nCloud D1 provisioning complete. The canonical record count should remain zero until operator cutover.");
console.log("Next: set DEVICE_TOKEN, GEMINI_API_KEY, POWER_AUTOMATE_BACKUP_URL and POWER_AUTOMATE_BACKUP_KEY with `npx wrangler secret put <NAME>`, then deploy.");
