/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const TEST_PROJECT_REF = "sodegkfjjrdkbohycqyq";
const PROD_PROJECT_REF = "kskueodxaksxvjrysouw";
const EMAIL = "publicidad@contratacr.test";
const SOURCE_PROFILE_ID = "048f1b3a-23c0-41bc-8728-10f8aed70fdb";
const SOURCE_PROFESSIONAL_ID = "ae9caa2b-1fca-4411-9aeb-7736f5bbf42f";
const COUNTERPART_PROFILE_ID = "347f5202-8b3e-4c11-8db8-1060ea5e487d";
const COUNTERPART_PROFESSIONAL_ID = "988428c7-a0b6-4d9e-a9b8-e0209a1ca296";
const SEED = "manual-advertising-account-v2";
const PROFESSIONAL_ID = stableUuid("advertising-professional");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const password = process.env.ADVERTISING_TEST_PASSWORD || "";

if (!url || !serviceRole || !password) {
  throw new Error("Missing test Supabase credentials or ADVERTISING_TEST_PASSWORD.");
}
if (url.includes(PROD_PROJECT_REF) || !url.includes(TEST_PROJECT_REF)) {
  throw new Error("Refusing to create the advertising account outside the isolated test project.");
}
if (password.length < 16) {
  throw new Error("ADVERTISING_TEST_PASSWORD must contain at least 16 characters.");
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function stableUuid(key) {
  const hex = crypto.createHash("sha256").update(`contratacr:${SEED}:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function findAuthUser() {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list test Auth users: ${error.message}`);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === EMAIL);
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function rows(table, column, value) {
  return must(`${table} source rows`, admin.from(table).select("*").eq(column, value).order("created_at", { ascending: true }));
}

async function unionRows(table, expression) {
  return must(`${table} source rows`, admin.from(table).select("*").or(expression).order("created_at", { ascending: true }));
}

function clonedId(table, sourceId) {
  return stableUuid(`${table}:${sourceId}`);
}

function cloneBase(table, row) {
  return {
    ...row,
    id: clonedId(table, row.id),
    ...(Object.hasOwn(row, "created_app_environment") ? { created_app_environment: SEED } : {}),
    ...(Object.hasOwn(row, "created_source_host") ? { created_source_host: "test.contratacr.com" } : {}),
    ...(Object.hasOwn(row, "created_supabase_project_ref") ? { created_supabase_project_ref: TEST_PROJECT_REF } : {}),
  };
}

async function upsertRows(table, data) {
  if (!data.length) return;
  await must(`${table} advertising clone`, admin.from(table).upsert(data, { onConflict: "id" }));
}

async function main() {
  const [sourceProfile, sourceProfessional] = await Promise.all([
    must("ContrataCR source profile", admin.from("profiles").select("*").eq("id", SOURCE_PROFILE_ID).single()),
    must("ContrataCR source professional", admin.from("professionals").select("*").eq("id", SOURCE_PROFESSIONAL_ID).single()),
  ]);

  let user = await findAuthUser();
  const metadata = {
    role: "professional",
    full_name: "Publicidad ContrataCR",
    onboarding_completed: true,
    is_provider: true,
    manual_test_account: "advertising",
  };

  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: metadata,
      ban_duration: "none",
    });
    if (error || !data.user) throw new Error(`Could not refresh advertising Auth user: ${error?.message}`);
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw new Error(`Could not create advertising Auth user: ${error?.message}`);
    user = data.user;
  }

  await must("advertising profile", admin.from("profiles").upsert({
    ...sourceProfile,
    id: user.id,
    cedula: null,
    email: EMAIL,
    full_name: "Publicidad ContrataCR",
    phone: "+506 7000 0099",
    role: "professional",
    onboarding_completed: true,
    is_provider: true,
    is_disabled: false,
    disabled_reason: null,
    disabled_at: null,
    created_app_environment: SEED,
    created_source_host: "test.contratacr.com",
    created_supabase_project_ref: TEST_PROJECT_REF,
  }, { onConflict: "id" }));

  // Remove only this manual fixture's old connection/activity side effects
  // before refreshing it. This prevents reruns from notifying SG Solutions or
  // accumulating trigger-created rows while keeping all canonical pair data.
  await must("old advertising follows", admin.from("professional_follows")
    .delete().or(`follower_id.eq.${user.id},professional_id.eq.${PROFESSIONAL_ID}`));
  await must("old advertising notification side effects", admin.from("notifications")
    .delete().contains("data", { professional_id: PROFESSIONAL_ID }));
  await must("old advertising notifications", admin.from("notifications").delete().eq("user_id", user.id));
  await must("old advertising activities", admin.from("professional_activity").delete().eq("professional_id", PROFESSIONAL_ID));

  await must("advertising professional", admin.from("professionals").upsert({
    ...sourceProfessional,
    id: PROFESSIONAL_ID,
    profile_id: user.id,
    slug: "publicidad-contratacr-demo",
    business_name: "Publicidad ContrataCR",
    whatsapp: "+506 7000 0099",
    call_phone: "+506 7000 0099",
    contact_email: EMAIL,
    is_available: false,
    is_banned: true,
    banned_reason: "Cuenta manual exclusiva de test; oculta de búsqueda pública.",
    banned_at: new Date().toISOString(),
    is_featured: false,
    created_app_environment: SEED,
    created_source_host: "test.contratacr.com",
    created_supabase_project_ref: TEST_PROJECT_REF,
  }, { onConflict: "id" }));

  const [
    sourceBookings,
    sourceProjects,
    sourceProposals,
    sourceJobs,
    sourceApplications,
    sourceOffers,
    sourceTickets,
    sourceConversations,
    sourceSavedProfessionals,
    sourceSavedItems,
    sourceFollows,
    sourceReviews,
    sourceNotifications,
    sourceWeekly,
    sourceSlots,
    sourceExceptions,
    sourceBlocked,
  ] = await Promise.all([
    unionRows("bookings", `client_id.eq.${SOURCE_PROFILE_ID},professional_id.eq.${SOURCE_PROFESSIONAL_ID}`),
    rows("projects", "client_id", SOURCE_PROFILE_ID),
    rows("proposals", "professional_id", SOURCE_PROFESSIONAL_ID),
    rows("job_posts", "employer_id", SOURCE_PROFESSIONAL_ID),
    rows("job_applications", "applicant_id", SOURCE_PROFILE_ID),
    rows("professional_offers", "professional_id", SOURCE_PROFESSIONAL_ID),
    rows("support_tickets", "user_id", SOURCE_PROFILE_ID),
    unionRows("direct_conversations", `client_id.eq.${SOURCE_PROFILE_ID},professional_id.eq.${SOURCE_PROFESSIONAL_ID}`),
    rows("saved_professionals", "client_id", SOURCE_PROFILE_ID),
    rows("saved_items", "user_id", SOURCE_PROFILE_ID),
    unionRows("professional_follows", `follower_id.eq.${SOURCE_PROFILE_ID},professional_id.eq.${SOURCE_PROFESSIONAL_ID}`),
    unionRows("reviews", `client_id.eq.${SOURCE_PROFILE_ID},professional_id.eq.${SOURCE_PROFESSIONAL_ID}`),
    rows("notifications", "user_id", SOURCE_PROFILE_ID),
    rows("availability_weekly", "professional_id", SOURCE_PROFESSIONAL_ID),
    rows("availability_slots", "professional_id", SOURCE_PROFESSIONAL_ID),
    rows("availability_exceptions", "professional_id", SOURCE_PROFESSIONAL_ID),
    rows("blocked_dates", "professional_id", SOURCE_PROFESSIONAL_ID),
  ]);

  const bookings = sourceBookings.map((row) => ({
    ...cloneBase("bookings", row),
    professional_id: PROFESSIONAL_ID,
    client_id: user.id,
    client_name: "Publicidad ContrataCR",
    client_email: EMAIL,
    client_phone: "+506 7000 0099",
    archived_by_client: false,
    archived_by_professional: false,
  }));
  const projects = sourceProjects.map((row) => ({
    ...cloneBase("projects", row),
    client_id: user.id,
    accepted_professional_id: row.accepted_professional_id ? PROFESSIONAL_ID : null,
    client_name_snapshot: "Publicidad ContrataCR",
    client_email_snapshot: EMAIL,
    client_phone_snapshot: "+506 7000 0099",
    title: `Publicidad: ${row.title}`,
  }));
  const jobs = sourceJobs.map((row) => ({
    ...cloneBase("job_posts", row),
    employer_id: PROFESSIONAL_ID,
    title: `Publicidad: ${row.title}`,
  }));
  const offers = sourceOffers.map((row) => ({
    ...cloneBase("professional_offers", row),
    professional_id: PROFESSIONAL_ID,
    title: `Publicidad: ${row.title}`,
  }));

  await upsertRows("bookings", bookings);
  await upsertRows("projects", projects);
  await upsertRows("job_posts", jobs);
  await upsertRows("professional_offers", offers);

  const proposals = sourceProposals.map((row, index) => ({
    ...cloneBase("proposals", row),
    project_id: projects[index % Math.max(projects.length, 1)]?.id,
    professional_id: PROFESSIONAL_ID,
    professional_user_id_snapshot: user.id,
    professional_name_snapshot: "Publicidad ContrataCR",
    professional_email_snapshot: EMAIL,
  })).filter((row) => row.project_id);
  const applications = sourceApplications.map((row, index) => ({
    ...cloneBase("job_applications", row),
    job_id: jobs[index % Math.max(jobs.length, 1)]?.id,
    applicant_id: user.id,
    applicant_email: EMAIL,
    phone: "+506 7000 0099",
  })).filter((row) => row.job_id);
  await upsertRows("proposals", proposals);
  await upsertRows("job_applications", applications);

  const tickets = sourceTickets.map((row, index) => ({
    ...cloneBase("support_tickets", row),
    professional_id: PROFESSIONAL_ID,
    user_id: user.id,
    name: "Publicidad ContrataCR",
    email: EMAIL,
    subject: `Publicidad: ${row.subject}`,
    case_number: 990000 + index,
  }));
  await upsertRows("support_tickets", tickets);
  const sourceTicketIds = sourceTickets.map((row) => row.id);
  const [sourceTicketMessages, sourceLegacySupport] = await Promise.all([
    sourceTicketIds.length
      ? must("support ticket message source rows", admin.from("support_ticket_messages").select("*").in("ticket_id", sourceTicketIds).order("created_at"))
      : [],
    rows("support_messages", "user_id", SOURCE_PROFILE_ID),
  ]);
  const ticketBySource = new Map(sourceTickets.map((row, index) => [row.id, tickets[index].id]));
  await upsertRows("support_ticket_messages", sourceTicketMessages.map((row) => ({
    ...cloneBase("support_ticket_messages", row),
    ticket_id: ticketBySource.get(row.ticket_id),
    sender_id: row.sender_id ? user.id : null,
  })).filter((row) => row.ticket_id));
  await upsertRows("support_messages", sourceLegacySupport.map((row) => ({
    ...cloneBase("support_messages", row),
    user_id: user.id,
    email: EMAIL,
    name: "Publicidad ContrataCR",
  })));

  const conversations = sourceConversations.map((row, index) => {
    const advertisingIsClient = row.client_id === SOURCE_PROFILE_ID;
    return {
      ...cloneBase("direct_conversations", row),
      client_id: advertisingIsClient ? user.id : COUNTERPART_PROFILE_ID,
      professional_id: advertisingIsClient ? COUNTERPART_PROFESSIONAL_ID : PROFESSIONAL_ID,
      professional_profile_id: advertisingIsClient ? COUNTERPART_PROFILE_ID : user.id,
      booking_id: bookings[index % Math.max(bookings.length, 1)]?.id || null,
      project_id: projects[index % Math.max(projects.length, 1)]?.id || null,
      proposal_id: proposals[index % Math.max(proposals.length, 1)]?.id || null,
      last_sender_id: row.last_sender_id === SOURCE_PROFILE_ID ? user.id : COUNTERPART_PROFILE_ID,
    };
  });
  await upsertRows("direct_conversations", conversations);
  const sourceConversationIds = sourceConversations.map((row) => row.id);
  const sourceMessages = sourceConversationIds.length
    ? await must("direct message source rows", admin.from("direct_messages").select("*").in("conversation_id", sourceConversationIds).order("created_at"))
    : [];
  const conversationBySource = new Map(sourceConversations.map((row, index) => [row.id, conversations[index].id]));
  await upsertRows("direct_messages", sourceMessages.map((row) => ({
    ...cloneBase("direct_messages", row),
    conversation_id: conversationBySource.get(row.conversation_id),
    sender_id: row.sender_id === SOURCE_PROFILE_ID ? user.id : COUNTERPART_PROFILE_ID,
  })).filter((row) => row.conversation_id));

  await upsertRows("saved_professionals", sourceSavedProfessionals.map((row) => ({
    ...cloneBase("saved_professionals", row),
    client_id: user.id,
    professional_id: PROFESSIONAL_ID,
    snapshot: {
      ...(row.snapshot || {}),
      id: PROFESSIONAL_ID,
      slug: "publicidad-contratacr-demo",
      fullName: "Publicidad ContrataCR",
      businessName: "Publicidad ContrataCR",
    },
  })));
  await upsertRows("saved_items", sourceSavedItems.map((row, index) => {
    const targets = row.item_type === "job" ? jobs : offers;
    const item = targets[index % Math.max(targets.length, 1)];
    return {
      ...cloneBase("saved_items", row),
      user_id: user.id,
      item_id: item?.id,
      snapshot: { ...(row.snapshot || {}), id: item?.id, title: item?.title || row.snapshot?.title },
    };
  }).filter((row) => row.item_id));

  await upsertRows("reviews", sourceReviews.map((row, index) => {
    const advertisingIsClient = row.client_id === SOURCE_PROFILE_ID;
    return {
      ...cloneBase("reviews", row),
      professional_id: advertisingIsClient ? COUNTERPART_PROFESSIONAL_ID : PROFESSIONAL_ID,
      client_id: advertisingIsClient ? user.id : COUNTERPART_PROFILE_ID,
      booking_id: bookings[index % Math.max(bookings.length, 1)]?.id || null,
      project_id: projects[index % Math.max(projects.length, 1)]?.id || null,
      client_name_snapshot: advertisingIsClient ? "Publicidad ContrataCR" : "SG Solutions",
      client_email_snapshot: advertisingIsClient ? EMAIL : "e2e.pro@contratacr.test",
    };
  }));

  await Promise.all([
    upsertRows("availability_weekly", sourceWeekly.map((row) => ({ ...cloneBase("availability_weekly", row), professional_id: PROFESSIONAL_ID }))),
    upsertRows("availability_slots", sourceSlots.map((row) => ({ ...cloneBase("availability_slots", row), professional_id: PROFESSIONAL_ID }))),
    upsertRows("availability_exceptions", sourceExceptions.map((row) => ({ ...cloneBase("availability_exceptions", row), professional_id: PROFESSIONAL_ID }))),
    upsertRows("blocked_dates", sourceBlocked.map((row) => ({ ...cloneBase("blocked_dates", row), professional_id: PROFESSIONAL_ID }))),
  ]);

  // Add connections only after jobs/offers/services are stable so no activity
  // notification can leak into the canonical ContrataCR/SG regression actors.
  await upsertRows("professional_follows", sourceFollows.map((row) => {
    const advertisingIsFollower = row.follower_id === SOURCE_PROFILE_ID;
    return {
      ...cloneBase("professional_follows", row),
      follower_id: advertisingIsFollower ? user.id : COUNTERPART_PROFILE_ID,
      professional_id: advertisingIsFollower ? COUNTERPART_PROFESSIONAL_ID : PROFESSIONAL_ID,
    };
  }));
  await must("generated counterpart follow notifications", admin.from("notifications")
    .delete().contains("data", { follower_id: user.id }));
  await must("generated advertising follow notifications", admin.from("notifications").delete().eq("user_id", user.id));
  await upsertRows("notifications", sourceNotifications.map((row) => ({
    ...cloneBase("notifications", row),
    user_id: user.id,
    data: row.type === "followed_professional_activity"
      ? { ...(row.data || {}), manual_test_account: "advertising", push_suppressed: true }
      : { manual_test_account: "advertising", source_type: row.type, push_suppressed: true },
  })));

  console.log(JSON.stringify({
    ready: true,
    environment: "test",
    email: EMAIL,
    profileId: user.id,
    professionalId: PROFESSIONAL_ID,
    publicProfessional: false,
    clonedSections: {
      bookings: bookings.length,
      projects: projects.length,
      proposals: proposals.length,
      jobs: jobs.length,
      applications: applications.length,
      offers: offers.length,
      support: tickets.length,
      conversations: conversations.length,
      favorites: sourceSavedProfessionals.length + sourceSavedItems.length,
      reviews: sourceReviews.length,
      notifications: sourceNotifications.length,
      availability: sourceWeekly.length + sourceSlots.length + sourceExceptions.length + sourceBlocked.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
