/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const TEST_PROJECT_REF = "sodegkfjjrdkbohycqyq";
const envFile = process.env.DEMO_ENV_FILE || ".env.test";
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const password = process.env.REGRESSION_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "ContrataCR!2026";
let ref = "invalid";
try { ref = new URL(url).hostname.split(".")[0]; } catch {}
if (ref !== TEST_PROJECT_REF || !serviceRole) throw new Error("Fixture verification only runs against the test Supabase project.");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function actor(name, email) {
  const rows = await must(name, admin.from("professionals").select("*,profiles(*)").ilike("business_name", name).limit(20));
  const row = rows.find((item) => item.profiles?.email === email);
  assert(row, `Missing regression actor ${name} with ${email}.`);
  assert(row.profiles.avatar_url, `${name} must retain its production profile photo.`);
  assert(Array.isArray(row.services) && row.services.length, `${name} needs services.`);
  assert(Array.isArray(row.portfolio_items) && row.portfolio_items.length, `${name} needs success cases.`);
  assert(Array.isArray(row.certifications) && row.certifications.length, `${name} needs training/certifications.`);
  assert(Array.isArray(row.languages) && row.languages.length, `${name} needs languages.`);
  return { professional: row, profile: row.profiles };
}

async function verifyCount(table, filter, minimum, label) {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  assert((count || 0) >= minimum, `${label}: expected at least ${minimum}, found ${count || 0}.`);
}

async function main() {
  const contratacr = await actor("ContrataCR", "e2e.client@contratacr.test");
  const sg = await actor("SG Solutions", "e2e.pro@contratacr.test");
  const allowedProfiles = new Set([contratacr.profile.id, sg.profile.id]);
  const allowedProfessionals = new Set([contratacr.professional.id, sg.professional.id]);

  const professionals = await must("professionals", admin.from("professionals").select("id,slug,business_name,created_app_environment").limit(5000));
  assert(professionals.length > 2, "The production professional directory was not mirrored.");
  const { count: publicProfessionalCount, error: publicProfessionalError } = await publicClient
    .from("professionals")
    .select("id", { count: "exact", head: true });
  if (publicProfessionalError) throw new Error(`public professionals: ${publicProfessionalError.message}`);
  assert((publicProfessionalCount || 0) > 2, "The mirrored directory is not visible through the public test API key.");
  const obsolete = professionals.filter((row) =>
    /^test-/i.test(row.slug || "") || /mobile-test-seed|full-app-regression-v1/i.test(row.created_app_environment || ""),
  );
  assert(!obsolete.length, `Obsolete fake professionals remain: ${obsolete.map((row) => row.slug || row.business_name).join(", ")}`);

  const conversations = await must("conversations", admin.from("direct_conversations").select("client_id,professional_id,professional_profile_id"));
  assert(conversations.length >= 2, "Expected both regression conversations.");
  for (const row of conversations) {
    assert(allowedProfiles.has(row.client_id) && allowedProfiles.has(row.professional_profile_id), "A private conversation includes a real production user.");
    assert(allowedProfessionals.has(row.professional_id), "A private conversation includes an unexpected professional.");
  }

  const bookings = await must("bookings", admin.from("bookings").select("client_id,professional_id"));
  assert(bookings.length >= 2, "Expected cross-profile bookings.");
  for (const row of bookings) {
    assert(allowedProfiles.has(row.client_id) && allowedProfessionals.has(row.professional_id), "A test booking includes an unexpected user.");
  }

  await Promise.all([
    verifyCount("professional_follows", {}, 2, "follows"),
    verifyCount("saved_professionals", {}, 2, "saved professionals"),
    verifyCount("projects", {}, 2, "projects"),
    verifyCount("proposals", {}, 2, "proposals"),
    verifyCount("direct_messages", {}, 4, "direct messages"),
    verifyCount("job_posts", {}, 2, "jobs"),
    verifyCount("job_applications", {}, 2, "job applications"),
    verifyCount("professional_offers", {}, 2, "offers"),
    verifyCount("saved_items", {}, 2, "saved marketplace items"),
    verifyCount("support_tickets", {}, 2, "support tickets"),
    verifyCount("support_ticket_messages", {}, 2, "support messages"),
    verifyCount("reviews", {}, 2, "reviews"),
    verifyCount("notifications", {}, 2, "notifications"),
    verifyCount("availability_weekly", {}, 2, "weekly availability"),
    verifyCount("availability_slots", {}, 2, "availability slots"),
    verifyCount("availability_exceptions", {}, 2, "availability exceptions"),
    verifyCount("blocked_dates", {}, 2, "blocked dates"),
  ]);

  if (anonKey) {
    for (const email of ["e2e.client@contratacr.test", "e2e.pro@contratacr.test"]) {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(`Regression login failed for ${email}: ${error.message}`);
      await client.auth.signOut();
    }
  }

  console.log(JSON.stringify({
    verified: true,
    professionals: professionals.length,
    actors: [contratacr.professional.business_name, sg.professional.business_name],
    privateCommunicationActors: [...allowedProfiles],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
