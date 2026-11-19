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

// Required server secrets (development only fallback). PRO_BID_PORTAL_SECRET keys the stored hashes of the vendor
// portal links and sessions; DIR_CLAIM_OTP_PEPPER the HMAC of the one-time claim codes; DIR_VISITOR_PEPPER the HMAC of
// the device id behind guest reviews/contacts/reservations. When no env source defines one, this dev server uses a
// DETERMINISTIC, PUBLIC, NOT-SECRET local value: sha256hex('contratacr-local-dev-only:' + NAME), the same value
// src/lib/security/local-dev-secrets.ts uses, so codes and links survive restarts. Production refuses that value and
// never generates a random one (missing secret -> 503 and a server error). In the Next.js env files only the presence
// of the variable NAME is checked (no value is used or logged), so a secret defined there always wins.
function definesVariable(filePath, name) {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) return false;
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*\\S`, "m");
  return pattern.test(fs.readFileSync(absolute, "utf8"));
}
const localDevOnlyEnv = {};
for (const secretName of ["PRO_BID_PORTAL_SECRET", "DIR_CLAIM_OTP_PEPPER", "DIR_VISITOR_PEPPER"]) {
  if (
    !process.env[secretName] &&
    !localTestEnv[secretName] &&
    ![".env.development.local", ".env.local", ".env.development", ".env"].some((file) => definesVariable(file, secretName))
  ) {
    localDevOnlyEnv[secretName] = process.getBuiltinModule("node:crypto").createHash("sha256").update(`contratacr-local-dev-only:${secretName}`, "utf8").digest("hex");
  }
}

const nextEntry = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextCmd = process.execPath;
const nextArgs = [nextEntry, "dev", ...process.argv.slice(2)];

const child = spawn(nextCmd, nextArgs, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ...localTestEnv,
    ...localDevOnlyEnv,
    NODE_ENV: "development",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
