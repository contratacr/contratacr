// Static check: directory/search ordering must never depend on payment signals.
// Scans src/lib/directory/ranking.ts, src/lib/search/*, and dir_search* functions in docs/pro/sql/directory-*.sql.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const FORBIDDEN = /pro_memberships|pro_workspace_editions|\btiers?\b|paywall|is_featured|isfeatured/i;

// Known pending F0 items (plan: quitar is_featured de query-core.ts:208 y professionals.ts:658).
// Explicit allowlist: file:line plus a required text fragment so a drifted line number does not hide a new hit.
// Remove entries as F0 lands. professionals.ts is outside src/lib/search/* but listed in the plan.
// F0 landed 2026-11-16 (query-core.ts and professionals.ts no longer sort by isFeatured): allowlist is empty.
const KNOWN_PENDING_F0 = [];
// Geographic "locality tier" in the existing search code is not a commercial tier.
const NEUTRAL_TOKENS = [/localityTier/g, /\btier\.(get|set)\(/g, /const tier = new Map/g];

const failures = [];
const pending = [];
const stale = [];

function scanText(rel, text, { sqlOnlyFunctions = false } = {}) {
  let target = text;
  let offsetLines = null;
  if (sqlOnlyFunctions) {
    // Keep only dir_search* function definitions, preserving line numbers.
    const lines = text.split("\n");
    offsetLines = lines.map(() => "");
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?dir_search\w*/gi;
    let m;
    while ((m = re.exec(text))) {
      const start = text.slice(0, m.index).split("\n").length - 1;
      const dollar = /\$(\w*)\$/.exec(text.slice(m.index));
      let endIdx = text.length;
      if (dollar) {
        const open = m.index + dollar.index + dollar[0].length;
        const close = text.indexOf(dollar[0], open);
        if (close >= 0) endIdx = text.indexOf(";", close + dollar[0].length);
        if (endIdx < 0) endIdx = text.length;
      }
      const end = text.slice(0, endIdx).split("\n").length - 1;
      for (let i = start; i <= end; i++) offsetLines[i] = lines[i];
    }
    target = offsetLines.join("\n");
  }
  target.split("\n").forEach((raw, i) => {
    let line = raw;
    for (const t of NEUTRAL_TOKENS) line = line.replace(t, "");
    if (!FORBIDDEN.test(line)) return;
    const n = i + 1;
    const known = KNOWN_PENDING_F0.find((k) => k.file === rel && k.line === n && raw.includes(k.includes));
    if (known) pending.push(`${rel}:${n}  ${raw.trim()}`);
    else failures.push(`${rel}:${n}  ${raw.trim()}`);
  });
}

function scanFile(rel, opts) {
  const abs = join(root, rel);
  if (existsSync(abs)) scanText(rel, readFileSync(abs, "utf8"), opts);
}

scanFile("src/lib/directory/ranking.ts");
for (const f of readdirSync(join(root, "src/lib/search"))) if (/\.(ts|tsx|mjs|js)$/.test(f)) scanFile(`src/lib/search/${f}`);
const sqlDir = join(root, "docs/pro/sql");
for (const f of readdirSync(sqlDir)) if (/^directory-.*\.sql$/.test(f)) scanFile(`docs/pro/sql/${f}`, { sqlOnlyFunctions: true });

// Report-only: the professionals query (known pending F0), checked for drift.
for (const k of KNOWN_PENDING_F0.filter((k) => k.reportOnly)) {
  const abs = join(root, k.file);
  const lines = existsSync(abs) ? readFileSync(abs, "utf8").split("\n") : [];
  if (lines[k.line - 1]?.includes(k.includes)) pending.push(`${k.file}:${k.line}  ${lines[k.line - 1].trim()}`);
  else stale.push(`${k.file}:${k.line} (allowlist entry no longer matches; F0 done or line moved: update the allowlist)`);
}
for (const k of KNOWN_PENDING_F0.filter((k) => !k.reportOnly)) {
  if (!pending.some((p) => p.startsWith(`${k.file}:${k.line} `))) stale.push(`${k.file}:${k.line} (allowlist entry no longer matches)`);
}

if (pending.length) {
  console.log("KNOWN PENDING F0 (allowlisted, not failing yet):");
  pending.forEach((p) => console.log("  - " + p));
}
if (stale.length) {
  console.log("STALE ALLOWLIST ENTRIES (warning):");
  stale.forEach((p) => console.log("  - " + p));
}
if (failures.length) {
  console.error("FAIL directory ranking neutrality: commercial signal in ordering code:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`PASS directory ranking neutrality (${pending.length} known pending F0 item(s) allowlisted).`);
