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
// La misma pareja inventada que siembra el arranque local.
const ACTORES = require("./actores-de-regresion.json");
const expected = [ACTORES.cliente, ACTORES.profesional].map((actor) => ({
  profileId: actor.profileId,
  professionalId: actor.professionalId,
  email: actor.correo,
  businessName: actor.negocio,
}));

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
    const hiddenModeration = await anonymous
      .from("professionals")
      .select("banned_reason")
      .eq("id", actor.professionalId)
      .limit(1);
    assert(Boolean(hiddenModeration.error), "Anonymous callers must not read professional moderation fields.");

    const authenticated = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const login = await authenticated.auth.signInWithPassword({
      email: actor.email,
      password: process.env.LOCAL_REGRESSION_PASSWORD,
    });
    if (login.error) throw new Error(`Login ${actor.businessName}: ${login.error.message}`);
    assert(login.data.user?.id === actor.profileId, `${actor.businessName} login returned the wrong account.`);
    const ownProfessional = await must(
      `authenticated professional ${actor.businessName}`,
      authenticated.from("professionals")
        .select("id,profile_id,business_name")
        .eq("profile_id", actor.profileId)
        .single(),
    );
    assert(ownProfessional.id === actor.professionalId, `${actor.businessName} cannot read its own professional row.`);
    const hiddenIdentity = await authenticated
      .from("profiles")
      .select("cedula")
      .eq("id", actor.profileId)
      .limit(1);
    assert(Boolean(hiddenIdentity.error), "Authenticated callers must use get_my_profile for private identity fields.");
    await must(
      `authenticated notifications ${actor.businessName}`,
      authenticated.from("notifications").select("id").eq("user_id", actor.profileId).limit(1),
    );
    const logout = await authenticated.auth.signOut();
    if (logout.error) throw new Error(`Logout ${actor.businessName}: ${logout.error.message}`);
  }

  // Migration 173 moved the padrón to Cloudflare D1. A local Supabase rebuild
  // must prove that the legacy RPC and tables stay absent rather than seeding
  // a second source of truth that production no longer has.
  const removedPadronRpc = await admin.rpc("padron_lookup", { p_cedula: "100000001" });
  assert(Boolean(removedPadronRpc.error), "The removed Supabase padrón RPC unexpectedly exists.");
  for (const table of ["padron", "padron_staging"]) {
    const directPadron = await admin.from(table).select("cedula").limit(1);
    assert(Boolean(directPadron.error), `The removed Supabase table ${table} unexpectedly exists.`);
  }

  const buckets = await must("local storage buckets", admin.storage.listBuckets());
  assert(buckets.some((bucket) => bucket.name === "direct-message-attachments"), "Private local storage bucket is missing.");

  console.log("Verified local Auth, profiles, professionals, RLS, D1 padrón cutover and Storage foundation.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
