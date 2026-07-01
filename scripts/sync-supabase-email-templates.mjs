#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

function readArg(name) {
  const flag = `--${name}`;
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function hash(value) {
  return crypto.createHash("sha256").update(value ?? "").digest("hex").slice(0, 12);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const dryRun = hasFlag("dry-run");
const validateOnly = hasFlag("validate-only");
const projectRef = readArg("project-ref") || process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const templatesDir = path.resolve(root, readArg("templates-dir") || "supabase/email-templates");
const manifestPath = path.resolve(root, readArg("manifest") || "supabase/email-templates/templates.json");

if (!validateOnly && !projectRef) fail("Missing project ref. Pass --project-ref or set SUPABASE_PROJECT_REF.");
if (!validateOnly && !token) fail("Missing SUPABASE_ACCESS_TOKEN.");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail(`Template manifest is empty or invalid: ${manifestPath}`);
}

const payload = {};
const usedKeys = new Set();
const usedFiles = new Set();

for (const item of manifest) {
  for (const field of ["name", "file", "subjectKey", "contentKey", "subject"]) {
    if (!item[field] || typeof item[field] !== "string") {
      fail(`Template manifest item is missing ${field}.`);
    }
  }
  for (const key of [item.subjectKey, item.contentKey]) {
    if (usedKeys.has(key)) fail(`Template manifest uses ${key} more than once.`);
    usedKeys.add(key);
  }
  if (usedFiles.has(item.file)) fail(`Template manifest uses ${item.file} more than once.`);
  usedFiles.add(item.file);

  const filePath = path.join(templatesDir, item.file);
  const content = await fs.readFile(filePath, "utf8");

  for (const requiredToken of item.requiredTokens ?? []) {
    if (!content.includes(requiredToken)) {
      fail(`${item.file} is missing required Supabase token ${requiredToken}`);
    }
  }

  payload[item.subjectKey] = item.subject;
  payload[item.contentKey] = content;
}

if (validateOnly) {
  console.log(`Validated ${manifest.length} Supabase auth email template(s).`);
  process.exit(0);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    fail(`Supabase Management API ${method} failed (${response.status}): ${text}`);
  }

  return response.json();
}

const current = await request("GET");
const changed = Object.entries(payload).filter(([key, value]) => current[key] !== value);

if (changed.length === 0) {
  console.log(`Email templates already match ${projectRef}.`);
  process.exit(0);
}

console.log(`${dryRun ? "Dry run" : "Applying"} ${changed.length} auth email template field(s) to ${projectRef}:`);
for (const [key, value] of changed) {
  console.log(`- ${key}: ${hash(current[key])} -> ${hash(value)}`);
}

if (dryRun) {
  console.log("No changes applied.");
  process.exit(0);
}

const patchPayload = Object.fromEntries(changed);
await request("PATCH", patchPayload);
console.log("Supabase auth email templates updated.");
