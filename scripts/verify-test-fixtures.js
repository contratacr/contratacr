const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const TEST_SUPABASE_REF = "sodegkfjjrdkbohycqyq";
const REGRESSION_SEED = "full-app-regression-v1";
const MOBILE_SEED = "mobile-test-demo";
const envFile = process.env.DEMO_ENV_FILE || ".env.test";

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
} else if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(`Missing ${envFile} and explicit test Supabase environment variables.`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let projectRef = "invalid";
try {
  projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "unknown";
} catch {}

if (projectRef !== TEST_SUPABASE_REF) {
  throw new Error(`Refusing to verify Supabase project ${projectRef}; expected ${TEST_SUPABASE_REF}.`);
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const ids = {
  jobs: Array.from({ length: 5 }, (_, index) => `a1100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  offers: Array.from({ length: 5 }, (_, index) => `a2200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  applications: Array.from({ length: 6 }, (_, index) => `a3300000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  tickets: Array.from({ length: 3 }, (_, index) => `a4400000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
};

async function rows(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCleanText(label, value) {
  const serialized = JSON.stringify(value);
  expect(!/[\uFFFD]|(?:\u00c3|\u00c2)/u.test(serialized), `${label} contains broken UTF-8 text.`);
  expect(!/\\\\u00[0-9a-f]{2}/i.test(serialized), `${label} contains a literal Unicode escape.`);
}

async function findMirroredProfessionalByBusinessName(businessName, selection) {
  const professionals = await rows(
    `${businessName} professionals`,
    supabase.from("professionals").select(selection).ilike("business_name", businessName),
  );
  if (!professionals.length) return null;

  const profiles = await rows(
    `${businessName} profiles`,
    supabase.from("profiles").select("id,email").in("id", professionals.map((row) => row.profile_id)),
  );
  const mirroredProfileIds = new Set(
    profiles
      .filter((profile) => /^prod\+.*@mirror\.contratacr\.test$/i.test(profile.email || ""))
      .map((profile) => profile.id),
  );
  return professionals.find((row) => mirroredProfileIds.has(row.profile_id)) || professionals[0];
}

async function main() {
  const [isaac] = await rows(
    "Isaac profile",
    supabase.from("profiles").select("id,email,full_name,avatar_url,onboarding_completed,is_provider,is_disabled").eq("email", "isaacsanchezmonge@gmail.com").limit(1),
  );
  expect(isaac, "The ContrataCR regression account is missing.");

  const [contrata] = await rows(
    "ContrataCR professional",
    supabase.from("professionals").select("id,profile_id,slug,business_name,bio,services,portfolio_items,portfolio_urls,languages,workplaces,coverage_provincias,is_verified,verification_status,availability_public,allow_phone_call,whatsapp,contact_email,social_links,certifications").eq("profile_id", isaac.id).limit(1),
  );
  const professionalSelection = "id,profile_id,slug,business_name,bio,services,portfolio_items,portfolio_urls,languages,workplaces,coverage_provincias,is_verified,verification_status,availability_public,allow_phone_call,whatsapp,contact_email,social_links,certifications";
  const sg = await findMirroredProfessionalByBusinessName("SG Solutions", professionalSelection);
  expect(contrata && sg, "ContrataCR and SG Solutions must both exist in test.");

  const professionalProfiles = await rows(
    "professional profiles",
    supabase.from("profiles").select("id,full_name,avatar_url,onboarding_completed,is_provider,is_disabled").in("id", [contrata.profile_id, sg.profile_id]),
  );
  const profileById = new Map(professionalProfiles.map((profile) => [profile.id, profile]));

  for (const [name, professional] of [["ContrataCR", contrata], ["SG Solutions", sg]]) {
    const profile = profileById.get(professional.profile_id);
    const service = professional.services?.[0];
    expect(profile?.full_name && profile.avatar_url, `${name} is missing its profile name or photo.`);
    expect(profile.onboarding_completed && profile.is_provider && !profile.is_disabled, `${name} is not an active completed provider account.`);
    expect(professional.business_name && professional.bio, `${name} is missing its public identity.`);
    expect(Array.isArray(professional.services) && professional.services.length > 0, `${name} has no services.`);
    expect(service?.active && service.description && service.priceType && service.startedAt && service.imageUrl, `${name} has an incomplete service.`);
    expect(Array.isArray(service.modalities) && service.modalities.length > 0, `${name} service has no modality.`);
    expect(Array.isArray(professional.portfolio_items) && professional.portfolio_items.length > 0, `${name} has no success story.`);
    expect(Array.isArray(professional.portfolio_urls) && professional.portfolio_urls.length > 0, `${name} has no portfolio image.`);
    expect(Array.isArray(professional.workplaces) && professional.workplaces.length > 0, `${name} has no workplace coverage.`);
    expect(Array.isArray(professional.languages) && professional.languages.length > 0, `${name} has no language.`);
    expect(professional.is_verified && professional.verification_status === "verified", `${name} is not verified.`);
    expect(professional.whatsapp && professional.allow_phone_call && professional.contact_email, `${name} has incomplete contact data.`);
    expect(professional.social_links && Object.values(professional.social_links).some(Boolean), `${name} has no public link.`);
    expect(Array.isArray(professional.certifications) && professional.certifications.length > 0, `${name} has no education or certification.`);
    assertCleanText(name, professional);
    assertCleanText(`${name} profile`, profile);
  }

  const [jobs, offers, applications, tickets, savedItems, reviews, bookings, projects, follows, notifications] = await Promise.all([
    rows("regression jobs", supabase.from("job_posts").select("id,title,status").in("id", ids.jobs)),
    rows("regression offers", supabase.from("professional_offers").select("id,title,status,service_label").in("id", ids.offers)),
    rows("regression applications", supabase.from("job_applications").select("id,status,job_id").in("id", ids.applications)),
    rows("regression support", supabase.from("support_tickets").select("id,status,subject,message").in("id", ids.tickets)),
    rows("regression saved items", supabase.from("saved_items").select("id,item_type,item_id").in("item_id", [...ids.jobs, ...ids.offers])),
    rows("demo reviews", supabase.from("reviews").select("id,professional_id,comment,job_title").eq("created_app_environment", MOBILE_SEED)),
    rows("demo bookings", supabase.from("bookings").select("id,status,professional_id").eq("created_app_environment", MOBILE_SEED)),
    rows("demo projects", supabase.from("projects").select("id,status,client_id").eq("created_app_environment", MOBILE_SEED)),
    rows("regression follows", supabase.from("professional_follows").select("follower_id,professional_id").or(`professional_id.eq.${contrata.id},professional_id.eq.${sg.id}`)),
    rows("regression notifications", supabase.from("notifications").select("id,type,title,message,data").eq("user_id", isaac.id).limit(500)),
  ]);

  expect(jobs.length === 5, `Expected 5 deterministic jobs, found ${jobs.length}.`);
  expect(offers.length === 5, `Expected 5 deterministic offers, found ${offers.length}.`);
  expect(applications.length === 6, `Expected 6 deterministic applications, found ${applications.length}.`);
  expect(tickets.length === 3, `Expected 3 deterministic support tickets, found ${tickets.length}.`);
  expect(savedItems.length === 4, `Expected 4 deterministic saved items, found ${savedItems.length}.`);
  expect(reviews.some((review) => review.professional_id === contrata.id), "ContrataCR needs a test review.");
  expect(reviews.some((review) => review.professional_id === sg.id), "SG Solutions needs a test review.");
  expect(bookings.length >= 4, `Expected at least 4 demo bookings, found ${bookings.length}.`);
  expect(projects.length >= 3, `Expected at least 3 demo projects, found ${projects.length}.`);
  expect(follows.length >= 2, `Expected seeded follow relationships, found ${follows.length}.`);

  const seededNotifications = notifications.filter((notification) => notification.data?.regressionSeed === REGRESSION_SEED);
  expect(seededNotifications.length >= 4, `Expected at least 4 linked regression notifications, found ${seededNotifications.length}.`);
  for (const notification of seededNotifications) {
    expect(notification.data?.link, `Notification ${notification.id} is not linkable.`);
  }

  assertCleanText("jobs", jobs);
  assertCleanText("offers", offers);
  assertCleanText("support", tickets);
  assertCleanText("reviews", reviews);
  assertCleanText("notifications", seededNotifications);

  console.log(JSON.stringify({
    projectRef,
    professionals: [contrata.business_name, sg.business_name],
    jobs: jobs.length,
    offers: offers.length,
    applications: applications.length,
    supportTickets: tickets.length,
    savedItems: savedItems.length,
    demoReviews: reviews.length,
    demoBookings: bookings.length,
    demoProjects: projects.length,
    linkedNotifications: seededNotifications.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
