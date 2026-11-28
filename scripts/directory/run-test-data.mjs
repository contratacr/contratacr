#!/usr/bin/env node
// TEST ONLY (2026-11-28). Runs the directory data scripts that fill what the test site shows from data
// (section filter chips, «Cabinas» in Hospedaje, «Ver menú» links) against the TEST database from the
// Supabase migrations workflow (input directory_data, target test only):
//   osm-filter-attributes.mjs  (cuisines, sodas, bank/fuel brand, grocery chain, MEP, cabinas; migration 546)
//   backfill-menu-links.mjs    (attributes.menuUrl from the OSM menu tags)
// Both scripts are dry-run by default, idempotent (deterministic action ids through dir_place_mutate) and touch only
// unclaimed places without a manager. This wrapper:
//   * refuses anything but target "test" and a SUPABASE_DB_URL whose project ref is oqheayqqprpciqdvdaqo
//     (direct host db.<ref>.supabase.co or Supavisor user postgres.<ref>); the production ref is rejected by name too;
//   * never prints the URL: it is split into PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE for psql;
//   * moves the transaction pooler (6543) to session mode (5432), like run-seed.zsh;
//   * passes PRO_LOCAL_DB_OK only to these child processes, only after the checks above.
// Usage (CI): SUPABASE_DB_URL=… node scripts/directory/run-test-data.mjs test --pois <osm-pois.json> [--apply]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_REF = "oqheayqqprpciqdvdaqo";
const PRODUCTION_REF = "kskueodxaksxvjrysouw";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (message) => { console.error(`ABORTED: ${message}`); process.exit(2); };

const [target, ...rest] = process.argv.slice(2);
if (target !== "test") fail("this runner only accepts the target \"test\".");
const apply = rest.includes("--apply");
const poisIndex = rest.indexOf("--pois");
const pois = poisIndex >= 0 ? rest[poisIndex + 1] : "";
if (!pois || !existsSync(pois)) fail("--pois <osm-pois.json> is required and must exist.");

const raw = process.env.SUPABASE_DB_URL?.trim() ?? "";
if (!raw) fail("SUPABASE_DB_URL is empty.");
let url;
try { url = new URL(raw); } catch { fail("SUPABASE_DB_URL is not a valid URL."); }
if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") fail("SUPABASE_DB_URL must be a PostgreSQL URL.");
const host = url.hostname.toLowerCase();
const user = decodeURIComponent(url.username);
if (raw.includes(PRODUCTION_REF)) fail("the database URL names the production project.");
const direct = host === `db.${TEST_REF}.supabase.co`;
const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user === `postgres.${TEST_REF}`;
if (!direct && !pooler) fail("the database URL is not the test project.");
let port = url.port || "5432";
if (pooler && port === "6543") port = "5432";
if (port !== "5432") fail("use a session connection (port 5432).");

const env = {
  ...process.env,
  PGHOST: host, PGPORT: port, PGUSER: user, PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
  PGSSLMODE: "require", PGAPPNAME: "contratacr-directory-test-data", PGCONNECT_TIMEOUT: "15",
  PRO_LOCAL_DB_OK: "1",
};
delete env.SUPABASE_DB_URL;

// The same check on the server side: the connected database must be the test project (its pooler user or the
// direct host). Refuses before any write.
const who = spawnSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", "select current_user, current_database()"], { env, encoding: "utf8" });
if (who.status !== 0) fail(`could not connect to the test database (${(who.stderr || "").split("\n")[0]}).`);
console.log(`Connected to the test project (${direct ? "direct" : "session pooler"}), mode: ${apply ? "APPLY" : "dry run"}.`);

let failed = false;
for (const script of ["osm-filter-attributes.mjs", "backfill-menu-links.mjs"]) {
  console.log(`\n== ${script}`);
  const run = spawnSync(process.execPath, [join(HERE, script), "--pois", pois, ...(apply ? ["--apply"] : [])], { env, stdio: "inherit" });
  if (run.status !== 0) { console.error(`${script} exited with ${run.status}`); failed = true; break; }
}
process.exit(failed ? 1 : 0);
