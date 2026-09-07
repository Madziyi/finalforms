import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// This command is intentionally destructive only to Wrangler's LOCAL emulation state.
// It never touches the configured remote D1 database.
rmSync(resolve(root, ".wrangler", "state"), { recursive: true, force: true });
const command = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(command, ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.canonical.jsonc"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log("Fresh local Wrangler state and D1 database initialized.");
