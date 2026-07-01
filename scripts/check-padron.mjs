import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.split("=");
  args.set(key.replace(/^--/, ""), value);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sampleCedula = args.get("sample") || process.env.PADRON_SAMPLE_CEDULA || "101053316";

if (!url || !key) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: anyRow, error: anyError } = await db
    .from("padron")
    .select("cedula")
    .limit(1)
    .maybeSingle();

  if (anyError) {
    console.error(`Padron table check failed: ${anyError.message}`);
    process.exit(1);
  }

  if (!anyRow) {
    console.error("Padron table is reachable but empty.");
    process.exit(1);
  }

  const { data, error } = await db.rpc("padron_lookup", { p_cedula: sampleCedula });
  const row = Array.isArray(data) ? data[0] : data;

  if (error) {
    console.error(`padron_lookup failed: ${error.message}`);
    process.exit(1);
  }

  if (!row) {
    console.error(`Padron sample ${sampleCedula} was not found through padron_lookup.`);
    process.exit(1);
  }

  const fullName = [row.nombre, row.papellido, row.sapellido].filter(Boolean).join(" ").trim();
  console.log(`Padron is ready. Sample ${sampleCedula}: ${fullName || "(name available)"}`);
}

main();
