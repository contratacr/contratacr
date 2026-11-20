const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function loadEnvFile(filePath) {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) return;

  const content = fs.readFileSync(absolute, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) env[key] = value;
  }

  return env;
}

const localTestEnv = loadEnvFile(".env.test") ?? {};

const nextEntry = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextCmd = process.execPath;
const nextArgs = [nextEntry, "dev", ...process.argv.slice(2)];

const child = spawn(nextCmd, nextArgs, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ...localTestEnv,
    NODE_ENV: "development",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
