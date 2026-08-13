/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const TEST_PROJECT_REF = "sodegkfjjrdkbohycqyq";
const SEED = "production-mirror-regression-pair-v1";
const envFile = process.env.DEMO_ENV_FILE || ".env.test";
const PRODUCTION_ORIGIN = "https://www.contratacr.com";
const REGRESSION_CV_PATH = process.env.REGRESSION_CV_PATH || "";
const PRODUCTION_ACTORS = [
  {
    businessName: "ContrataCR",
    email: "e2e.client@contratacr.test",
    slug: "isaac-alberto-sanchez-monge-9gjc65t8",
    profileId: "048f1b3a-23c0-41bc-8728-10f8aed70fdb",
    professionalId: "ae9caa2b-1fca-4411-9aeb-7736f5bbf42f",
  },
  {
    businessName: "SG Solutions",
    email: "e2e.pro@contratacr.test",
    slug: "luis-angel-sanchez-sibaja-977u5iku",
    profileId: "347f5202-8b3e-4c11-8db8-1060ea5e487d",
    professionalId: "988428c7-a0b6-4d9e-a9b8-e0209a1ca296",
  },
];

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let projectRef = "invalid";
try {
  projectRef = new URL(supabaseUrl).hostname.split(".")[0];
} catch {}

if (projectRef !== TEST_PROJECT_REF) {
  throw new Error(`Refusing to seed Supabase project ${projectRef}; expected ${TEST_PROJECT_REF}.`);
}
if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for the test project.");

const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (days = 0) => new Date(now + days * DAY).toISOString();
const date = (days = 0) => iso(days).slice(0, 10);

const ids = {
  follows: ["b1000000-0000-4000-8000-000000000001", "b1000000-0000-4000-8000-000000000002"],
  saves: ["b2000000-0000-4000-8000-000000000001", "b2000000-0000-4000-8000-000000000002"],
  bookings: ["b3000000-0000-4000-8000-000000000001", "b3000000-0000-4000-8000-000000000002"],
  projects: ["b4000000-0000-4000-8000-000000000001", "b4000000-0000-4000-8000-000000000002"],
  proposals: ["b5000000-0000-4000-8000-000000000001", "b5000000-0000-4000-8000-000000000002"],
  conversations: ["b6000000-0000-4000-8000-000000000001", "b6000000-0000-4000-8000-000000000002"],
  messages: [
    "b7000000-0000-4000-8000-000000000001", "b7000000-0000-4000-8000-000000000002",
    "b7000000-0000-4000-8000-000000000003", "b7000000-0000-4000-8000-000000000004",
  ],
  jobs: ["b8000000-0000-4000-8000-000000000001", "b8000000-0000-4000-8000-000000000002"],
  applications: ["b9000000-0000-4000-8000-000000000001", "b9000000-0000-4000-8000-000000000002"],
  offers: ["ba000000-0000-4000-8000-000000000001", "ba000000-0000-4000-8000-000000000002"],
  savedItems: [
    "bb000000-0000-4000-8000-000000000001", "bb000000-0000-4000-8000-000000000002",
    "bb000000-0000-4000-8000-000000000003", "bb000000-0000-4000-8000-000000000004",
  ],
  tickets: ["bc000000-0000-4000-8000-000000000001", "bc000000-0000-4000-8000-000000000002"],
  ticketMessages: ["bd000000-0000-4000-8000-000000000001", "bd000000-0000-4000-8000-000000000002"],
  reviews: ["be000000-0000-4000-8000-000000000001", "be000000-0000-4000-8000-000000000002"],
  notifications: ["bf000000-0000-4000-8000-000000000001", "bf000000-0000-4000-8000-000000000002"],
  weekly: ["c1000000-0000-4000-8000-000000000001", "c1000000-0000-4000-8000-000000000002"],
  slots: Array.from({ length: 6 }, (_, index) => `c2000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  exceptions: Array.from({ length: 6 }, (_, index) => `c3000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  blocked: ["c4000000-0000-4000-8000-000000000001", "c4000000-0000-4000-8000-000000000002"],
};

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function restoreProductionActors() {
  for (const actor of PRODUCTION_ACTORS) {
    const response = await fetch(`${PRODUCTION_ORIGIN}/api/professionals/${actor.slug}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Could not read production profile ${actor.slug}: HTTP ${response.status}.`);
    const source = await response.json();
    if (source.id !== actor.professionalId || source.profileId !== actor.profileId) {
      throw new Error(`Production identity mismatch for ${actor.businessName}.`);
    }

    await must(`restore ${actor.businessName} profile`, supabase.from("profiles").update({
      full_name: source.fullName,
      avatar_url: source.avatarUrl,
      role: "professional",
      is_provider: true,
      onboarding_completed: true,
      is_disabled: false,
      updated_at: iso(),
    }).eq("id", actor.profileId));

    await must(`restore ${actor.businessName} auth metadata`, supabase.auth.admin.updateUserById(actor.profileId, {
      user_metadata: {
        full_name: source.fullName,
        onboarding_completed: true,
        role: "professional",
        is_provider: true,
      },
    }));

    await must(`restore ${actor.businessName} professional`, supabase.from("professionals").upsert({
      id: actor.professionalId,
      profile_id: actor.profileId,
      slug: source.slug,
      business_name: source.businessName,
      public_business_name_only: source.publicBusinessNameOnly === true,
      category_id: source.categoryId,
      professions: source.professions,
      pricing: source.pricing,
      bio: source.bio,
      whatsapp: source.whatsapp,
      call_phone: source.callPhone || null,
      allow_phone_call: source.allowPhoneCall === true,
      hourly_rate: source.hourlyRate,
      years_experience: source.yearsExperience,
      is_verified: source.isVerified === true,
      verification_status: source.verificationStatus,
      is_featured: source.isFeatured === true,
      is_available: source.isAvailable !== false,
      lat: source.lat,
      lng: source.lng,
      service_type: source.serviceType,
      videoconsulta: source.videoconsulta === true,
      portfolio_urls: source.portfolioUrls,
      portfolio_items: source.portfolioItems,
      coverage_country: source.coverage?.country === true,
      coverage_provincias: source.coverage?.provincias || [],
      workplaces: source.workplaces,
      services: source.services,
      availability_public: source.availabilityPublic !== false,
      contact_preference: source.contactPreference,
      languages: source.languages,
      insurance_networks: source.insuranceNetworks,
      certifications: source.certifications,
      updated_at: iso(),
    }, { onConflict: "id" }));
  }
}

async function findActor(expected) {
  const actor = await must(
    `find canonical ${expected.businessName}`,
    supabase
      .from("professionals")
      .select("*,profiles(*)")
      .eq("id", expected.professionalId)
      .eq("profile_id", expected.profileId)
      .single(),
  );
  if (!actor?.profiles || actor.profiles.id !== expected.profileId) {
    throw new Error(`Production mirror does not contain canonical ${expected.businessName}.`);
  }
  if ((actor.business_name || "").trim().toLowerCase() !== expected.businessName.toLowerCase()) {
    throw new Error(`Canonical ${expected.businessName} identity has an unexpected business name.`);
  }
  return { professional: actor, profile: actor.profiles };
}

function missingList(value, fallback) {
  return Array.isArray(value) && value.length ? value : fallback;
}

async function enrichActor(actor, kind) {
  const { professional, profile } = actor;
  const isContrata = kind === "contratacr";
  const serviceName = isContrata ? "Desarrollo web" : "Redes e internet";
  const safeEmail = isContrata ? "e2e.client@contratacr.test" : "e2e.pro@contratacr.test";
  const safePhone = isContrata ? "+506 7000 0001" : "+506 7000 0002";
  const fallbackImage = profile.avatar_url || professional.portfolio_urls?.[0] || null;
  const fallbackPortfolio = fallbackImage
    ? [{
        id: `${kind}-regression-case`,
        profession: professional.category_id,
        title: isContrata ? "Plataforma digital de servicios" : "Red empresarial y cobertura WiFi",
        description: "Caso completo para validar todas las secciones del perfil en test.",
        recipient: "Regresión ContrataCR",
        date: "2026",
        photos: [fallbackImage],
        likes: 1,
      }]
    : [];

  const professionIds = [...new Set([
    ...(Array.isArray(professional.professions) ? professional.professions : []),
    professional.category_id,
  ])].filter((id) => id && id !== "otro");
  const portfolioItems = Array.isArray(professional.portfolio_items)
    ? [...professional.portfolio_items]
    : [...fallbackPortfolio];
  const certifications = Array.isArray(professional.certifications)
    ? [...professional.certifications]
    : [];
  const services = Array.isArray(professional.services) ? [...professional.services] : [];

  for (const profession of professionIds) {
    if (!services.some((item) => (item?.category || professionIds[0]) === profession)) {
      services.push({
        id: `${kind}-regression-service-${profession}`,
        category: profession,
        name: `Regression service ${profession}`,
        active: true,
        price: "Consultar precio",
        priceType: "a_convenir",
        modalities: ["in_person", "video"],
        startedAt: "2020-01",
        description: `Service fixture for ${profession}.`,
      });
    }
    if (!portfolioItems.some((item) => item?.profession === profession)) {
      portfolioItems.push({
        id: `${kind}-regression-case-${profession}`,
        profession,
        title: `${isContrata ? "ContrataCR" : "SG Solutions"}: caso ${profession}`,
        description: "Caso completo para validar cada filtro profesional del perfil en test.",
        recipient: "Regression ContrataCR",
        date: "2026",
        photos: fallbackImage ? [fallbackImage] : [],
        likes: 1,
      });
    }
    if (!certifications.some((item) => item?.profession === profession)) {
      certifications.push({
        id: `${kind}-regression-certification-${profession}`,
        name: `Regression certification ${profession}`,
        institution: "ContrataCR Regression",
        year: "2026",
        profession,
      });
    }
  }

  if (!services.some((item) => typeof item?.priceAmount === "number" && item.priceAmount > 0) && services[0]) {
    services[0] = {
      ...services[0],
      priceAmount: isContrata ? 185000 : 120000,
      priceType: "por_proyecto",
    };
  }

  // The update below preserves production content and only fills missing
  // profession-specific regression coverage.
  professional.professions = professionIds;
  professional.services = services;
  professional.portfolio_items = portfolioItems;
  professional.certifications = certifications;

  await must(`profile ${kind}`, supabase.from("profiles").update({
    email: safeEmail,
    onboarding_completed: true,
    is_provider: true,
    is_disabled: false,
    updated_at: iso(),
  }).eq("id", profile.id));

  await must(`professional ${kind}`, supabase.from("professionals").update({
    bio: professional.bio || `Perfil de ${professional.business_name} preparado para regresión integral.`,
    services: missingList(professional.services, [{
      id: professional.category_id,
      name: serviceName,
      active: true,
      price: "Consultar precio",
      priceType: "a_convenir",
      modalities: ["in_person", "video"],
      startedAt: "2020-01",
      description: `Servicio de ${serviceName.toLowerCase()} para regresión integral.`,
    }]),
    professions: missingList(professional.professions, [professional.category_id]),
    portfolio_items: missingList(professional.portfolio_items, fallbackPortfolio),
    portfolio_urls: missingList(professional.portfolio_urls, fallbackImage ? [fallbackImage] : []),
    languages: missingList(professional.languages, ["es", "en"]),
    certifications: missingList(professional.certifications, [{
      id: `${kind}-regression-certification`,
      name: isContrata ? "Desarrollo de productos digitales" : "Redes y cableado estructurado",
      institution: "ContrataCR Regression",
      year: 2026,
      profession: professional.category_id,
    }]),
    social_links: professional.social_links && Object.keys(professional.social_links).length
      ? professional.social_links
      : { website: "https://contratacr.com" },
    contact_email: safeEmail,
    whatsapp: safePhone,
    call_phone: safePhone,
    allow_phone_call: true,
    availability_public: true,
    is_available: true,
    videoconsulta: true,
    updated_at: iso(),
  }).eq("id", professional.id));
}

async function main() {
  await restoreProductionActors();
  const contratacr = await findActor(PRODUCTION_ACTORS[0]);
  const sg = await findActor(PRODUCTION_ACTORS[1]);
  if (contratacr.profile.id === sg.profile.id) throw new Error("Regression actors must be distinct.");

  await enrichActor(contratacr, "contratacr");
  await enrichActor(sg, "sg");

  const c = contratacr;
  const s = sg;
  const cName = c.professional.business_name || c.profile.full_name;
  const sName = s.professional.business_name || s.profile.full_name;
  const cPhysicalLocation = (Array.isArray(c.professional.workplaces)
    ? c.professional.workplaces.find((workplace) => typeof workplace?.id === "string" && workplace.id.trim())?.id
    : null) || "regression-office";

  const savedSnapshot = ({ professional, profile }) => ({
    id: professional.id,
    slug: professional.slug,
    fullName: professional.business_name || profile.full_name,
    avatarUrl: profile.avatar_url || undefined,
    categoryIcon: "",
    categoryId: professional.category_id || "",
    provinceName: "",
    cantonName: "",
    ratingAvg: Number(professional.rating_avg) || 0,
    reviewCount: Number(professional.review_count) || 0,
    hourlyRate: professional.hourly_rate || undefined,
    isVerified: professional.is_verified === true,
    videoconsulta: professional.videoconsulta === true,
    coverage: { country: professional.coverage_country === true },
    regressionSeed: SEED,
  });

  await must("availability weekly", supabase.from("availability_weekly").upsert([
    { id: ids.weekly[0], professional_id: c.professional.id, category_id: c.professional.category_id, weekday: 1, start_time: "08:00", end_time: "17:00", slot_minutes: 60 },
    { id: ids.weekly[1], professional_id: s.professional.id, category_id: s.professional.category_id, weekday: 2, start_time: "09:00", end_time: "18:00", slot_minutes: 60 },
  ], { onConflict: "id" }));

  // Previous test runs may have restored these deterministic moments with an
  // auto-generated id. Clear only the pair's future regression moments so this
  // seed remains idempotent without touching the rest of either calendar.
  await must("reset ContrataCR regression slots", supabase.from("availability_slots")
    .delete().eq("professional_id", c.professional.id).eq("slot_date", date(2))
    .in("slot_time", ["10:00", "11:00"]));
  await must("reset SG Solutions regression slots", supabase.from("availability_slots")
    .delete().eq("professional_id", s.professional.id).eq("slot_date", date(3))
    .in("slot_time", ["11:00", "14:00"]));

  await must("availability slots", supabase.from("availability_slots").upsert([
    { id: ids.slots[0], professional_id: c.professional.id, category_id: c.professional.category_id, slot_date: date(2), slot_time: "10:00", location_id: "videoconsulta" },
    { id: ids.slots[1], professional_id: c.professional.id, category_id: c.professional.category_id, slot_date: date(2), slot_time: "10:00", location_id: cPhysicalLocation },
    { id: ids.slots[2], professional_id: c.professional.id, category_id: c.professional.category_id, slot_date: date(2), slot_time: "11:00", location_id: "videoconsulta" },
    { id: ids.slots[3], professional_id: c.professional.id, category_id: c.professional.category_id, slot_date: date(2), slot_time: "11:00", location_id: cPhysicalLocation },
    { id: ids.slots[4], professional_id: s.professional.id, category_id: s.professional.category_id, slot_date: date(3), slot_time: "14:00", location_id: "regression-office-sg" },
    { id: ids.slots[5], professional_id: s.professional.id, category_id: s.professional.category_id, slot_date: date(3), slot_time: "11:00", location_id: "regression-office-sg" },
  ], { onConflict: "id" }));

  await must("availability exceptions", supabase.from("availability_exceptions").upsert([
    { id: ids.exceptions[0], professional_id: c.professional.id, category_id: c.professional.category_id, exception_date: date(5), mode: "extra", start_time: "18:00", end_time: "20:00", slot_minutes: 60 },
    { id: ids.exceptions[1], professional_id: c.professional.id, category_id: c.professional.category_id, exception_date: date(6), mode: "custom", start_time: "09:00", end_time: "12:00", slot_minutes: 60 },
    { id: ids.exceptions[2], professional_id: c.professional.id, category_id: c.professional.category_id, exception_date: date(7), mode: "closed", slot_minutes: 60 },
    { id: ids.exceptions[3], professional_id: s.professional.id, category_id: s.professional.category_id, exception_date: date(8), mode: "extra", start_time: "18:00", end_time: "20:00", slot_minutes: 60 },
    { id: ids.exceptions[4], professional_id: s.professional.id, category_id: s.professional.category_id, exception_date: date(9), mode: "custom", start_time: "09:00", end_time: "12:00", slot_minutes: 60 },
    { id: ids.exceptions[5], professional_id: s.professional.id, category_id: s.professional.category_id, exception_date: date(10), mode: "closed", slot_minutes: 60 },
  ], { onConflict: "id" }));

  await must("blocked dates", supabase.from("blocked_dates").upsert([
    { id: ids.blocked[0], professional_id: c.professional.id, blocked_date: date(10) },
    { id: ids.blocked[1], professional_id: s.professional.id, blocked_date: date(11) },
  ], { onConflict: "id" }));

  await must("follows", supabase.from("professional_follows").upsert([
    { follower_id: c.profile.id, professional_id: s.professional.id, created_at: iso(-4) },
    { follower_id: s.profile.id, professional_id: c.professional.id, created_at: iso(-3) },
  ], { onConflict: "follower_id,professional_id" }));

  await must("saved professionals", supabase.from("saved_professionals").upsert([
    { client_id: c.profile.id, professional_id: s.professional.id, snapshot: savedSnapshot(s), created_at: iso(-4) },
    { client_id: s.profile.id, professional_id: c.professional.id, snapshot: savedSnapshot(c), created_at: iso(-3) },
  ], { onConflict: "client_id,professional_id" }));

  await must("bookings", supabase.from("bookings").upsert([
    {
      id: ids.bookings[0], professional_id: s.professional.id, client_id: c.profile.id,
      category_id: s.professional.category_id, service_description: "Instalación y diagnóstico de red para la oficina de ContrataCR.",
      preferred_date: date(-8), preferred_date_text: "La semana anterior", scheduled_date: date(-7), scheduled_time: "10:00",
      status: "completed", client_name: cName, client_email: "e2e.client@contratacr.test", client_phone: "+506 7000 0001",
      notes: "Flujo completo ContrataCR hacia SG Solutions.", work_done_at: iso(-7), completed_at: iso(-6),
      created_at: iso(-10), updated_at: iso(-6), created_app_environment: SEED, created_source_host: "test.contratacr.com",
      created_supabase_project_ref: TEST_PROJECT_REF,
    },
    {
      id: ids.bookings[1], professional_id: c.professional.id, client_id: s.profile.id,
      category_id: c.professional.category_id, service_description: "Mejora del sitio web y formulario de contacto de SG Solutions.",
      preferred_date: date(4), preferred_date_text: "La próxima semana", scheduled_date: date(4), scheduled_time: "14:00",
      status: "confirmed", client_name: sName, client_email: "e2e.pro@contratacr.test", client_phone: "+506 7000 0002",
      notes: "Flujo completo SG Solutions hacia ContrataCR.", created_at: iso(-2), updated_at: iso(-1),
      created_app_environment: SEED, created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF,
    },
  ], { onConflict: "id" }));

  await must("projects", supabase.from("projects").upsert([
    {
      id: ids.projects[0], client_id: c.profile.id, category_id: s.professional.category_id,
      title: "Actualizar red de oficina", description: "ContrataCR necesita revisar cobertura, cableado y estabilidad de la red de su oficina.",
      provincia_id: c.professional.provincia_id, canton_id: c.professional.canton_id, budget_min: 100000, budget_max: 250000,
      timeline: "Este mes", status: "in_progress", accepted_professional_id: s.professional.id,
      client_name_snapshot: cName, client_email_snapshot: "e2e.client@contratacr.test", client_phone_snapshot: "+506 7000 0001",
      created_at: iso(-5), updated_at: iso(-2), created_app_environment: SEED, created_source_host: "test.contratacr.com",
      created_supabase_project_ref: TEST_PROJECT_REF,
    },
    {
      id: ids.projects[1], client_id: s.profile.id, category_id: c.professional.category_id,
      title: "Nueva página de servicios", description: "SG Solutions necesita una página rápida para presentar servicios y recibir solicitudes comerciales.",
      provincia_id: s.professional.provincia_id, canton_id: s.professional.canton_id, budget_min: 180000, budget_max: 450000,
      timeline: "Próximo mes", status: "open", client_name_snapshot: sName,
      client_email_snapshot: "e2e.pro@contratacr.test", client_phone_snapshot: "+506 7000 0002",
      created_at: iso(-3), updated_at: iso(-1), created_app_environment: SEED, created_source_host: "test.contratacr.com",
      created_supabase_project_ref: TEST_PROJECT_REF,
    },
  ], { onConflict: "id" }));

  await must("proposals", supabase.from("proposals").upsert([
    {
      id: ids.proposals[0], project_id: ids.projects[0], professional_id: s.professional.id, price: 175000,
      message: "Propuesta de SG Solutions para diagnóstico, instalación y documentación de la red.", status: "accepted",
      professional_user_id_snapshot: s.profile.id, professional_name_snapshot: sName,
      professional_email_snapshot: "e2e.pro@contratacr.test", created_at: iso(-4), created_app_environment: SEED,
      created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF,
    },
    {
      id: ids.proposals[1], project_id: ids.projects[1], professional_id: c.professional.id, price: 295000,
      message: "Propuesta de ContrataCR para diseño, desarrollo, publicación y acompañamiento inicial.", status: "pending",
      professional_user_id_snapshot: c.profile.id, professional_name_snapshot: cName,
      professional_email_snapshot: "e2e.client@contratacr.test", created_at: iso(-2), created_app_environment: SEED,
      created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF,
    },
  ], { onConflict: "id" }));

  await must("conversations", supabase.from("direct_conversations").upsert([
    {
      id: ids.conversations[0], client_id: c.profile.id, professional_id: s.professional.id,
      professional_profile_id: s.profile.id, booking_id: ids.bookings[0], subject: "Red de oficina",
      status: "open", last_message: "Perfecto, dejamos documentada la instalación.", last_message_at: iso(-1),
      last_sender_id: s.profile.id, client_unread_count: 1, professional_unread_count: 0, created_at: iso(-7), updated_at: iso(-1),
    },
    {
      id: ids.conversations[1], client_id: s.profile.id, professional_id: c.professional.id,
      professional_profile_id: c.profile.id, project_id: ids.projects[1], proposal_id: ids.proposals[1], subject: "Página de servicios",
      status: "open", last_message: "Te compartimos la propuesta para revisión.", last_message_at: iso(-1),
      last_sender_id: c.profile.id, client_unread_count: 1, professional_unread_count: 0, created_at: iso(-2), updated_at: iso(-1),
    },
  ], { onConflict: "id" }));

  await must("messages", supabase.from("direct_messages").upsert([
    { id: ids.messages[0], conversation_id: ids.conversations[0], sender_id: c.profile.id, body: "Necesitamos mejorar la cobertura de la oficina.", read_at: iso(-6), created_at: iso(-7) },
    { id: ids.messages[1], conversation_id: ids.conversations[0], sender_id: s.profile.id, body: "Perfecto, dejamos documentada la instalación.", created_at: iso(-1) },
    { id: ids.messages[2], conversation_id: ids.conversations[1], sender_id: s.profile.id, body: "Queremos mostrar mejor nuestros servicios en celular.", read_at: iso(-1), created_at: iso(-2) },
    { id: ids.messages[3], conversation_id: ids.conversations[1], sender_id: c.profile.id, body: "Te compartimos la propuesta para revisión.", created_at: iso(-1) },
  ], { onConflict: "id" }));

  const jobs = [
    {
      id: ids.jobs[0], employer_id: c.professional.id, title: "Especialista de soporte digital",
      description: "ContrataCR busca apoyo para revisar contenido, incidencias y calidad de la experiencia web.",
      responsibilities: ["Revisar flujos", "Documentar incidencias"], requirements: ["Atención al detalle"], benefits: ["Trabajo remoto"],
      employment_type: "contract", workplace_type: "remote", location_label: "Todo Costa Rica", salary_min: 450000, salary_max: 650000,
      salary_period: "monthly", currency: "CRC", show_salary: true, openings: 1, application_deadline: date(30), status: "published",
      service_category_id: c.professional.category_id, duration_label: "3 meses", experience_level: "one_plus", created_at: iso(-3), updated_at: iso(-1),
    },
    {
      id: ids.jobs[1], employer_id: s.professional.id, title: "Técnico de redes",
      description: "SG Solutions busca apoyo para instalar, diagnosticar y documentar redes empresariales.",
      responsibilities: ["Instalar cableado", "Documentar diagnósticos"], requirements: ["Disponibilidad para desplazarse"], benefits: ["Viáticos"],
      employment_type: "full_time", workplace_type: "onsite", provincia_id: s.professional.provincia_id,
      canton_id: s.professional.canton_id, location_label: "Atenas, Alajuela", salary_min: 500000, salary_max: 750000,
      salary_period: "monthly", currency: "CRC", show_salary: true, openings: 2, application_deadline: date(30), status: "published",
      service_category_id: s.professional.category_id, experience_level: "two_plus", created_at: iso(-2), updated_at: iso(-1),
    },
  ];
  await must("jobs", supabase.from("job_posts").upsert(jobs, { onConflict: "id" }));

  // Local regression uses Isaac's requested CV when available. CI runners do
  // not have access to that private Windows path, so use a tiny valid synthetic
  // PDF there. This keeps My applications covered without committing personal
  // information to the repository.
  const fallbackCv = Buffer.from(
    "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNzQ+PnN0cmVhbQpCVAovRjEgMTIgVGYKNzIgNzIwIFRkCihDb250cmF0YUNSIFJlZ3Jlc3Npb24gVGVzdCBDVikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNjQgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjQzNAolJUVPRgo=",
    "base64",
  );
  const regressionCv = REGRESSION_CV_PATH && fs.existsSync(REGRESSION_CV_PATH)
    ? fs.readFileSync(REGRESSION_CV_PATH)
    : fallbackCv;
  const regressionCvStoragePath = `job-applications/${ids.jobs[1]}/${c.profile.id}/Senior-CV.pdf`;
  await must("ContrataCR application CV", supabase.storage
    .from("direct-message-attachments")
    .upload(regressionCvStoragePath, regressionCv, {
      contentType: "application/pdf",
      upsert: true,
    }));

  await must("applications", supabase.from("job_applications").upsert([
    { id: ids.applications[0], job_id: ids.jobs[0], applicant_id: s.profile.id, cover_letter: "SG Solutions desea participar para validar el flujo completo de empleos en test.", phone: "+506 7000 0002", applicant_email: "e2e.pro@contratacr.test", status: "reviewing", created_at: iso(-2), updated_at: iso(-1) },
    { id: ids.applications[1], job_id: ids.jobs[1], applicant_id: c.profile.id, cover_letter: "ContrataCR envía esta postulación para validar el flujo completo entre ambos perfiles.", phone: "+506 7000 0001", applicant_email: "e2e.client@contratacr.test", resume_url: regressionCvStoragePath, status: "shortlisted", created_at: iso(-1), updated_at: iso() },
  ], { onConflict: "id" }));

  const offers = [
    {
      id: ids.offers[0], professional_id: c.professional.id, title: "Sitio web profesional",
      description: "Diseño y desarrollo responsivo con configuración inicial y acompañamiento de lanzamiento.",
      offer_type: "service_offer", service_label: "Desarrollo web", image_urls: missingList(c.professional.portfolio_urls, c.profile.avatar_url ? [c.profile.avatar_url] : []).slice(0, 5),
      price_now: 185000, price_before: 240000, currency: "CRC", price_unit: "project", location_label: "Todo Costa Rica",
      valid_until: date(30), quantity_available: 5, status: "published", service_category_id: c.professional.category_id,
      created_at: iso(-2), updated_at: iso(-1),
    },
    {
      id: ids.offers[1], professional_id: s.professional.id, title: "Instalación de red empresarial",
      description: "Diagnóstico, instalación y configuración inicial para una oficina pequeña o mediana.",
      offer_type: "service_offer", service_label: "Redes e internet", image_urls: missingList(s.professional.portfolio_urls, s.profile.avatar_url ? [s.profile.avatar_url] : []).slice(0, 5),
      price_now: 120000, price_before: 150000, currency: "CRC", price_unit: "project", location_label: "Atenas, Alajuela",
      valid_until: date(30), quantity_available: 5, status: "published", service_category_id: s.professional.category_id,
      created_at: iso(-2), updated_at: iso(-1),
    },
  ];
  await must("offers", supabase.from("professional_offers").upsert(offers, { onConflict: "id" }));

  await must("saved marketplace", supabase.from("saved_items").upsert([
    { id: ids.savedItems[0], user_id: c.profile.id, item_type: "offer", item_id: ids.offers[1], snapshot: { regressionSeed: SEED, title: offers[1].title, professional_name: sName }, created_at: iso(-1) },
    { id: ids.savedItems[1], user_id: s.profile.id, item_type: "job", item_id: ids.jobs[0], snapshot: { regressionSeed: SEED, title: jobs[0].title, employer_name: cName }, created_at: iso(-1) },
    { id: ids.savedItems[2], user_id: c.profile.id, item_type: "job", item_id: ids.jobs[1], snapshot: { regressionSeed: SEED, title: jobs[1].title, employer_name: sName }, created_at: iso(-1) },
    { id: ids.savedItems[3], user_id: s.profile.id, item_type: "offer", item_id: ids.offers[0], snapshot: { regressionSeed: SEED, title: offers[0].title, professional_name: cName }, created_at: iso(-1) },
  ], { onConflict: "id" }));

  await must("support tickets", supabase.from("support_tickets").upsert([
    { id: ids.tickets[0], professional_id: c.professional.id, user_id: c.profile.id, name: cName, email: "e2e.client@contratacr.test", type: "support", topic: "technical", subject: "Validación de soporte ContrataCR", detail: "Ticket completo de regresión.", message: "Necesito validar el flujo de soporte.", status: "in_progress", user_confirmed: false, created_at: iso(-2), last_reply_at: iso(-1), last_reply_role: "admin", created_app_environment: SEED, created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF },
    { id: ids.tickets[1], professional_id: s.professional.id, user_id: s.profile.id, name: sName, email: "e2e.pro@contratacr.test", type: "support", topic: "account", subject: "Validación de soporte SG Solutions", detail: "Ticket resuelto de regresión.", message: "Necesito validar el estado resuelto.", status: "resolved", user_confirmed: false, created_at: iso(-3), last_reply_at: iso(-1), last_reply_role: "admin", created_app_environment: SEED, created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF },
  ], { onConflict: "id" }));

  await must("support messages", supabase.from("support_ticket_messages").upsert([
    { id: ids.ticketMessages[0], ticket_id: ids.tickets[0], sender_role: "user", sender_id: c.profile.id, sender_name: cName, body: "Necesito validar el flujo de soporte.", created_at: iso(-2) },
    { id: ids.ticketMessages[1], ticket_id: ids.tickets[1], sender_role: "user", sender_id: s.profile.id, sender_name: sName, body: "Necesito validar el estado resuelto.", created_at: iso(-3) },
  ], { onConflict: "id" }));

  await must("reviews", supabase.from("reviews").upsert([
    { id: ids.reviews[0], professional_id: s.professional.id, client_id: c.profile.id, booking_id: ids.bookings[0], rating: 5, comment: "Excelente instalación y documentación de la red.", job_title: "Instalación de red", client_name_snapshot: cName, client_email_snapshot: "e2e.client@contratacr.test", created_at: iso(-5), created_app_environment: SEED, created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF },
    { id: ids.reviews[1], professional_id: c.professional.id, client_id: s.profile.id, project_id: ids.projects[1], rating: 5, comment: "Propuesta clara y excelente atención durante el proceso.", job_title: "Página de servicios", client_name_snapshot: sName, client_email_snapshot: "e2e.pro@contratacr.test", created_at: iso(-1), created_app_environment: SEED, created_source_host: "test.contratacr.com", created_supabase_project_ref: TEST_PROJECT_REF },
  ], { onConflict: "id" }));

  await must("notifications", supabase.from("notifications").upsert([
    { id: ids.notifications[0], user_id: c.profile.id, type: "direct_message", title: "Mensaje de SG Solutions", message: "Tienes una respuesta sobre la red de oficina.", data: { regressionSeed: SEED, link: `/mensajes/${ids.conversations[0]}` }, read: false, created_at: iso(-1) },
    { id: ids.notifications[1], user_id: s.profile.id, type: "direct_message", title: "Mensaje de ContrataCR", message: "Tienes una propuesta sobre tu página de servicios.", data: { regressionSeed: SEED, link: `/mensajes/${ids.conversations[1]}` }, read: false, created_at: iso(-1) },
  ], { onConflict: "id" }));

  console.log(JSON.stringify({
    seed: SEED,
    contratacr: { profileId: c.profile.id, professionalId: c.professional.id, avatar: c.profile.avatar_url },
    sgSolutions: { profileId: s.profile.id, professionalId: s.professional.id, avatar: s.profile.avatar_url },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
