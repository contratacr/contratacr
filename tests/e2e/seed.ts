import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "sodegkfjjrdkbohycqyq";
const PROD_PROJECT_REF = "kskueodxaksxvjrysouw";
const regressionPassword = process.env.E2E_TEST_PASSWORD ?? "";

export const E2E_USERS = {
  client: {
    email: "e2e.client@contratacr.test",
    password: regressionPassword,
    fullName: "ContrataCR",
    phone: "+50670000001",
    cedula: "",
  },
  professional: {
    email: "e2e.pro@contratacr.test",
    password: regressionPassword,
    fullName: "SG Solutions",
    phone: "+50670000002",
    cedula: "",
    slug: "luis-angel-sanchez-sibaja-977u5iku",
  },
  videoProfessional: {
    email: "e2e.client@contratacr.test",
    password: regressionPassword,
    fullName: "ContrataCR",
    phone: "+50670000001",
    cedula: "",
    slug: "isaac-alberto-sanchez-monge-9gjc65t8",
    businessName: "ContrataCR",
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

export async function getRegressionSeedState(): Promise<RegressionSeedState | null> {
  if (!canRunSeededRegression()) return null;
  const admin = adminClient();
  const { data: client } = await admin
    .from("profiles")
    .select("id")
    .eq("email", E2E_USERS.client.email)
    .maybeSingle();
  const { data: professional } = await admin
    .from("professionals")
    .select("id,profile_id,slug,category_id")
    .eq("slug", E2E_USERS.professional.slug)
    .maybeSingle();
  const { data: videoProfessional } = await admin
    .from("professionals")
    .select("id,profile_id,slug,category_id,workplaces")
    .eq("profile_id", client?.id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();

  if (
    !client?.id ||
    !professional?.id ||
    !professional.profile_id ||
    !professional.category_id ||
    !videoProfessional?.id ||
    !videoProfessional.profile_id ||
    !videoProfessional.category_id
  ) {
    return null;
  }

  const workplaces = Array.isArray(videoProfessional.workplaces)
    ? videoProfessional.workplaces as Array<{ id?: unknown }>
    : [];
  const physicalLocation = workplaces.find(
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
    slotLocationId: "regression-office-sg",
    videoSlotDate: futureDate(2),
    videoSharedSlotTime: "10:00",
    videoSecondSlotTime: "11:00",
    videoPhysicalLocationId: typeof physicalLocation === "string" ? physicalLocation : "regression-office",
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
  if (process.env.E2E_FIXTURES_READY !== "1") {
    throw new Error("Run seed:test:full and set E2E_FIXTURES_READY=1 before seeded regression.");
  }
  if (!regressionPassword) {
    throw new Error("E2E_TEST_PASSWORD is required for the protected regression actors.");
  }
  const state = await getRegressionSeedState();
  if (!state) {
    throw new Error("ContrataCR/SG Solutions regression fixtures are missing. Run seed:test:full first.");
  }
  return state;
}
