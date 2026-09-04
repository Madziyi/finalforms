import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const shell = process.platform === "win32";
const children = [
  spawn(npx, ["wrangler", "dev", "--port", "8787"], { cwd: root, stdio: "inherit", shell }),
  spawn(npx, ["vite"], { cwd: root, stdio: "inherit", shell }),
];
let exiting = false;
function stop(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exit(code);
}
for (const child of children) child.on("exit", (code) => { if (!exiting && code && code !== 0) stop(code); });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
console.log("ECC dev servers starting: Worker API on :8787, Vite UI on its printed local URL.");
