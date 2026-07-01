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

console.log("Security smoke checks passed.");
