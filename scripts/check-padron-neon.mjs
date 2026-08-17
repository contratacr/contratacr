import { neon } from "@neondatabase/serverless";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.split("=");
  args.set(key.replace(/^--/, ""), value);
}

const databaseUrl = process.env.PADRON_DATABASE_URL?.trim();
const sampleCedula = args.get("sample") || process.env.PADRON_SAMPLE_CEDULA || "101053316";

if (!databaseUrl) {
  console.error("Missing PADRON_DATABASE_URL.");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  const rows = await sql`
    select cedula, nombre, papellido, sapellido
    from public.padron
    where cedula = ${sampleCedula}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    console.error(`Neon padrón sample ${sampleCedula} was not found.`);
    process.exit(1);
  }

  const fullName = [row.nombre, row.papellido, row.sapellido].filter(Boolean).join(" ").trim();
  console.log(`Neon padrón is ready. Sample ${sampleCedula}: ${fullName || "(name available)"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
