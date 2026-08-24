// Guardrail for hard-coded bilingual strings.
//
// Components should read copy from the translation files, not choose it inline
// with `isEn ? "..." : "..."` or `locale === "en" ? "..." : "..."` — a new
// inline Spanish string reaches English users unnoticed. Every existing
// occurrence is budgeted per file in scripts/bilingual-budget.json; this check
// fails when a file exceeds its budget or a new file introduces the pattern,
// and reports files that dropped below budget so the budget can be ratcheted
// down (`--update` rewrites the file with the current counts).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BUDGET_FILE = join(ROOT, "scripts", "bilingual-budget.json");
const PATTERNS = [/\bisEn\s*\?/g, /\blocale\s*===\s*["']en["']\s*\?/g, /\bisEnglish\s*\?/g];
const update = process.argv.includes("--update");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) yield full;
  }
}

const counts = {};
for (const file of walk(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  let n = 0;
  for (const pattern of PATTERNS) n += (text.match(pattern) ?? []).length;
  if (n > 0) counts[relative(ROOT, file)] = n;
}

if (update) {
  writeFileSync(BUDGET_FILE, JSON.stringify(counts, null, 2) + "\n");
  console.log(`bilingual budget written: ${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} occurrences`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
const over = [];
const under = [];
for (const [file, n] of Object.entries(counts)) {
  const allowed = budget[file] ?? 0;
  if (n > allowed) over.push(`${file}: ${n} (budget ${allowed})`);
  else if (n < allowed) under.push(`${file}: ${n} (budget ${allowed})`);
}
for (const file of Object.keys(budget)) if (!(file in counts)) under.push(`${file}: 0 (budget ${budget[file]})`);

const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (over.length) {
  console.error(`Hard-coded bilingual strings over budget (${over.length} file${over.length === 1 ? "" : "s"}):`);
  for (const line of over) console.error(`  ${line}`);
  console.error("\nMove the copy to messages/*.json and read it with useTranslations / getTranslations.");
  console.error("If an occurrence is legitimately needed, lower the count elsewhere first or run `node scripts/check-bilingual-budget.mjs --update` with a reviewer's agreement.");
  process.exit(1);
}
console.log(`bilingual budget ok: ${total} occurrences in ${Object.keys(counts).length} files`);
if (under.length) {
  console.log(`Below budget (ratchet down with --update): ${under.length} file${under.length === 1 ? "" : "s"}`);
  for (const line of under) console.log(`  ${line}`);
}
