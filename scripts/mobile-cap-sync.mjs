import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const capacitorCli = join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor");
const result = spawnSync(process.execPath, [capacitorCli, "sync", ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.status !== 0) process.exit(result.status ?? 1);

// Capacitor CLI uses path.relative() when generating SwiftPM dependencies.
// On Windows that emits backslashes, which are invalid escape sequences in a
// Swift string. Normalize only Swift package path values after each sync.
const packageSwiftPath = join(root, "ios", "App", "CapApp-SPM", "Package.swift");
if (existsSync(packageSwiftPath)) {
  const current = readFileSync(packageSwiftPath, "utf8");
  const normalized = current.replace(/(path:\s*")([^"]+)(")/g, (_match, prefix, dependencyPath, suffix) => (
    `${prefix}${dependencyPath.replaceAll("\\", "/")}${suffix}`
  ));
  if (normalized !== current) writeFileSync(packageSwiftPath, normalized, "utf8");
}
