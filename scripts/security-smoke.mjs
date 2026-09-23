#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const envFiles = tracked.filter((file) => /(^|\/)\.env($|\.|\/)/.test(file.replace(/\\/g, "/")));
if (envFiles.length > 0) {
  console.error("Environment files must not be tracked:");
  for (const file of envFiles) console.error(`- ${file}`);
  process.exit(1);
}

const secretPatterns = [
  { name: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "Supabase service role assignment", pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s'"]{12,}/ },
  { name: "Cloudinary API secret assignment", pattern: /CLOUDINARY_API_SECRET\s*=\s*[^\s'"]{12,}/ },
  { name: "Brevo API key assignment", pattern: /BREVO_API_KEY\s*=\s*[^\s'"]{12,}/ },
  { name: "Resend API key assignment", pattern: /RESEND_API_KEY\s*=\s*[^\s'"]{12,}/ },
  { name: "Google API key assignment", pattern: /GOOGLE_[A-Z_]*API_KEY\s*=\s*AIza[A-Za-z0-9_-]{20,}/ },
];

const skip = new Set(["package-lock.json"]);
const findings = [];

for (const file of tracked) {
  if (skip.has(file)) continue;
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) findings.push({ file, name });
  }
}

if (findings.length > 0) {
  console.error("Potential tracked secret(s) found:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.name}`);
  process.exit(1);
}

const activityRpcHardening = "supabase/migrations/164_harden_professional_activity_rpc.sql";
if (!fs.existsSync(activityRpcHardening)) {
  console.error(`Missing activity RPC hardening migration: ${activityRpcHardening}`);
  process.exit(1);
}

const activityRpcSql = fs.readFileSync(activityRpcHardening, "utf8");
const requiredActivityRpcRules = [
  /revoke\s+all\s+on\s+function\s+public\.publish_professional_activity[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
  /grant\s+execute\s+on\s+function\s+public\.publish_professional_activity[\s\S]*?to\s+service_role\s*;/i,
];

if (requiredActivityRpcRules.some((rule) => !rule.test(activityRpcSql))) {
  console.error("Professional activity RPC must be restricted to service_role.");
  process.exit(1);
}

// El flujo de currículums (postularse a un empleo) salió del producto: sus
// rutas y su visor ya no existen, así que no hay nada que vigilar ahí.

console.log("Security smoke checks passed.");
