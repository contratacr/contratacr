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

// La identidad sale del archivo compartido: es inventada, y así el arranque
// local y el de test nombran a la misma pareja.
const ACTORES = require("./actores-de-regresion.json");

const actors = [
  {
    profileId: ACTORES.cliente.profileId,
    professionalId: ACTORES.cliente.professionalId,
    email: ACTORES.cliente.correo,
    fullName: ACTORES.cliente.negocio,
    slug: ACTORES.cliente.slug,
    categoryId: "desarrollo_web",
    professionIds: ["desarrollo_web", "diseno_apps"],
    provinceId: "sj",
    cantonId: "sj-sj",
    phone: "+50670000001",
    hourlyRate: 185000,
  },
  {
    profileId: ACTORES.profesional.profileId,
    professionalId: ACTORES.profesional.professionalId,
    email: ACTORES.profesional.correo,
    fullName: ACTORES.profesional.negocio,
    slug: ACTORES.profesional.slug,
    categoryId: "redes_internet",
    professionIds: ["redes_internet", "soporte_tecnico", "aire_acondicionado"],
    provinceId: "al",
    cantonId: "al-at",
    wholeProvince: true,
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
      name: profession === "redes_internet"
        ? "Redes e internet"
        : profession === "aire_acondicionado"
          ? "Aire acondicionado"
          : "Desarrollo web",
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
      coverage_provincias: actor.wholeProvince ? [actor.provinceId] : [],
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

  console.log(`Seeded ${actors.length} synthetic local actors and private storage.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
