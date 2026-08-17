// Loads the Costa Rican TSE padrón into Supabase for identity matching.
//
// The TSE publishes the electoral roll publicly and free at:
//   https://www.tse.go.cr/zip/padron/padron_completo.zip
// (padron_completo.txt — comma-delimited, ISO-8859-1; fields:
//  CEDULA,CODELEC,SEXO,FECHACADUC,JUNTA,NOMBRE,PAPELLIDO,SAPELLIDO)
//
// Data minimization: we load ONLY cedula + the three name fields (matching data).
//
// Usage (after downloading + unzipping the txt):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/load-padron.mjs ./padron_completo.txt
//
// Safe reload: rows go into `padron_staging`, then `finalize_padron_swap()`
// atomically promotes staging → live so verification is never down mid-update.

import fs from "node:fs";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FILE = process.argv[2];

if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!FILE || !fs.existsSync(FILE)) { console.error("Pass the path to padron_completo.txt"); process.exit(1); }

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const BATCH = 5000;

function clean(s) { return (s ?? "").trim(); }

async function flush(rows) {
  if (rows.length === 0) return;
  const { error } = await db.from("padron_staging").insert(rows);
  if (error) { console.error("insert error:", error.message); process.exit(1); }
}

async function main() {
  console.log("Clearing staging…");
  const { error: clearError } = await db.from("padron_staging").delete().neq("cedula", "");
  if (clearError) { console.error("clear staging error:", clearError.message); process.exit(1); }

  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });

  let batch = [];
  let total = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split(",");
    const cedula = clean(f[0]);
    if (!cedula) continue;
    batch.push({ cedula, nombre: clean(f[4]), papellido: clean(f[5]), sapellido: clean(f[6]) });
    if (batch.length >= BATCH) { await flush(batch); total += batch.length; batch = []; if (total % 100000 === 0) console.log(`  ${total} rows…`); }
  }
  await flush(batch); total += batch.length;
  console.log(`Loaded ${total} rows into staging.`);

  console.log("Swapping staging → live…");
  const { error } = await db.rpc("finalize_padron_swap");
  if (error) { console.error("swap error:", error.message); process.exit(1); }
  console.log("Done. Padrón is live.");
}

main();
