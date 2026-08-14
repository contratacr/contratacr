/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const password = process.env.LOCAL_REGRESSION_PASSWORD || "";
const expectedHost = new Set(["127.0.0.1", "localhost"]);
let parsed;

try {
  parsed = new URL(url);
} catch {
  throw new Error("Local regression seed requires a valid Supabase URL.");
}

if (
  process.env.LOCAL_REGRESSION_SEED !== "1"
  || !expectedHost.has(parsed.hostname)
  || !serviceRole
  || !password
) {
  throw new Error("Refusing to seed anything except the explicit loopback Supabase stack.");
}

const db = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const actors = [
  {
    profileId: "048f1b3a-23c0-41bc-8728-10f8aed70fdb",
    professionalId: "ae9caa2b-1fca-4411-9aeb-7736f5bbf42f",
    email: "e2e.client@contratacr.test",
    fullName: "ContrataCR",
    slug: "isaac-alberto-sanchez-monge-9gjc65t8",
    categoryId: "desarrollo_web",
    professionIds: ["desarrollo_web", "diseno_apps"],
    provinceId: "sj",
    cantonId: "sj-sj",
    phone: "+50670000001",
    hourlyRate: 185000,
  },
  {
    profileId: "347f5202-8b3e-4c11-8db8-1060ea5e487d",
    professionalId: "988428c7-a0b6-4d9e-a9b8-e0209a1ca296",
    email: "e2e.pro@contratacr.test",
    fullName: "SG Solutions",
    slug: "luis-angel-sanchez-sibaja-977u5iku",
    categoryId: "redes_internet",
    professionIds: ["redes_internet", "soporte_tecnico"],
    provinceId: "al",
    cantonId: "al-at",
    phone: "+50670000002",
    hourlyRate: 120000,
  },
];

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  for (const actor of actors) {
    await must(`local profile ${actor.fullName}`, db.from("profiles").upsert({
      id: actor.profileId,
      email: actor.email,
      full_name: actor.fullName,
      phone: actor.phone,
      cedula: null,
      role: "professional",
      avatar_url: "http://127.0.0.1:3000/web-app-manifest-192x192.png",
      is_provider: true,
      onboarding_completed: true,
      is_disabled: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" }));

    const services = actor.professionIds.map((profession, index) => ({
      id: `${actor.slug}-service-${index + 1}`,
      category: profession,
      name: profession === "redes_internet" ? "Redes e internet" : "Desarrollo web",
      active: true,
      priceAmount: actor.hourlyRate,
      priceType: "por_proyecto",
      modalities: ["in_person", "video"],
      startedAt: "2020-01",
      description: `Servicio sintético local de ${actor.fullName}.`,
    }));
    const portfolioItems = actor.professionIds.map((profession, index) => ({
      id: `${actor.slug}-case-${index + 1}`,
      profession,
      title: `${actor.fullName}: caso local ${index + 1}`,
      description: "Caso sintético para validar filtros y presentación visual.",
      recipient: "Regresión local",
      date: "2026",
      photos: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
      likes: 1,
    }));

    await must(`local professional ${actor.fullName}`, db.from("professionals").upsert({
      id: actor.professionalId,
      profile_id: actor.profileId,
      category_id: actor.categoryId,
      professions: actor.professionIds,
      business_name: actor.fullName,
      public_business_name_only: true,
      slug: actor.slug,
      bio: `Perfil profesional sintético de ${actor.fullName} para regresión local.`,
      whatsapp: actor.phone,
      call_phone: actor.phone,
      allow_phone_call: true,
      contact_email: actor.email,
      hourly_rate: actor.hourlyRate,
      provincia_id: actor.provinceId,
      canton_id: actor.cantonId,
      years_experience: 6,
      is_verified: true,
      verification_status: "verified",
      is_available: true,
      videoconsulta: true,
      coverage_country: true,
      availability_public: true,
      portfolio_urls: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
      portfolio_items: portfolioItems,
      services,
      languages: ["es", "en"],
      certifications: actor.professionIds.map((profession, index) => ({
        id: `${actor.slug}-cert-${index + 1}`,
        name: `Certificación local ${index + 1}`,
        institution: "ContrataCR Regression",
        year: 2026,
        profession,
      })),
      workplaces: [{
        id: `${actor.slug}-office`,
        label: actor.cantonId === "al-at" ? "Atenas, Alajuela" : "San José",
        provinciaId: actor.provinceId,
        cantonId: actor.cantonId,
      }],
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" }));
  }

  const { error: bucketError } = await db.storage.createBucket("direct-message-attachments", {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
  });
  if (bucketError && !/already exists|duplicate/i.test(bucketError.message)) {
    throw new Error(`local storage bucket: ${bucketError.message}`);
  }

  console.log(`Seeded ${actors.length} synthetic local actors, padrón samples and private storage.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
