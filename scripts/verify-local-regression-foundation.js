/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
let parsed;

try {
  parsed = new URL(url);
} catch {
  throw new Error("Local regression verification requires a valid Supabase URL.");
}
if (
  process.env.LOCAL_REGRESSION_SEED !== "1"
  || !["127.0.0.1", "localhost"].includes(parsed.hostname)
  || !serviceRole
  || !anonKey
) {
  throw new Error("Refusing to verify anything except the explicit loopback Supabase stack.");
}

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const expected = [
  {
    profileId: "048f1b3a-23c0-41bc-8728-10f8aed70fdb",
    professionalId: "ae9caa2b-1fca-4411-9aeb-7736f5bbf42f",
    email: "e2e.client@contratacr.test",
    businessName: "ContrataCR",
  },
  {
    profileId: "347f5202-8b3e-4c11-8db8-1060ea5e487d",
    professionalId: "988428c7-a0b6-4d9e-a9b8-e0209a1ca296",
    email: "e2e.pro@contratacr.test",
    businessName: "SG Solutions",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  for (const actor of expected) {
    const authUser = await admin.auth.admin.getUserById(actor.profileId);
    if (authUser.error) throw new Error(`Auth ${actor.businessName}: ${authUser.error.message}`);
    assert(authUser.data.user?.email === actor.email, `${actor.businessName} has the wrong local Auth email.`);

    const professional = await must(
      `professional ${actor.businessName}`,
      admin.from("professionals")
        .select("id,profile_id,business_name,services,portfolio_items,certifications,languages,profiles!inner(email)")
        .eq("id", actor.professionalId)
        .eq("profile_id", actor.profileId)
        .single(),
    );
    assert(professional.business_name === actor.businessName, `${actor.businessName} has the wrong business name.`);
    assert(professional.profiles.email === actor.email, `${actor.businessName} has the wrong profile email.`);
    for (const field of ["services", "portfolio_items", "certifications", "languages"]) {
      assert(Array.isArray(professional[field]) && professional[field].length > 0, `${actor.businessName} is missing ${field}.`);
    }

    const publicRow = await must(
      `anonymous professional ${actor.businessName}`,
      anonymous.from("professionals").select("id,business_name").eq("id", actor.professionalId).single(),
    );
    assert(publicRow.business_name === actor.businessName, `${actor.businessName} is not visible through public RLS.`);
  }

  const padron = await must("service-role padrón lookup", admin.rpc("padron_lookup", { p_cedula: "100000001" }));
  assert(Array.isArray(padron) && padron.length === 1, "Synthetic padrón lookup did not return exactly one row.");

  const deniedPadron = await anonymous.rpc("padron_lookup", { p_cedula: "100000001" });
  assert(Boolean(deniedPadron.error), "Anonymous callers must not execute padrón lookup.");

  const buckets = await must("local storage buckets", admin.storage.listBuckets());
  assert(buckets.some((bucket) => bucket.name === "direct-message-attachments"), "Private local storage bucket is missing.");

  console.log("Verified local Auth, profiles, professionals, RLS, padrón isolation and Storage foundation.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
