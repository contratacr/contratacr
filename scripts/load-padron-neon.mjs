// Loads the Costa Rican TSE padrón into Neon Postgres for identity matching.
//
// Data minimization: stores ONLY cedula + the three name fields used for matching.
//
// Usage (after downloading + unzipping padron_completo.txt):
//   PADRON_DATABASE_URL=postgresql://... node scripts/load-padron-neon.mjs ./padron_completo.txt
//
// Safe reload: rows are loaded into `padron_staging`, then promoted to `padron`.

import fs from "node:fs";
import readline from "node:readline";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.PADRON_DATABASE_URL?.trim();
const FILE = process.argv[2];
const BATCH = Number(process.env.PADRON_LOAD_BATCH || 1000);

if (!DATABASE_URL) {
  console.error("Missing PADRON_DATABASE_URL");
  process.exit(1);
}
if (!FILE || !fs.existsSync(FILE)) {
  console.error("Pass the path to padron_completo.txt");
  process.exit(1);
}
if (!Number.isFinite(BATCH) || BATCH < 100 || BATCH > 5000) {
  console.error("PADRON_LOAD_BATCH must be between 100 and 5000");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

function clean(s) {
  return (s ?? "").trim();
}

async function exec(query, params = []) {
  return sql(query, params);
}

async function ensureSchema() {
  await exec(`
    create table if not exists public.padron (
      cedula text primary key,
      nombre text,
      papellido text,
      sapellido text
    )
  `);
  await exec(`
    create table if not exists public.padron_staging (
      cedula text primary key,
      nombre text,
      papellido text,
      sapellido text
    )
  `);
}

async function clearStaging() {
  await exec("truncate table public.padron_staging");
}

async function flush(rows) {
  if (rows.length === 0) return;
  const params = [];
  const values = rows.map((row, index) => {
    const offset = index * 4;
    params.push(row.cedula, row.nombre, row.papellido, row.sapellido);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
  }).join(",");

  await exec(
    `
      insert into public.padron_staging (cedula, nombre, papellido, sapellido)
      values ${values}
      on conflict (cedula) do update set
        nombre = excluded.nombre,
        papellido = excluded.papellido,
        sapellido = excluded.sapellido
    `,
    params,
  );
}

async function promoteStaging() {
  await exec("begin");
  try {
    await exec("drop table if exists public.padron_old");
    await exec("alter table if exists public.padron rename to padron_old");
    await exec("alter table public.padron_staging rename to padron");
    await exec(`
      create table public.padron_staging (
        cedula text primary key,
        nombre text,
        papellido text,
        sapellido text
      )
    `);
    await exec("drop table if exists public.padron_old");
    await exec("commit");
  } catch (error) {
    await exec("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  console.log("Ensuring Neon padrón schema…");
  await ensureSchema();

  console.log("Clearing staging…");
  await clearStaging();

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
    batch.push({ cedula, nombre: clean(f[5]), papellido: clean(f[6]), sapellido: clean(f[7]) });
    if (batch.length >= BATCH) {
      await flush(batch);
      total += batch.length;
      batch = [];
      if (total % 100000 === 0) console.log(`  ${total} rows…`);
    }
  }
  await flush(batch);
  total += batch.length;
  console.log(`Loaded ${total} rows into Neon staging.`);

  console.log("Promoting staging → live…");
  await promoteStaging();
  console.log("Done. Neon padrón is live.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
