import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "oqheayqqprpciqdvdaqo";
const PROD_PROJECT_REF = "kskueodxaksxvjrysouw";
const regressionPassword = process.env.E2E_TEST_PASSWORD ?? "";

// La identidad de las dos cuentas de prueba vive en un solo archivo y es
// inventada: antes eran copia de dos personas reales de producción.
import ACTORES from "../../scripts/actores-de-regresion.json";

export const ACTOR_CLIENTE = ACTORES.cliente;
export const ACTOR_PROFESIONAL = ACTORES.profesional;

export const E2E_USERS = {
  client: {
    email: ACTORES.cliente.correo,
    password: regressionPassword,
    fullName: ACTORES.cliente.negocio,
    phone: "+50670000001",
    cedula: "",
  },
  professional: {
    email: ACTORES.profesional.correo,
    password: regressionPassword,
    fullName: ACTORES.profesional.negocio,
    phone: "+50670000002",
    cedula: "",
    slug: ACTORES.profesional.slug,
  },
  videoProfessional: {
    email: ACTORES.cliente.correo,
    password: regressionPassword,
    fullName: ACTORES.cliente.negocio,
    phone: "+50670000001",
    cedula: "",
    slug: ACTORES.cliente.slug,
    businessName: ACTORES.cliente.negocio,
  },
} as const;

const REGRESSION_IDS = {
  publishedJob: "d4000000-0000-4000-8000-000000000005",
  secondaryJob: "d4000000-0000-4000-8000-000000000001",
  pausedJob: "d4000000-0000-4000-8000-000000000006",
  closedJob: "d4000000-0000-4000-8000-000000000007",
  publishedOffer: "d6000000-0000-4000-8000-000000000006",
  secondaryOffer: "d6000000-0000-4000-8000-000000000001",
  pausedOffer: "d6000000-0000-4000-8000-000000000007",
  application: "d5000000-0000-4000-8000-000000000001",
} as const;

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
  slotLocationId: string;
  videoSlotDate: string;
  videoSharedSlotTime: string;
  videoSecondSlotTime: string;
  videoPhysicalLocationId: string;
  publishedJobId: string;
  publishedJobTitle: string;
  secondaryJobId: string;
  secondaryJobTitle: string;
  pausedJobId: string;
  closedJobId: string;
  publishedOfferId: string;
  secondaryOfferId: string;
  pausedOfferId: string;
  applicationId: string;
};

type AdminClient = SupabaseClient;
type RegressionProfessionalRow = {
  id: string;
  profile_id: string;
  slug: string | null;
  category_id: string | null;
  workplaces: unknown;
};

const SEED_QUERY_TIMEOUT_MS = 12_000;
const SEED_QUERY_ATTEMPTS = 3;
let regressionSeedPromise: Promise<RegressionSeedState | null> | null = null;

function envUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function assertSafeTestTarget() {
  const url = envUrl();
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for E2E fixtures.");
  }
  if (url.includes(PROD_PROJECT_REF)) {
    throw new Error("Refusing to use regression fixtures against the production Supabase project.");
  }
  if (!url.includes(TEST_PROJECT_REF) && process.env.E2E_ALLOW_NON_TEST_SUPABASE !== "1") {
    throw new Error("Refusing a non-test Supabase project without E2E_ALLOW_NON_TEST_SUPABASE=1.");
  }
}

export function canRunSeededRegression() {
  const url = envUrl();
  return (
    process.env.E2E_FIXTURES_READY === "1" &&
    !!regressionPassword &&
    !!url &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !url.includes(PROD_PROJECT_REF)
  );
}

function adminClient(): AdminClient {
  assertSafeTestTarget();
  return createClient(envUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function regressionAdminClient() {
  return adminClient();
}

function futureDate(daysAhead: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + daysAhead);
  return value.toISOString().slice(0, 10);
}

async function readRegressionSeedState(): Promise<RegressionSeedState | null> {
  if (!canRunSeededRegression()) return null;
  const admin = adminClient();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), SEED_QUERY_TIMEOUT_MS);
  let client: { id: string } | null = null;
  let professional: RegressionProfessionalRow | null = null;
  let videoProfessional: RegressionProfessionalRow | null = null;
  let seededJobs: Array<{ id: string; title: string }> = [];

  try {
    const [clientResult, professionalResult, jobsResult] = await Promise.all([
      admin
        .from("profiles")
        .select("id")
        .eq("email", E2E_USERS.client.email)
        .abortSignal(abortController.signal)
        .maybeSingle(),
      admin
        .from("professionals")
        .select("id,profile_id,slug,category_id,workplaces")
        .eq("slug", E2E_USERS.professional.slug)
        .abortSignal(abortController.signal)
        .maybeSingle(),
      admin
        .from("job_posts")
        .select("id,title")
        .in("id", [REGRESSION_IDS.publishedJob, REGRESSION_IDS.secondaryJob])
        .abortSignal(abortController.signal),
    ]);
    if (clientResult.error) throw clientResult.error;
    if (professionalResult.error) throw professionalResult.error;
    if (jobsResult.error) throw jobsResult.error;

    client = clientResult.data;
    professional = professionalResult.data;
    seededJobs = jobsResult.data ?? [];

    if (client?.id) {
      const videoResult = await admin
        .from("professionals")
        .select("id,profile_id,slug,category_id,workplaces")
        .eq("profile_id", client.id)
        .abortSignal(abortController.signal)
        .maybeSingle();
      if (videoResult.error) throw videoResult.error;
      videoProfessional = videoResult.data;
    }
  } finally {
    clearTimeout(timeout);
  }
  const seededJobTitles = new Map((seededJobs ?? []).map((job) => [job.id, job.title]));

  if (
    !client?.id ||
    !professional?.id ||
    !professional.profile_id ||
    !professional.category_id ||
    !videoProfessional?.id ||
    !videoProfessional.profile_id ||
    !videoProfessional.category_id ||
    !seededJobTitles.get(REGRESSION_IDS.publishedJob) ||
    !seededJobTitles.get(REGRESSION_IDS.secondaryJob)
  ) {
    return null;
  }

  const professionalWorkplaces = Array.isArray(professional.workplaces)
    ? professional.workplaces as Array<{ id?: unknown }>
    : [];
  const professionalPhysicalLocation = professionalWorkplaces.find(
    (workplace) => typeof workplace?.id === "string" && workplace.id.trim(),
  )?.id;
  const videoWorkplaces = Array.isArray(videoProfessional.workplaces)
    ? videoProfessional.workplaces as Array<{ id?: unknown }>
    : [];
  const videoPhysicalLocation = videoWorkplaces.find(
    (workplace) => typeof workplace?.id === "string" && workplace.id.trim(),
  )?.id;

  return {
    clientId: client.id,
    professionalUserId: professional.profile_id,
    professionalId: professional.id,
    professionalSlug: professional.slug ?? E2E_USERS.professional.slug,
    videoProfessionalUserId: videoProfessional.profile_id,
    videoProfessionalId: videoProfessional.id,
    videoProfessionalSlug: videoProfessional.slug ?? E2E_USERS.videoProfessional.slug,
    categoryId: professional.category_id,
    videoCategoryId: videoProfessional.category_id,
    slotDate: futureDate(3),
    slotTime: "14:00",
    slotLocationId: typeof professionalPhysicalLocation === "string" ? professionalPhysicalLocation : "regression-office-sg",
    videoSlotDate: futureDate(2),
    videoSharedSlotTime: "10:00",
    videoSecondSlotTime: "11:00",
    videoPhysicalLocationId: typeof videoPhysicalLocation === "string" ? videoPhysicalLocation : "regression-office",
    publishedJobId: REGRESSION_IDS.publishedJob,
    publishedJobTitle: seededJobTitles.get(REGRESSION_IDS.publishedJob)!,
    secondaryJobId: REGRESSION_IDS.secondaryJob,
    secondaryJobTitle: seededJobTitles.get(REGRESSION_IDS.secondaryJob)!,
    pausedJobId: REGRESSION_IDS.pausedJob,
    closedJobId: REGRESSION_IDS.closedJob,
    publishedOfferId: REGRESSION_IDS.publishedOffer,
    secondaryOfferId: REGRESSION_IDS.secondaryOffer,
    pausedOfferId: REGRESSION_IDS.pausedOffer,
    applicationId: REGRESSION_IDS.application,
  };
}

export async function getRegressionSeedState(): Promise<RegressionSeedState | null> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= SEED_QUERY_ATTEMPTS; attempt += 1) {
    try {
      return await readRegressionSeedState();
    } catch (error) {
      lastError = error;
      if (attempt < SEED_QUERY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out while reading regression fixtures.");
}

/**
 * Los horarios que las pruebas reservan se consumen al reservarlos: después de
 * una corrida larga la ficha se quedaba sin «Ver disponibilidad» y la siguiente
 * corrida fallaba por falta de datos, no por un error del app. Antes de cada
 * sesión se reponen los cupos fijos que las pruebas esperan.
 */
async function reponerHorarios(state: RegressionSeedState) {
  const admin = adminClient();
  // Varias horas el mismo día: una sola reserva por corrida no puede dejar la
  // ficha sin disponibilidad para la corrida siguiente.
  const horasDeRepuesto = ["13:00:00", "15:00:00", "16:00:00", "17:00:00", "18:00:00", "19:00:00"].map((hora, indice) => ({
    id: `c2000000-0000-4000-8000-0000000000e${indice + 1}`,
    professional_id: state.professionalId,
    slot_date: state.slotDate,
    slot_time: hora,
    location_id: state.slotLocationId,
    category_id: state.categoryId,
  }));
  const cupos = [
    { id: "c2000000-0000-4000-8000-0000000000f1", professional_id: state.professionalId, slot_date: state.slotDate, slot_time: `${state.slotTime}:00`, location_id: state.slotLocationId, category_id: state.categoryId },
    ...horasDeRepuesto,
    { id: "c2000000-0000-4000-8000-0000000000f2", professional_id: state.videoProfessionalId, slot_date: state.videoSlotDate, slot_time: `${state.videoSharedSlotTime}:00`, location_id: "videoconsulta", category_id: state.videoCategoryId },
    { id: "c2000000-0000-4000-8000-0000000000f3", professional_id: state.videoProfessionalId, slot_date: state.videoSlotDate, slot_time: `${state.videoSecondSlotTime}:00`, location_id: "videoconsulta", category_id: state.videoCategoryId },
  ];
  // La tabla tiene su propia llave única (profesional + fecha + hora + lugar),
  // así que el cupo que ya está se salta y solo se repone el que falta.
  for (const cupo of cupos) {
    const { count } = await admin
      .from("availability_slots")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", cupo.professional_id)
      .eq("slot_date", cupo.slot_date)
      .eq("slot_time", cupo.slot_time);
    if ((count ?? 0) > 0) continue;
    await admin.from("availability_slots").insert(cupo);
  }
}

let reponerHorariosPromise: Promise<void> | null = null;

export async function ensureRegressionSeed(): Promise<RegressionSeedState> {
  if (process.env.E2E_FIXTURES_READY !== "1") {
    throw new Error("Run seed:test:full and set E2E_FIXTURES_READY=1 before seeded regression.");
  }
  if (!regressionPassword) {
    throw new Error("E2E_TEST_PASSWORD is required for the protected regression actors.");
  }
  regressionSeedPromise ??= getRegressionSeedState().catch((error) => {
    // A failed read must not poison the worker for every later spec. The next
    // caller gets a fresh bounded attempt instead of reusing a rejected promise.
    regressionSeedPromise = null;
    throw error;
  });
  const state = await regressionSeedPromise;
  if (!state) {
    throw new Error("Faltan las cuentas de prueba (Estudio Delta y Redes Bahía). Corré seed:test:full.");
  }
  reponerHorariosPromise ??= reponerHorarios(state).catch(() => undefined);
  await reponerHorariosPromise;
  return state;
}
