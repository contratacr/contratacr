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
} as const;

export type RegressionSeedState = {
  clientId: string;
  professionalUserId: string;
  professionalId: string;
  professionalSlug: string;
  categoryId: string;
  slotDate: string;
  slotTime: string;
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

async function ensureAuthUser(admin: AdminClient, user: typeof E2E_USERS.client | typeof E2E_USERS.professional, isProvider: boolean) {
  const existing = await findUserByEmail(admin, user.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        onboarding_completed: true,
        role: isProvider ? "professional" : "client",
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
      role: isProvider ? "professional" : "client",
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

export async function getRegressionSeedState(): Promise<RegressionSeedState | null> {
  if (!canRunSeededRegression()) return null;
  const admin = adminClient();
  const { data: client } = await admin.from("profiles").select("id").eq("email", E2E_USERS.client.email).maybeSingle();
  const { data: pro } = await admin
    .from("professionals")
    .select("id, profile_id, slug")
    .eq("slug", E2E_USERS.professional.slug)
    .maybeSingle();
  if (!client?.id || !pro?.id || !pro.profile_id) return null;
  return {
    clientId: client.id,
    professionalUserId: pro.profile_id,
    professionalId: pro.id,
    professionalSlug: pro.slug ?? E2E_USERS.professional.slug,
    categoryId: "plomeria",
    slotDate: futureDate(8),
    slotTime: "10:00",
  };
}

export async function ensureRegressionSeed(): Promise<RegressionSeedState> {
  const admin = adminClient();
  const now = new Date().toISOString();

  const clientUser = await ensureAuthUser(admin, E2E_USERS.client, false);
  const proUser = await ensureAuthUser(admin, E2E_USERS.professional, true);

  await ensureCategory(admin);

  const { error: clientProfileError } = await admin.from("profiles").upsert(
    {
      id: clientUser.id,
      cedula: E2E_USERS.client.cedula,
      full_name: E2E_USERS.client.fullName,
      email: E2E_USERS.client.email,
      phone: E2E_USERS.client.phone,
      role: "client",
      is_provider: false,
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
      onboarding_completed: true,
      client_identity_status: "verified",
      client_identity_verified_at: now,
      client_identity_provider: "e2e_seed",
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (proProfileError) throw proProfileError;

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
      active: true,
      modalities: ["in_person"],
    },
  ];

  const { data: professional, error: proError } = await admin
    .from("professionals")
    .upsert(
      {
        profile_id: proUser.id,
        category_id: "plomeria",
        professions: ["plomeria"],
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
  await admin.from("notifications").delete().in("user_id", [clientUser.id, proUser.id]);
  await admin.from("availability_slots").delete().eq("professional_id", professional.id);

  const slotDate = futureDate(8);
  const { error: slotError } = await admin.from("availability_slots").insert([
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
  ]);
  if (slotError) throw slotError;

  return {
    clientId: clientUser.id,
    professionalUserId: proUser.id,
    professionalId: professional.id,
    professionalSlug: professional.slug ?? E2E_USERS.professional.slug,
    categoryId: "plomeria",
    slotDate,
    slotTime: "10:00",
  };
}
