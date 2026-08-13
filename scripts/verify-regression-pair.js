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
const password = process.env.REGRESSION_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "";
let ref = "invalid";
try { ref = new URL(url).hostname.split(".")[0]; } catch {}
if (ref !== TEST_PROJECT_REF || !serviceRole) throw new Error("Fixture verification only runs against the test Supabase project.");
if (!anonKey || !password) throw new Error("Fixture verification requires the test anon key and E2E_TEST_PASSWORD.");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });
const CANONICAL_ACTORS = {
  contratacr: {
    businessName: "ContrataCR",
    email: "e2e.client@contratacr.test",
    profileId: "048f1b3a-23c0-41bc-8728-10f8aed70fdb",
    professionalId: "ae9caa2b-1fca-4411-9aeb-7736f5bbf42f",
  },
  sg: {
    businessName: "SG Solutions",
    email: "e2e.pro@contratacr.test",
    profileId: "347f5202-8b3e-4c11-8db8-1060ea5e487d",
    professionalId: "988428c7-a0b6-4d9e-a9b8-e0209a1ca296",
  },
};

const deterministicIds = (prefix, count) => Array.from(
  { length: count },
  (_, index) => `${prefix}${String(index + 1).padStart(12, "0")}`,
);

const REQUIRED_FIXTURE_IDS = {
  pairConversations: deterministicIds("b6000000-0000-4000-8000-", 2),
  pairMessages: deterministicIds("b7000000-0000-4000-8000-", 4),
  pairReviews: deterministicIds("be000000-0000-4000-8000-", 2),
  pairNotifications: deterministicIds("bf000000-0000-4000-8000-", 2),
  weekly: deterministicIds("c1000000-0000-4000-8000-", 2),
  slots: deterministicIds("c2000000-0000-4000-8000-", 6),
  blocked: deterministicIds("c4000000-0000-4000-8000-", 2),
  coverageBookings: deterministicIds("d1000000-0000-4000-8000-", 6),
  coverageProjects: deterministicIds("d2000000-0000-4000-8000-", 6),
  coverageProposals: deterministicIds("d3000000-0000-4000-8000-", 6),
  coverageJobs: deterministicIds("d4000000-0000-4000-8000-", 12),
  coverageApplications: deterministicIds("d5000000-0000-4000-8000-", 12),
  coverageOffers: deterministicIds("d6000000-0000-4000-8000-", 10),
  coverageTickets: deterministicIds("d7000000-0000-4000-8000-", 6),
  coverageTicketMessages: deterministicIds("d8000000-0000-4000-8000-", 6),
  coverageNotifications: deterministicIds("d9000000-0000-4000-8000-", 6),
};

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function actor(expected) {
  const row = await must(
    expected.businessName,
    admin.from("professionals")
      .select("*,profiles(*)")
      .eq("id", expected.professionalId)
      .eq("profile_id", expected.profileId)
      .single(),
  );
  assert(row?.profiles?.id === expected.profileId, `Missing canonical regression actor ${expected.businessName}.`);
  assert(row.profiles.email === expected.email, `${expected.businessName} must use only ${expected.email} in test.`);
  assert((row.business_name || "").trim().toLowerCase() === expected.businessName.toLowerCase(), `${expected.businessName} has an unexpected canonical name.`);
  assert(row.profiles.avatar_url, `${expected.businessName} must retain its production profile photo.`);
  assert(Array.isArray(row.services) && row.services.length, `${expected.businessName} needs services.`);
  assert(Array.isArray(row.portfolio_items) && row.portfolio_items.length, `${expected.businessName} needs success cases.`);
  assert(Array.isArray(row.certifications) && row.certifications.length, `${expected.businessName} needs training/certifications.`);
  assert(Array.isArray(row.languages) && row.languages.length, `${expected.businessName} needs languages.`);
  return { professional: row, profile: row.profiles };
}

async function verifyIds(table, ids, label) {
  const rows = await must(label, admin.from(table).select("id").in("id", ids));
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  assert(!missing.length, `${label}: missing deterministic fixtures ${missing.join(", ")}.`);
}

function assertRows(label, rows, predicate) {
  const unexpected = rows.filter((row) => !predicate(row));
  assert(
    !unexpected.length,
    `${label}: private rows outside ContrataCR/SG remain: ${unexpected.slice(0, 10).map((row) => row.id).join(", ")}.`,
  );
}

async function verifyPrivateActorIsolation(owners) {
  const profileIds = new Set(owners.map((owner) => owner.profile.id));
  const professionalIds = new Set(owners.map((owner) => owner.professional.id));
  const safeEmails = new Set(owners.map((owner) => owner.profile.email.toLowerCase()));
  const [
    bookings,
    projects,
    conversations,
    jobs,
    offers,
    follows,
    savedProfessionals,
    supportTickets,
    supportMessages,
    reviews,
    notifications,
    deletionRequests,
    reports,
  ] = await Promise.all([
    must("private bookings", admin.from("bookings").select("id,client_id,professional_id").limit(5000)),
    must("private projects", admin.from("projects").select("id,client_id,accepted_professional_id").limit(5000)),
    must("private conversations", admin.from("direct_conversations").select("id,client_id,professional_id,professional_profile_id").limit(5000)),
    must("pair jobs", admin.from("job_posts").select("id,employer_id").in("employer_id", [...professionalIds]).limit(5000)),
    must("pair offers", admin.from("professional_offers").select("id,professional_id").in("professional_id", [...professionalIds]).limit(5000)),
    must("private follows", admin.from("professional_follows").select("id,follower_id,professional_id").limit(5000)),
    must("private saved professionals", admin.from("saved_professionals").select("id,client_id,professional_id").limit(5000)),
    must("private support tickets", admin.from("support_tickets").select("id,user_id,professional_id").limit(5000)),
    must("private legacy support", admin.from("support_messages").select("id,user_id,email").limit(5000)),
    must("private reviews", admin.from("reviews").select("id,client_id,professional_id").limit(5000)),
    must("private notifications", admin.from("notifications").select("id,user_id,data").limit(5000)),
    must("deletion request isolation", admin.from("account_deletion_requests").select("id,user_id,status").limit(5000)),
    must("private reports", admin.from("reports").select("id,professional_id,reported_client_id,reporter_professional_id,reporter_email").limit(5000)),
  ]);

  assertRows("bookings", bookings, (row) => profileIds.has(row.client_id) && professionalIds.has(row.professional_id));
  assertRows("projects", projects, (row) => profileIds.has(row.client_id)
    && (!row.accepted_professional_id || professionalIds.has(row.accepted_professional_id)));
  assertRows("direct conversations", conversations, (row) => profileIds.has(row.client_id)
    && professionalIds.has(row.professional_id)
    && profileIds.has(row.professional_profile_id));
  assertRows("professional follows", follows, (row) => profileIds.has(row.follower_id) && professionalIds.has(row.professional_id));
  assertRows("saved professionals", savedProfessionals, (row) => profileIds.has(row.client_id) && professionalIds.has(row.professional_id));
  assertRows("support tickets", supportTickets, (row) => (profileIds.has(row.user_id) || professionalIds.has(row.professional_id))
    && (!row.user_id || profileIds.has(row.user_id))
    && (!row.professional_id || professionalIds.has(row.professional_id)));
  assertRows("legacy support messages", supportMessages, (row) => profileIds.has(row.user_id) && safeEmails.has((row.email || "").toLowerCase()));
  assertRows("reviews", reviews, (row) => profileIds.has(row.client_id) && professionalIds.has(row.professional_id));
  assertRows("notifications", notifications, (row) => profileIds.has(row.user_id));
  assert(!deletionRequests.length, `Completed/pending disposable deletion requests remain: ${deletionRequests.map((row) => row.id).join(", ")}.`);
  assertRows("reports", reports, (row) => {
    const reporterEmail = (row.reporter_email || "").toLowerCase();
    const hasKnownActor = professionalIds.has(row.professional_id)
      || profileIds.has(row.reported_client_id)
      || professionalIds.has(row.reporter_professional_id)
      || safeEmails.has(reporterEmail);
    return hasKnownActor
      && (!row.professional_id || professionalIds.has(row.professional_id))
      && (!row.reported_client_id || profileIds.has(row.reported_client_id))
      && (!row.reporter_professional_id || professionalIds.has(row.reporter_professional_id))
      && (!reporterEmail || safeEmails.has(reporterEmail));
  });

  const projectIds = new Set(projects.map((row) => row.id));
  const conversationIds = new Set(conversations.map((row) => row.id));
  const jobIds = new Set(jobs.map((row) => row.id));
  const offerIds = new Set(offers.map((row) => row.id));
  const ticketIds = new Set(supportTickets.map((row) => row.id));
  const [proposals, messages, applications, savedItems, ticketMessages] = await Promise.all([
    must("private proposals", admin.from("proposals").select("id,project_id,professional_id").limit(5000)),
    must("private direct messages", admin.from("direct_messages").select("id,conversation_id,sender_id").limit(5000)),
    must("private applications", admin.from("job_applications").select("id,job_id,applicant_id").limit(5000)),
    must("private saved items", admin.from("saved_items").select("id,user_id,item_type,item_id").limit(5000)),
    must("private support thread", admin.from("support_ticket_messages").select("id,ticket_id,sender_id").limit(5000)),
  ]);
  assertRows("proposals", proposals, (row) => projectIds.has(row.project_id) && professionalIds.has(row.professional_id));
  assertRows("direct messages", messages, (row) => conversationIds.has(row.conversation_id) && profileIds.has(row.sender_id));
  assertRows("job applications", applications, (row) => jobIds.has(row.job_id) && profileIds.has(row.applicant_id));
  assertRows("saved marketplace items", savedItems, (row) => profileIds.has(row.user_id)
    && ((row.item_type === "job" && jobIds.has(row.item_id)) || (row.item_type === "offer" && offerIds.has(row.item_id))));
  assertRows("support ticket messages", ticketMessages, (row) => ticketIds.has(row.ticket_id)
    && (!row.sender_id || profileIds.has(row.sender_id)));

  const allowedNotificationIds = new Set([
    ...profileIds,
    ...professionalIds,
    ...bookings.map((row) => row.id),
    ...projectIds,
    ...conversationIds,
    ...jobIds,
    ...offerIds,
    ...ticketIds,
    ...reviews.map((row) => row.id),
    ...proposals.map((row) => row.id),
    ...messages.map((row) => row.id),
    ...applications.map((row) => row.id),
    ...follows.map((row) => row.id),
    ...savedProfessionals.map((row) => row.id),
    ...savedItems.map((row) => row.id),
  ]);
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
  assertRows("notification references", notifications, (row) => {
    const references = JSON.stringify(row.data ?? {}).match(uuidPattern) ?? [];
    return references.every((id) => allowedNotificationIds.has(id.toLowerCase()));
  });
}

function verifyProfessionCoverage(owner) {
  const categories = [...new Set([
    ...(Array.isArray(owner.professional.professions) ? owner.professional.professions : []),
    owner.professional.category_id,
  ])].filter((id) => id && id !== "otro");
  const cases = Array.isArray(owner.professional.portfolio_items) ? owner.professional.portfolio_items : [];
  const certifications = Array.isArray(owner.professional.certifications) ? owner.professional.certifications : [];
  const services = Array.isArray(owner.professional.services) ? owner.professional.services : [];
  assert(
    services.some((item) => typeof item?.priceAmount === "number" && item.priceAmount > 0),
    `${owner.professional.business_name}: needs a visible regression service price.`,
  );
  for (const categoryId of categories) {
    assert(
      services.some((item) => (item?.category || categories[0]) === categoryId),
      `${owner.professional.business_name}: missing service for profession ${categoryId}.`,
    );
    assert(
      cases.some((item) => item?.profession === categoryId),
      `${owner.professional.business_name}: missing success case for profession ${categoryId}.`,
    );
    assert(
      certifications.some((item) => item?.profession === categoryId),
      `${owner.professional.business_name}: missing certification for profession ${categoryId}.`,
    );
  }
}

async function verifyNoRetiredAuthUsers() {
  const allowed = new Set(["e2e.client@contratacr.test", "e2e.pro@contratacr.test"]);
  const unexpectedProfiles = await must(
    "unexpected test profiles",
    admin.from("profiles").select("email").ilike("email", "%@contratacr.test"),
  );
  const invalidProfiles = unexpectedProfiles.filter((row) => !allowed.has((row.email || "").toLowerCase()));
  assert(!invalidProfiles.length, `Temporary or retired test profiles remain: ${invalidProfiles.map((row) => row.email).join(", ")}.`);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    const found = data.users.filter((user) => {
      const email = user.email?.toLowerCase() || "";
      return email.endsWith("@contratacr.test") && !allowed.has(email);
    });
    assert(!found.length, `Temporary or retired test auth users remain: ${found.map((user) => user.email).join(", ")}.`);
    if (data.users.length < 1000) break;
  }
}

async function verifyNoRetiredDeterministicRows() {
  const jobIds = [
    "00000000-0000-4000-8000-00000000e201",
    "00000000-0000-4000-8000-00000000e202",
    "00000000-0000-4000-8000-00000000e203",
    "00000000-0000-4000-8000-00000000e204",
  ];
  const offerIds = [
    "00000000-0000-4000-8000-00000000e301",
    "00000000-0000-4000-8000-00000000e302",
    "00000000-0000-4000-8000-00000000e303",
  ];
  const applicationIds = ["00000000-0000-4000-8000-00000000e401"];
  const [jobs, offers, applications] = await Promise.all([
    must("retired jobs", admin.from("job_posts").select("id").in("id", jobIds)),
    must("retired offers", admin.from("professional_offers").select("id").in("id", offerIds)),
    must("retired applications", admin.from("job_applications").select("id").in("id", applicationIds)),
  ]);
  const found = [...jobs, ...offers, ...applications].map((row) => row.id);
  assert(!found.length, `Retired deterministic E2E rows remain: ${found.join(", ")}.`);
}

async function verifySharedVideoSlots(owner) {
  const rows = await must(
    `${owner.professional.business_name} shared availability`,
    admin.from("availability_slots").select("slot_date,slot_time,location_id").eq("professional_id", owner.professional.id),
  );
  const videoRows = rows.filter((row) => row.location_id === "videoconsulta");
  assert(videoRows.length >= 2, `${owner.professional.business_name}: expected two video regression slots.`);
  for (const video of videoRows) {
    assert(
      rows.some((row) => row.slot_date === video.slot_date && row.slot_time === video.slot_time && row.location_id && row.location_id !== "videoconsulta"),
      `${owner.professional.business_name}: video slot ${video.slot_date} ${video.slot_time} has no matching in-person slot.`,
    );
  }
}

async function verifyCount(table, filter, minimum, label) {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  assert((count || 0) >= minimum, `${label}: expected at least ${minimum}, found ${count || 0}.`);
}

async function verifyStatuses(table, actorColumn, actorId, expected, label, valueColumn = "status") {
  const rows = await must(label, admin.from(table).select(valueColumn).eq(actorColumn, actorId));
  const statuses = new Set(rows.map((row) => row[valueColumn]));
  for (const status of expected) {
    assert(statuses.has(status), `${label}: missing ${status}.`);
  }
}

function proposalBucket(proposalStatus, projectStatus) {
  if (proposalStatus === "declined") return "canceladas";
  if (proposalStatus === "pending") return "activas";
  if (projectStatus === "cancelled") return "canceladas";
  if (projectStatus === "completed") return "finalizadas";
  return "activas";
}

async function verifyProposalFilters(owner) {
  const rows = await must(
    `${owner.professional.business_name} proposal filters`,
    admin.from("proposals").select("status,projects(status)")
      .eq("professional_id", owner.professional.id)
      .eq("created_app_environment", "production-mirror-regression-coverage-v1"),
  );
  const buckets = new Set(rows.map((row) => proposalBucket(row.status, row.projects?.status)));
  for (const bucket of ["activas", "finalizadas", "canceladas"]) {
    assert(buckets.has(bucket), `${owner.professional.business_name}: missing received-project filter ${bucket}.`);
  }
}

async function verifyOpportunityFilters(owner) {
  const categories = [...new Set([
    ...(Array.isArray(owner.professional.professions) ? owner.professional.professions : []),
    owner.professional.category_id,
  ])].filter((id) => id && id !== "otro");
  const projects = await must(
    `${owner.professional.business_name} opportunity filters`,
    admin.from("projects").select("id,category_id")
      .eq("status", "open")
      .eq("created_app_environment", "production-mirror-regression-coverage-v1")
      .neq("client_id", owner.profile.id)
      .in("category_id", categories),
  );
  const projectIds = projects.map((row) => row.id);
  const proposals = projectIds.length
    ? await must(
        `${owner.professional.business_name} submitted opportunities`,
        admin.from("proposals").select("project_id").eq("professional_id", owner.professional.id).in("project_id", projectIds),
      )
    : [];
  const submitted = new Set(proposals.map((row) => row.project_id));
  for (const categoryId of categories) {
    assert(
      projects.some((row) => row.category_id === categoryId && !submitted.has(row.id)),
      `${owner.professional.business_name}: missing available opportunity for profession filter ${categoryId}.`,
    );
  }
}

async function main() {
  const contratacr = await actor(CANONICAL_ACTORS.contratacr);
  const sg = await actor(CANONICAL_ACTORS.sg);
  verifyProfessionCoverage(contratacr);
  verifyProfessionCoverage(sg);
  await verifySharedVideoSlots(contratacr);
  const allowedProfiles = new Set([contratacr.profile.id, sg.profile.id]);

  const professionals = await must("professionals", admin.from("professionals").select("id,slug,business_name,created_app_environment").limit(5000));
  assert(professionals.length > 2, "The production professional directory was not mirrored.");
  const { count: publicProfessionalCount, error: publicProfessionalError } = await publicClient
    .from("professionals")
    .select("id", { count: "exact", head: true });
  if (publicProfessionalError) throw new Error(`public professionals: ${publicProfessionalError.message}`);
  assert((publicProfessionalCount || 0) > 2, "The mirrored directory is not visible through the public test API key.");
  const obsolete = professionals.filter((row) =>
    /^test-/i.test(row.slug || "") || /^e2e-/i.test(row.slug || "") || /mobile-test-seed|full-app-regression-v1/i.test(row.created_app_environment || ""),
  );

  await verifyPrivateActorIsolation([contratacr, sg]);

  await Promise.all(Object.entries(REQUIRED_FIXTURE_IDS).map(([label, ids]) => {
    const tableByLabel = {
      pairConversations: "direct_conversations",
      pairMessages: "direct_messages",
      pairReviews: "reviews",
      pairNotifications: "notifications",
      weekly: "availability_weekly",
      slots: "availability_slots",
      blocked: "blocked_dates",
      coverageBookings: "bookings",
      coverageProjects: "projects",
      coverageProposals: "proposals",
      coverageJobs: "job_posts",
      coverageApplications: "job_applications",
      coverageOffers: "professional_offers",
      coverageTickets: "support_tickets",
      coverageTicketMessages: "support_ticket_messages",
      coverageNotifications: "notifications",
    };
    return verifyIds(tableByLabel[label], ids, label);
  }));

  await Promise.all([
    verifyCount("professional_follows", { follower_id: contratacr.profile.id }, 1, "ContrataCR follows"),
    verifyCount("professional_follows", { follower_id: sg.profile.id }, 1, "SG Solutions follows"),
    verifyCount("saved_professionals", { client_id: contratacr.profile.id }, 1, "ContrataCR saved professionals"),
    verifyCount("saved_professionals", { client_id: sg.profile.id }, 1, "SG Solutions saved professionals"),
    verifyCount("direct_conversations", { client_id: contratacr.profile.id }, 1, "ContrataCR conversations"),
    verifyCount("direct_conversations", { client_id: sg.profile.id }, 1, "SG Solutions conversations"),
    verifyCount("direct_messages", { sender_id: contratacr.profile.id }, 2, "ContrataCR direct messages"),
    verifyCount("direct_messages", { sender_id: sg.profile.id }, 2, "SG Solutions direct messages"),
    verifyCount("reviews", { client_id: contratacr.profile.id }, 1, "ContrataCR authored reviews"),
    verifyCount("reviews", { professional_id: contratacr.professional.id }, 1, "ContrataCR received reviews"),
    verifyCount("reviews", { client_id: sg.profile.id }, 1, "SG Solutions authored reviews"),
    verifyCount("reviews", { professional_id: sg.professional.id }, 1, "SG Solutions received reviews"),
    verifyCount("notifications", { user_id: contratacr.profile.id }, 4, "ContrataCR notifications"),
    verifyCount("notifications", { user_id: sg.profile.id }, 4, "SG Solutions notifications"),
    verifyCount("availability_weekly", { professional_id: contratacr.professional.id }, 1, "ContrataCR weekly availability"),
    verifyCount("availability_weekly", { professional_id: sg.professional.id }, 1, "SG Solutions weekly availability"),
    verifyCount("availability_slots", { professional_id: contratacr.professional.id }, 4, "ContrataCR availability slots"),
    verifyCount("availability_slots", { professional_id: sg.professional.id }, 2, "SG Solutions availability slots"),
    verifyCount("blocked_dates", { professional_id: contratacr.professional.id }, 1, "ContrataCR blocked dates"),
    verifyCount("blocked_dates", { professional_id: sg.professional.id }, 1, "SG Solutions blocked dates"),
    verifyStatuses("job_posts", "employer_id", contratacr.professional.id, ["published", "paused", "closed", "draft"], "ContrataCR jobs"),
    verifyStatuses("job_posts", "employer_id", sg.professional.id, ["published", "paused", "closed", "draft"], "SG Solutions jobs"),
    verifyStatuses("professional_offers", "professional_id", contratacr.professional.id, ["published", "paused", "expired", "sold_out", "draft"], "ContrataCR offers"),
    verifyStatuses("professional_offers", "professional_id", sg.professional.id, ["published", "paused", "expired", "sold_out", "draft"], "SG Solutions offers"),
    verifyStatuses("bookings", "client_id", contratacr.profile.id, ["confirmed", "completed", "cancelled"], "ContrataCR client bookings"),
    verifyStatuses("bookings", "client_id", sg.profile.id, ["in_progress", "completed", "cancelled"], "SG Solutions client bookings"),
    verifyStatuses("projects", "client_id", contratacr.profile.id, ["open", "completed", "cancelled"], "ContrataCR projects"),
    verifyStatuses("projects", "client_id", sg.profile.id, ["in_progress", "completed", "cancelled"], "SG Solutions projects"),
    verifyStatuses("proposals", "professional_id", contratacr.professional.id, ["accepted", "declined"], "ContrataCR proposals"),
    verifyStatuses("proposals", "professional_id", sg.professional.id, ["pending", "accepted", "declined"], "SG Solutions proposals"),
    verifyStatuses("support_tickets", "user_id", contratacr.profile.id, ["open", "in_progress", "resolved"], "ContrataCR support"),
    verifyStatuses("support_tickets", "user_id", sg.profile.id, ["open", "in_progress", "resolved"], "SG Solutions support"),
    verifyStatuses("job_applications", "applicant_id", contratacr.profile.id, ["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"], "ContrataCR applications"),
    verifyStatuses("job_applications", "applicant_id", sg.profile.id, ["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"], "SG Solutions applications"),
    verifyStatuses("availability_exceptions", "professional_id", contratacr.professional.id, ["extra", "custom", "closed"], "ContrataCR availability exceptions", "mode"),
    verifyStatuses("availability_exceptions", "professional_id", sg.professional.id, ["extra", "custom", "closed"], "SG Solutions availability exceptions", "mode"),
  ]);

  for (const owner of [contratacr, sg]) {
    const [savedProfessionals, savedItems] = await Promise.all([
      must("saved professional filters", admin.from("saved_professionals").select("id,snapshot").eq("client_id", owner.profile.id)),
      must("saved marketplace filters", admin.from("saved_items").select("item_type").eq("user_id", owner.profile.id)),
    ]);
    const itemTypes = new Set(savedItems.map((row) => row.item_type));
    assert(savedProfessionals.length > 0, `${owner.professional.business_name}: missing Professionals favorite.`);
    assert(
      savedProfessionals.some((row) => row.snapshot?.id && row.snapshot?.slug && row.snapshot?.fullName),
      `${owner.professional.business_name}: professional favorite snapshot is not renderable.`,
    );
    assert(itemTypes.has("offer"), `${owner.professional.business_name}: missing Offers favorite.`);
    assert(itemTypes.has("job"), `${owner.professional.business_name}: missing Jobs favorite.`);
  }

  await Promise.all([
    verifyProposalFilters(contratacr),
    verifyProposalFilters(sg),
    verifyOpportunityFilters(contratacr),
    verifyOpportunityFilters(sg),
  ]);

  const actorApplications = await must(
    "actor applications",
    admin.from("job_applications").select("status,resume_url,applicant_id").in("applicant_id", [...allowedProfiles]),
  );
  const applicationStatuses = new Set(actorApplications.map((row) => row.status));
  for (const status of ["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"]) {
    assert(applicationStatuses.has(status), `Applications: missing ${status}.`);
  }
  const applicationWithCv = actorApplications.find((row) => row.applicant_id === contratacr.profile.id && row.resume_url);
  assert(applicationWithCv?.resume_url?.startsWith("job-applications/"), "ContrataCR needs a stored CV in My applications.");
  const { data: cvObject, error: cvError } = await admin.storage
    .from("direct-message-attachments")
    .download(applicationWithCv.resume_url);
  if (cvError) throw new Error(`ContrataCR CV: ${cvError.message}`);
  assert((cvObject?.size || 0) > 0, "ContrataCR CV object is empty.");

  await verifyNoRetiredDeterministicRows();
  assert(!obsolete.length, `Obsolete fake professionals remain: ${obsolete.map((row) => row.slug || row.business_name).join(", ")}`);
  await verifyNoRetiredAuthUsers();

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
