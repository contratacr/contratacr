import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "sodegkfjjrdkbohycqyq";
const PROD_PROJECT_REF = "kskueodxaksxvjrysouw";

export const E2E_USERS = {
  client: {
    email: "e2e.client@contratacr.test",
    password: process.env.E2E_TEST_PASSWORD || "ContrataCR!2026",
    fullName: "E2E Cliente ContrataCR",
    phone: "+50688880001",
    cedula: "990000001",
  },
  professional: {
    email: "e2e.pro@contratacr.test",
    password: process.env.E2E_TEST_PASSWORD || "ContrataCR!2026",
    fullName: "E2E Profesional ContrataCR",
    phone: "+50688880002",
    cedula: "990000002",
    slug: "e2e-profesional-contratacr",
  },
  videoProfessional: {
    email: "e2e.video@contratacr.test",
    password: process.env.E2E_TEST_PASSWORD || "ContrataCR!2026",
    fullName: "E2E Video ContrataCR",
    phone: "+50688880004",
    cedula: "990000004",
    slug: "e2e-video-contratacr",
    businessName: "E2E Video Studio",
  },
  admin: {
    email: "e2e.admin@contratacr.test",
    password: process.env.E2E_TEST_PASSWORD || "ContrataCR!2026",
    fullName: "E2E Admin ContrataCR",
    phone: "+50688880003",
    cedula: "990000003",
  },
} as const;

const REGRESSION_IDS = {
  publishedJob: "00000000-0000-4000-8000-00000000e201",
  secondaryJob: "00000000-0000-4000-8000-00000000e202",
  pausedJob: "00000000-0000-4000-8000-00000000e203",
  closedJob: "00000000-0000-4000-8000-00000000e204",
  publishedOffer: "00000000-0000-4000-8000-00000000e301",
  secondaryOffer: "00000000-0000-4000-8000-00000000e302",
  pausedOffer: "00000000-0000-4000-8000-00000000e303",
  application: "00000000-0000-4000-8000-00000000e401",
} as const;

type E2EUserConfig = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  cedula: string;
};

export type RegressionSeedState = {
  clientId: string;
  professionalUserId: string;
  professionalId: string;
  professionalSlug: string;
  videoProfessionalUserId: string;
  videoProfessionalId: string;
  videoProfessionalSlug: string;
  categoryId: string;
  videoCategoryId: string;
  slotDate: string;
  slotTime: string;
  videoSlotDate: string;
  videoSharedSlotTime: string;
  videoSecondSlotTime: string;
  publishedJobId: string;
  secondaryJobId: string;
  pausedJobId: string;
  closedJobId: string;
  publishedOfferId: string;
  secondaryOfferId: string;
  pausedOfferId: string;
  applicationId: string;
};

type AdminClient = SupabaseClient;

function envUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function assertSafeSeedTarget() {
  const url = envUrl();
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for E2E seed.");
  }
  if (url.includes(PROD_PROJECT_REF)) {
    throw new Error("Refusing to seed against the production Supabase project.");
  }
  if (!url.includes(TEST_PROJECT_REF) && process.env.E2E_ALLOW_NON_TEST_SUPABASE !== "1") {
    throw new Error("Refusing to seed a non-test Supabase project without E2E_ALLOW_NON_TEST_SUPABASE=1.");
  }
}

export function canRunSeededRegression() {
  const url = envUrl();
  return (
    process.env.E2E_SEED === "1" &&
    !!url &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !url.includes(PROD_PROJECT_REF)
  );
}

function adminClient() {
  assertSafeSeedTarget();
  return createClient(envUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function regressionAdminClient() {
  return adminClient();
}

async function findUserByEmail(admin: AdminClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureAuthUser(
  admin: AdminClient,
  user: E2EUserConfig,
  role: "client" | "professional" | "admin",
) {
  const isProvider = role === "professional";
  const existing = await findUserByEmail(admin, user.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        onboarding_completed: true,
        role,
        is_provider: isProvider,
      },
    });
    if (error) throw error;
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.fullName,
      onboarding_completed: true,
      role,
      is_provider: isProvider,
    },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${user.email}`);
  return data.user;
}

function futureDate(daysAhead: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function ensureCategory(admin: AdminClient) {
  const { data } = await admin.from("categories").select("id").eq("id", "plomeria").maybeSingle();
  if (data?.id) return;
  const { error } = await admin.from("categories").insert({
    id: "plomeria",
    name: "Plomería",
    name_en: "Plumbing",
    group_id: "hogar",
    is_active: true,
    is_hidden: false,
    es_salud: false,
    supports_videoconsulta: false,
  });
  if (error) throw error;
}

async function ensureVideoCategory(admin: AdminClient) {
  const { data } = await admin.from("categories").select("id").eq("id", "desarrollo_web").maybeSingle();
  if (data?.id) return;
  const { error } = await admin.from("categories").insert({
    id: "desarrollo_web",
    name: "Desarrollo web",
    name_en: "Web development",
    group_id: "tecnologia",
    is_active: true,
    is_hidden: false,
    es_salud: false,
    supports_videoconsulta: true,
  });
  if (error) throw error;
}

async function ensureMobileAppsCategory(admin: AdminClient) {
  const { data } = await admin.from("categories").select("id").eq("id", "diseno_apps").maybeSingle();
  if (data?.id) return;
  const { error } = await admin.from("categories").insert({
    id: "diseno_apps",
    name: "Desarrollo de apps móviles",
    name_en: "Mobile app development",
    group_id: "tecnologia",
    is_active: true,
    is_hidden: false,
    es_salud: false,
    supports_videoconsulta: true,
  });
  if (error) throw error;
}

export async function getRegressionSeedState(): Promise<RegressionSeedState | null> {
  if (!canRunSeededRegression()) return null;
  const admin = adminClient();
  const { data: client } = await admin.from("profiles").select("id").eq("email", E2E_USERS.client.email).maybeSingle();
  const { data: pro } = await admin
    .from("professionals")
    .select("id, profile_id, slug")
    .eq("slug", E2E_USERS.professional.slug)
    .maybeSingle();
  const { data: videoPro } = await admin
    .from("professionals")
    .select("id, profile_id, slug")
    .eq("slug", E2E_USERS.videoProfessional.slug)
    .maybeSingle();
  if (!client?.id || !pro?.id || !pro.profile_id || !videoPro?.id || !videoPro.profile_id) return null;
  return {
    clientId: client.id,
    professionalUserId: pro.profile_id,
    professionalId: pro.id,
    professionalSlug: pro.slug ?? E2E_USERS.professional.slug,
    videoProfessionalUserId: videoPro.profile_id,
    videoProfessionalId: videoPro.id,
    videoProfessionalSlug: videoPro.slug ?? E2E_USERS.videoProfessional.slug,
    categoryId: "plomeria",
    videoCategoryId: "desarrollo_web",
    slotDate: futureDate(8),
    slotTime: "10:00",
    videoSlotDate: futureDate(9),
    videoSharedSlotTime: "10:00",
    videoSecondSlotTime: "11:00",
    publishedJobId: REGRESSION_IDS.publishedJob,
    secondaryJobId: REGRESSION_IDS.secondaryJob,
    pausedJobId: REGRESSION_IDS.pausedJob,
    closedJobId: REGRESSION_IDS.closedJob,
    publishedOfferId: REGRESSION_IDS.publishedOffer,
    secondaryOfferId: REGRESSION_IDS.secondaryOffer,
    pausedOfferId: REGRESSION_IDS.pausedOffer,
    applicationId: REGRESSION_IDS.application,
  };
}

export async function ensureRegressionSeed(): Promise<RegressionSeedState> {
  const admin = adminClient();
  const now = new Date().toISOString();

  const clientUser = await ensureAuthUser(admin, E2E_USERS.client, "client");
  const proUser = await ensureAuthUser(admin, E2E_USERS.professional, "professional");
  const videoProUser = await ensureAuthUser(admin, E2E_USERS.videoProfessional, "professional");
  const adminUser = await ensureAuthUser(admin, E2E_USERS.admin, "admin");

  await ensureCategory(admin);
  await ensureVideoCategory(admin);
  await ensureMobileAppsCategory(admin);

  const { error: clientProfileError } = await admin.from("profiles").upsert(
    {
      id: clientUser.id,
      cedula: E2E_USERS.client.cedula,
      full_name: E2E_USERS.client.fullName,
      email: E2E_USERS.client.email,
      phone: E2E_USERS.client.phone,
      role: "client",
      is_provider: false,
      is_disabled: false,
      onboarding_completed: true,
      client_identity_status: "verified",
      client_identity_verified_at: now,
      client_identity_provider: "e2e_seed",
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (clientProfileError) throw clientProfileError;

  const { error: proProfileError } = await admin.from("profiles").upsert(
    {
      id: proUser.id,
      cedula: E2E_USERS.professional.cedula,
      full_name: E2E_USERS.professional.fullName,
      email: E2E_USERS.professional.email,
      phone: E2E_USERS.professional.phone,
      role: "professional",
      is_provider: true,
      is_disabled: false,
      onboarding_completed: true,
      client_identity_status: "verified",
      client_identity_verified_at: now,
      client_identity_provider: "e2e_seed",
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (proProfileError) throw proProfileError;

  const { error: videoProProfileError } = await admin.from("profiles").upsert(
    {
      id: videoProUser.id,
      cedula: E2E_USERS.videoProfessional.cedula,
      full_name: E2E_USERS.videoProfessional.fullName,
      email: E2E_USERS.videoProfessional.email,
      phone: E2E_USERS.videoProfessional.phone,
      role: "professional",
      is_provider: true,
      is_disabled: false,
      onboarding_completed: true,
      client_identity_status: "verified",
      client_identity_verified_at: now,
      client_identity_provider: "e2e_seed",
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (videoProProfileError) throw videoProProfileError;

  const { error: adminProfileError } = await admin.from("profiles").upsert(
    {
      id: adminUser.id,
      cedula: E2E_USERS.admin.cedula,
      full_name: E2E_USERS.admin.fullName,
      email: E2E_USERS.admin.email,
      phone: E2E_USERS.admin.phone,
      role: "admin",
      is_provider: false,
      is_disabled: false,
      onboarding_completed: true,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (adminProfileError) throw adminProfileError;

  const workplaces = [
    {
      id: "e2e-main",
      name: "Alajuela, Alajuela",
      address: "Alajuela, Alajuela",
      provinciaId: "al",
      cantonId: "al-al",
      lat: 10.01625,
      lng: -84.21163,
    },
  ];

  const services = [
    {
      id: "e2e-service-plomeria",
      name: "Plomería",
      category: "plomeria",
      description: "Reparación de fugas, sanitarios, lavamanos y tuberías para pruebas E2E.",
      priceAmount: 120000,
      priceType: "por_proyecto",
      startedAt: "2019-01",
      years: 7,
      months: 0,
      active: true,
      modalities: ["in_person"],
    },
    {
      id: "e2e-service-web",
      name: "Desarrollo web",
      category: "desarrollo_web",
      description: "Sitios web y formularios para validar filtros de varias profesiones.",
      priceAmount: 180000,
      priceType: "por_proyecto",
      startedAt: "2020-01",
      years: 6,
      months: 0,
      active: true,
      modalities: ["in_person", "video"],
    },
    {
      id: "e2e-service-mobile-apps",
      name: "Desarrollo de apps móviles",
      category: "diseno_apps",
      description: "Aplicaciones móviles para validar etiquetas largas sin recortes.",
      priceAmount: 250000,
      priceType: "por_proyecto",
      startedAt: "2021-01",
      years: 5,
      months: 0,
      active: true,
      modalities: ["video"],
    },
  ];

  const { data: professional, error: proError } = await admin
    .from("professionals")
    .upsert(
      {
        profile_id: proUser.id,
        category_id: "plomeria",
        professions: ["plomeria", "desarrollo_web", "diseno_apps"],
        services,
        bio: "Profesional de prueba para regresión automatizada de ContrataCR.",
        whatsapp: E2E_USERS.professional.phone,
        call_phone: E2E_USERS.professional.phone,
        allow_phone_call: true,
        hourly_rate: 120000,
        pricing: [],
        provincia_id: "al",
        canton_id: "al-al",
        years_experience: 7,
        is_verified: true,
        is_banned: false,
        verification_status: "verified",
        verification_method: "manual",
        verification_provider: "e2e_seed",
        verified_at: now,
        is_available: true,
        availability_public: true,
        contact_preference: "ambas",
        workplaces,
        lat: 10.01625,
        lng: -84.21163,
        search_provincias: ["al"],
        search_cantones: ["al-al"],
        coverage_areas: [],
        coverage_provincias: [],
        coverage_country: false,
        slug: E2E_USERS.professional.slug,
        updated_at: now,
      },
      { onConflict: "profile_id" },
    )
    .select("id, slug")
    .single();
  if (proError || !professional?.id) throw proError ?? new Error("Could not seed professional.");

  const videoWorkplaces = [
    {
      id: "e2e-video-office",
      name: "Atenas, Alajuela",
      address: "Atenas, Alajuela",
      provinciaId: "al",
      cantonId: "al-at",
      lat: 9.97856,
      lng: -84.37856,
    },
  ];

  const videoServices = [
    {
      id: "e2e-service-desarrollo-web",
      name: "Desarrollo web",
      category: "desarrollo_web",
      description: "Sitios web y automatizaciones para pruebas E2E de cobertura por videoconsulta.",
      priceAmount: 220000,
      priceType: "por_proyecto",
      active: true,
      modalities: ["in_person", "video"],
    },
  ];

  const { data: videoProfessional, error: videoProError } = await admin
    .from("professionals")
    .upsert(
      {
        profile_id: videoProUser.id,
        category_id: "desarrollo_web",
        professions: ["desarrollo_web"],
        services: videoServices,
        bio: "Profesional de prueba para validar videoconsultas en todo Costa Rica.",
        business_name: E2E_USERS.videoProfessional.businessName,
        whatsapp: E2E_USERS.videoProfessional.phone,
        call_phone: E2E_USERS.videoProfessional.phone,
        allow_phone_call: true,
        hourly_rate: 220000,
        pricing: [],
        provincia_id: "al",
        canton_id: "al-at",
        years_experience: 5,
        is_verified: true,
        is_banned: false,
        verification_status: "verified",
        verification_method: "manual",
        verification_provider: "e2e_seed",
        verified_at: now,
        is_available: true,
        availability_public: true,
        contact_preference: "ambas",
        workplaces: videoWorkplaces,
        lat: 9.97856,
        lng: -84.37856,
        search_provincias: ["al"],
        search_cantones: ["al-at"],
        coverage_areas: [{ level: "country" }],
        coverage_provincias: [],
        coverage_country: true,
        videoconsulta: true,
        slug: E2E_USERS.videoProfessional.slug,
        updated_at: now,
      },
      { onConflict: "profile_id" },
    )
    .select("id, slug")
    .single();
  if (videoProError || !videoProfessional?.id) throw videoProError ?? new Error("Could not seed video professional.");

  const { data: oldProjects } = await admin
    .from("projects")
    .select("id")
    .eq("client_id", clientUser.id)
    .ilike("title", "E2E Regression%");
  const oldProjectIds = (oldProjects ?? []).map((project) => project.id).filter(Boolean);
  if (oldProjectIds.length > 0) {
    await admin.from("proposals").delete().in("project_id", oldProjectIds);
    await admin.from("projects").delete().in("id", oldProjectIds);
  }

  await admin.from("proposals").delete().eq("professional_id", professional.id).ilike("message", "E2E Regression%");
  await admin.from("bookings").delete().eq("client_id", clientUser.id).ilike("service_description", "E2E Regression%");
  await admin.from("bookings").delete().eq("professional_id", professional.id).ilike("service_description", "E2E Regression%");
  await admin.from("bookings").delete().eq("professional_id", videoProfessional.id).ilike("service_description", "E2E Regression%");
  await admin.from("bookings").delete().eq("client_id", clientUser.id).ilike("service_description", "E2E review%");
  await admin.from("notifications").delete().in("user_id", [clientUser.id, proUser.id, videoProUser.id]);
  await admin.from("availability_slots").delete().eq("professional_id", professional.id);
  await admin.from("availability_slots").delete().eq("professional_id", videoProfessional.id);

  const regressionJobIds = [
    REGRESSION_IDS.publishedJob,
    REGRESSION_IDS.secondaryJob,
    REGRESSION_IDS.pausedJob,
    REGRESSION_IDS.closedJob,
  ];
  const regressionOfferIds = [
    REGRESSION_IDS.publishedOffer,
    REGRESSION_IDS.secondaryOffer,
    REGRESSION_IDS.pausedOffer,
  ];
  await admin.from("saved_items").delete().eq("user_id", clientUser.id).in("item_id", [...regressionJobIds, ...regressionOfferIds]);
  await admin.from("job_applications").delete().in("job_id", regressionJobIds);
  await admin.from("professional_activity").delete().in("content_id", [...regressionJobIds, ...regressionOfferIds]);
  await admin.from("job_posts").delete().in("id", regressionJobIds);
  await admin.from("professional_offers").delete().in("id", regressionOfferIds);
  await admin.from("professional_follows").delete().eq("follower_id", clientUser.id).in("professional_id", [professional.id, videoProfessional.id]);

  const { error: followError } = await admin.from("professional_follows").insert([
    { follower_id: clientUser.id, professional_id: professional.id },
    { follower_id: clientUser.id, professional_id: videoProfessional.id },
  ]);
  if (followError) throw followError;

  const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error: jobsError } = await admin.from("job_posts").insert([
    {
      id: REGRESSION_IDS.publishedJob,
      employer_id: professional.id,
      title: "E2E Asistente de operaciones",
      description: "Empleo publicado para validar postulaciones, guardados y estados del panel en la regresión E2E.",
      responsibilities: ["Coordinar solicitudes de clientes", "Preparar reportes semanales"],
      requirements: ["Comunicación clara", "Un año de experiencia"],
      benefits: ["Horario flexible", "Capacitación"],
      employment_type: "full_time",
      workplace_type: "onsite",
      provincia_id: "al",
      canton_id: "al-al",
      location_label: "Alajuela, Alajuela",
      salary_min: 450000,
      salary_max: 650000,
      salary_period: "monthly",
      currency: "CRC",
      show_salary: true,
      openings: 2,
      application_deadline: futureDate(30),
      status: "published",
      service_category_id: "plomeria",
      duration_label: "Permanente",
      experience_level: "one_plus",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: REGRESSION_IDS.secondaryJob,
      employer_id: videoProfessional.id,
      title: "E2E Desarrollador web remoto",
      description: "Vacante remota disponible para probar una postulación nueva y la navegación responsive completa.",
      responsibilities: ["Crear interfaces accesibles", "Revisar cambios de código"],
      requirements: ["Experiencia con aplicaciones web", "Inglés intermedio"],
      benefits: ["Trabajo remoto"],
      employment_type: "contract",
      workplace_type: "remote",
      location_label: "Costa Rica",
      salary_min: 900000,
      salary_max: 1300000,
      salary_period: "monthly",
      currency: "CRC",
      show_salary: true,
      openings: 1,
      application_deadline: futureDate(45),
      status: "published",
      service_category_id: "desarrollo_web",
      duration_label: "6 meses",
      experience_level: "two_plus",
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: REGRESSION_IDS.pausedJob,
      employer_id: professional.id,
      title: "E2E Técnico de mantenimiento",
      description: "Vacante pausada para comprobar que el panel profesional conserva las acciones y el estado correcto.",
      responsibilities: ["Atender mantenimientos preventivos"],
      requirements: ["Disponibilidad para desplazarse"],
      benefits: [],
      employment_type: "temporary",
      workplace_type: "hybrid",
      provincia_id: "al",
      canton_id: "al-at",
      location_label: "Atenas, Alajuela",
      salary_period: "monthly",
      currency: "CRC",
      show_salary: false,
      openings: 1,
      status: "paused",
      service_category_id: "plomeria",
      duration_label: "3 meses",
      experience_level: "any",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: REGRESSION_IDS.closedJob,
      employer_id: professional.id,
      title: "E2E Coordinador de instalaciones",
      description: "Vacante cerrada para validar filtros históricos y evitar acciones disponibles fuera de estado.",
      responsibilities: ["Supervisar instalaciones"],
      requirements: ["Experiencia coordinando equipos"],
      benefits: [],
      employment_type: "full_time",
      workplace_type: "onsite",
      provincia_id: "al",
      canton_id: "al-al",
      location_label: "Alajuela, Alajuela",
      salary_period: "monthly",
      currency: "CRC",
      show_salary: false,
      openings: 1,
      status: "closed",
      service_category_id: "plomeria",
      experience_level: "three_plus",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ]);
  if (jobsError) throw jobsError;

  const { error: offersError } = await admin.from("professional_offers").insert([
    {
      id: REGRESSION_IDS.publishedOffer,
      professional_id: professional.id,
      title: "E2E Mantenimiento residencial",
      description: "Oferta publicada con imagen, descuento, cobertura y disponibilidad para las pruebas de regresión.",
      offer_type: "service_offer",
      service_label: "Plomería",
      service_category_id: "plomeria",
      image_urls: ["/showcase/sg-solutions.jpg"],
      price_now: 25000,
      price_before: 35000,
      currency: "CRC",
      price_unit: "total",
      location_label: "Alajuela, Alajuela",
      valid_until: futureDate(30),
      quantity_available: 8,
      status: "published",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: REGRESSION_IDS.secondaryOffer,
      professional_id: videoProfessional.id,
      title: "E2E Sitio web para pyme",
      description: "Paquete sin imagen para comprobar el fallback visual y la navegación hacia el perfil profesional.",
      offer_type: "package",
      service_label: "Desarrollo web",
      service_category_id: "desarrollo_web",
      image_urls: [],
      price_now: 180000,
      currency: "CRC",
      price_unit: "project",
      location_label: "Todo Costa Rica",
      quantity_available: 4,
      status: "published",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: REGRESSION_IDS.pausedOffer,
      professional_id: professional.id,
      title: "E2E Diagnóstico de tuberías",
      description: "Oferta pausada para validar acciones secundarias y filtros en el panel profesional.",
      offer_type: "service_offer",
      service_label: "Plomería",
      service_category_id: "plomeria",
      image_urls: [],
      price_now: 15000,
      currency: "CRC",
      price_unit: "session",
      location_label: "Alajuela, Alajuela",
      status: "paused",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ]);
  if (offersError) throw offersError;

  const { error: applicationError } = await admin.from("job_applications").insert({
    id: REGRESSION_IDS.application,
    job_id: REGRESSION_IDS.publishedJob,
    applicant_id: clientUser.id,
    applicant_email: E2E_USERS.client.email,
    cover_letter: "E2E Regression: deseo participar en el proceso y cuento con la experiencia solicitada.",
    phone: E2E_USERS.client.phone,
    portfolio_url: "https://contratacr.com",
    status: "reviewing",
    created_at: createdAt,
    updated_at: createdAt,
  });
  if (applicationError) throw applicationError;

  const { error: savedError } = await admin.from("saved_items").insert([
    {
      user_id: clientUser.id,
      item_type: "job",
      item_id: REGRESSION_IDS.publishedJob,
      snapshot: { title: "E2E Asistente de operaciones", employer: E2E_USERS.professional.fullName },
    },
    {
      user_id: clientUser.id,
      item_type: "offer",
      item_id: REGRESSION_IDS.publishedOffer,
      snapshot: { title: "E2E Mantenimiento residencial", professional: E2E_USERS.professional.fullName },
    },
  ]);
  if (savedError) throw savedError;

  const slotDate = futureDate(8);
  const videoSlotDate = futureDate(9);
  const regressionSlots = [
    {
      professional_id: professional.id,
      slot_date: slotDate,
      slot_time: "10:00",
      category_id: "plomeria",
      location_id: "e2e-main",
    },
    {
      professional_id: professional.id,
      slot_date: slotDate,
      slot_time: "11:00",
      category_id: "plomeria",
      location_id: "e2e-main",
    },
    {
      professional_id: videoProfessional.id,
      slot_date: videoSlotDate,
      slot_time: "10:00",
      category_id: "desarrollo_web",
      location_id: "videoconsulta",
    },
    {
      professional_id: videoProfessional.id,
      slot_date: videoSlotDate,
      slot_time: "10:00",
      category_id: "desarrollo_web",
      location_id: "e2e-video-office",
    },
    {
      professional_id: videoProfessional.id,
      slot_date: videoSlotDate,
      slot_time: "11:00",
      category_id: "desarrollo_web",
      location_id: "videoconsulta",
    },
    {
      professional_id: videoProfessional.id,
      slot_date: videoSlotDate,
      slot_time: "11:00",
      category_id: "desarrollo_web",
      location_id: "e2e-video-office",
    },
  ];
  for (const slot of regressionSlots) {
    const { error: slotError } = await admin.from("availability_slots").insert(slot);
    // A referenced slot can legitimately survive cleanup. Its unique key means
    // it already has exactly the deterministic state required by this seed.
    if (slotError && slotError.code !== "23505") throw slotError;
  }

  return {
    clientId: clientUser.id,
    professionalUserId: proUser.id,
    professionalId: professional.id,
    professionalSlug: professional.slug ?? E2E_USERS.professional.slug,
    videoProfessionalUserId: videoProUser.id,
    videoProfessionalId: videoProfessional.id,
    videoProfessionalSlug: videoProfessional.slug ?? E2E_USERS.videoProfessional.slug,
    categoryId: "plomeria",
    videoCategoryId: "desarrollo_web",
    slotDate,
    slotTime: "10:00",
    videoSlotDate,
    videoSharedSlotTime: "10:00",
    videoSecondSlotTime: "11:00",
    publishedJobId: REGRESSION_IDS.publishedJob,
    secondaryJobId: REGRESSION_IDS.secondaryJob,
    pausedJobId: REGRESSION_IDS.pausedJob,
    closedJobId: REGRESSION_IDS.closedJob,
    publishedOfferId: REGRESSION_IDS.publishedOffer,
    secondaryOfferId: REGRESSION_IDS.secondaryOffer,
    pausedOfferId: REGRESSION_IDS.pausedOffer,
    applicationId: REGRESSION_IDS.application,
  };
}
