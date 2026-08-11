const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const TEST_SUPABASE_REF = "sodegkfjjrdkbohycqyq";
const SEED = "full-app-regression-v1";
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
const supabaseRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || "unknown";
  } catch {
    return "invalid";
  }
})();

if (supabaseRef !== TEST_SUPABASE_REF) {
  throw new Error(`Refusing to seed Supabase project ${supabaseRef}; expected ${TEST_SUPABASE_REF}.`);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in the test environment file.");
}

const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = {
  jobs: [
    "a1100000-0000-4000-8000-000000000001",
    "a1100000-0000-4000-8000-000000000002",
    "a1100000-0000-4000-8000-000000000003",
    "a1100000-0000-4000-8000-000000000004",
    "a1100000-0000-4000-8000-000000000005",
  ],
  offers: [
    "a2200000-0000-4000-8000-000000000001",
    "a2200000-0000-4000-8000-000000000002",
    "a2200000-0000-4000-8000-000000000003",
    "a2200000-0000-4000-8000-000000000004",
    "a2200000-0000-4000-8000-000000000005",
  ],
  applications: [
    "a3300000-0000-4000-8000-000000000001",
    "a3300000-0000-4000-8000-000000000002",
    "a3300000-0000-4000-8000-000000000003",
    "a3300000-0000-4000-8000-000000000004",
    "a3300000-0000-4000-8000-000000000005",
    "a3300000-0000-4000-8000-000000000006",
  ],
  tickets: [
    "a4400000-0000-4000-8000-000000000001",
    "a4400000-0000-4000-8000-000000000002",
    "a4400000-0000-4000-8000-000000000003",
  ],
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (daysAgo = 0, hour = 10) => {
  const value = new Date(now - daysAgo * DAY);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};
const futureDate = (days) => new Date(now + days * DAY).toISOString().slice(0, 10);
const pastDate = (days) => new Date(now - days * DAY).toISOString().slice(0, 10);

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function findMirroredProfessionalByBusinessName(businessName) {
  const professionals = await must(
    `find ${businessName} professionals`,
    supabase
      .from("professionals")
      .select("id,profile_id,slug,business_name,category_id")
      .ilike("business_name", businessName),
  );
  if (!professionals.length) return null;

  const profiles = await must(
    `find ${businessName} profiles`,
    supabase.from("profiles").select("id,email").in("id", professionals.map((row) => row.profile_id)),
  );
  const mirroredProfileIds = new Set(
    profiles
      .filter((profile) => /^prod\+.*@mirror\.contratacr\.test$/i.test(profile.email || ""))
      .map((profile) => profile.id),
  );
  return professionals.find((row) => mirroredProfileIds.has(row.profile_id)) || professionals[0];
}

async function deleteTaggedNotifications() {
  const rows = await must(
    "read regression notifications",
    supabase.from("notifications").select("id,data").limit(2000),
  );
  const contentIds = new Set([...ids.jobs, ...ids.offers, ...ids.applications]);
  const notificationIds = rows
    .filter((row) => {
      const data = row.data || {};
      return data.regressionSeed === SEED
        || contentIds.has(data.job_id)
        || contentIds.has(data.offer_id)
        || contentIds.has(data.application_id)
        || contentIds.has(data.content_id);
    })
    .map((row) => row.id);
  if (notificationIds.length) {
    await must("delete regression notifications", supabase.from("notifications").delete().in("id", notificationIds));
  }
}

async function assertMarketplaceNotificationSchema(userId) {
  const probe = {
    user_id: userId,
    type: "job_application_status",
    title: "Regression schema probe",
    message: "Temporary compatibility check.",
    read: true,
    data: { regressionSeed: `${SEED}-schema-probe` },
  };
  const { data, error } = await supabase
    .from("notifications")
    .insert(probe)
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `Test database is missing the marketplace notification schema (migration 159 or newer): ${error.message}`,
    );
  }

  await must(
    "delete notification schema probe",
    supabase.from("notifications").delete().eq("id", data.id),
  );
}

async function main() {
  const isaac = await must(
    "find Isaac profile",
    supabase.from("profiles").select("id,email,full_name,avatar_url").eq("email", "isaacsanchezmonge@gmail.com").single(),
  );
  const [isaacPro] = await must(
    "find Isaac professional",
    supabase.from("professionals").select("id,profile_id,slug,business_name,category_id").eq("profile_id", isaac.id).limit(1),
  );
  if (!isaacPro) throw new Error("Isaac does not have a professional profile in test.");

  await assertMarketplaceNotificationSchema(isaac.id);

  const sg = await findMirroredProfessionalByBusinessName("SG Solutions");
  if (!sg) throw new Error("SG Solutions was not found in test. Run seed-mobile-demo.js first.");

  const candidatePros = await must(
    "find applicant fixtures",
    supabase
      .from("professionals")
      .select("id,profile_id,slug,business_name,profiles(full_name,email,avatar_url)")
      .in("slug", ["test-conta-clara", "test-limpieza-total", "test-electro-soluciones", "test-web-norte", "test-jardin-vivo"]),
  );
  const candidates = candidatePros
    .filter((candidate) => candidate.profile_id !== isaac.id && candidate.profile_id !== sg.profile_id)
    .slice(0, 5);
  if (candidates.length < 5) {
    throw new Error(`Expected five applicant fixtures in test, found ${candidates.length}. Run seed-mobile-demo.js first.`);
  }

  await deleteTaggedNotifications();
  await must("delete regression support messages", supabase.from("support_ticket_messages").delete().in("ticket_id", ids.tickets));
  await must("delete regression support tickets", supabase.from("support_tickets").delete().in("id", ids.tickets));
  await must("delete regression saved items", supabase.from("saved_items").delete().in("item_id", [...ids.jobs, ...ids.offers]));
  await must("delete regression applications", supabase.from("job_applications").delete().in("id", ids.applications));
  await must(
    "delete regression activity",
    supabase.from("professional_activity").delete().in("content_id", [...ids.jobs, ...ids.offers]),
  );
  await must("delete regression offers", supabase.from("professional_offers").delete().in("id", ids.offers));
  await must("delete regression jobs", supabase.from("job_posts").delete().in("id", ids.jobs));

  await must(
    "seed follows",
    supabase.from("professional_follows").upsert(
      [
        { follower_id: isaac.id, professional_id: sg.id, created_at: iso(20) },
        { follower_id: candidates[0].profile_id, professional_id: isaacPro.id, created_at: iso(18) },
        { follower_id: candidates[1].profile_id, professional_id: isaacPro.id, created_at: iso(16) },
      ],
      { onConflict: "follower_id,professional_id" },
    ),
  );

  const isaacCategory = isaacPro.category_id || "desarrollo_web";
  const sgCategory = sg.category_id || "redes_e_internet";
  const jobs = [
    {
      id: ids.jobs[0], employer_id: isaacPro.id, title: "Asistente de operaciones digitales",
      description: "Coordina solicitudes, documenta procesos y brinda seguimiento a clientes del equipo digital.",
      responsibilities: ["Dar seguimiento a solicitudes", "Actualizar reportes semanales"],
      requirements: ["Orden y comunicaci\u00f3n", "Manejo b\u00e1sico de hojas de c\u00e1lculo"],
      benefits: ["Horario flexible", "Capacitaci\u00f3n continua"], employment_type: "full_time",
      workplace_type: "hybrid", provincia_id: "2", canton_id: "205", location_label: "Atenas, Alajuela",
      salary_min: 450000, salary_max: 650000, salary_period: "monthly", currency: "CRC", show_salary: true,
      openings: 2, application_deadline: futureDate(21), status: "published", service_category_id: isaacCategory,
      duration_label: null, experience_level: "one_plus", created_at: iso(2), updated_at: iso(2),
    },
    {
      id: ids.jobs[1], employer_id: isaacPro.id, title: "Desarrollador web junior",
      description: "Apoya la construcci\u00f3n y prueba de interfaces web accesibles para clientes de Costa Rica.",
      responsibilities: ["Implementar interfaces responsivas", "Corregir incidencias verificadas"],
      requirements: ["HTML, CSS y JavaScript", "Portafolio o proyectos de estudio"],
      benefits: ["Trabajo remoto", "Mentor\u00eda t\u00e9cnica"], employment_type: "contract",
      workplace_type: "remote", provincia_id: null, canton_id: null, location_label: "Costa Rica",
      salary_min: null, salary_max: null, salary_period: "project", currency: "CRC", show_salary: false,
      openings: 1, application_deadline: futureDate(12), status: "published", service_category_id: isaacCategory,
      duration_label: "Proyecto de 3 meses", experience_level: "any", created_at: iso(5), updated_at: iso(1),
    },
    {
      id: ids.jobs[2], employer_id: isaacPro.id, title: "Coordinador de soporte",
      description: "Escenario de regresi\u00f3n para validar publicaciones pausadas y sus acciones administrativas.",
      responsibilities: ["Coordinar casos de soporte"], requirements: ["Dos a\u00f1os de experiencia"],
      benefits: [], employment_type: "part_time", workplace_type: "onsite", provincia_id: "1", canton_id: "101",
      location_label: "San Jos\u00e9, San Jos\u00e9", salary_min: 300000, salary_max: 380000,
      salary_period: "monthly", currency: "CRC", show_salary: true, openings: 1,
      application_deadline: futureDate(7), status: "paused", service_category_id: isaacCategory,
      duration_label: null, experience_level: "two_plus", created_at: iso(8), updated_at: iso(3),
    },
    {
      id: ids.jobs[3], employer_id: isaacPro.id, title: "Especialista de contenido",
      description: "Escenario cerrado para comprobar estados finales, filtros y navegaci\u00f3n del panel profesional.",
      responsibilities: ["Redactar contenido"], requirements: ["Excelente ortograf\u00eda"], benefits: [],
      employment_type: "temporary", workplace_type: "hybrid", provincia_id: "4", canton_id: "401",
      location_label: "Heredia, Heredia", salary_min: 250000, salary_max: 320000, salary_period: "biweekly",
      currency: "CRC", show_salary: true, openings: 1, application_deadline: pastDate(2), status: "closed",
      service_category_id: isaacCategory, duration_label: "Temporada alta", experience_level: "three_plus",
      created_at: iso(20), updated_at: iso(2),
    },
    {
      id: ids.jobs[4], employer_id: sg.id, title: "T\u00e9cnico de redes",
      description: "Instala y diagnostica redes empresariales con acompa\u00f1amiento del equipo de SG Solutions.",
      responsibilities: ["Instalar cableado estructurado", "Documentar diagn\u00f3sticos"],
      requirements: ["Licencia B1", "Disponibilidad para desplazarse"], benefits: ["Vi\u00e1ticos"],
      employment_type: "full_time", workplace_type: "onsite", provincia_id: "2", canton_id: "205",
      location_label: "Atenas, Alajuela", salary_min: 500000, salary_max: 750000, salary_period: "monthly",
      currency: "CRC", show_salary: true, openings: 3, application_deadline: futureDate(30), status: "published",
      service_category_id: sgCategory, duration_label: null, experience_level: "two_plus", created_at: iso(1), updated_at: iso(1),
    },
  ];
  await must("seed jobs", supabase.from("job_posts").insert(jobs));

  const offers = [
    {
      id: ids.offers[0], professional_id: isaacPro.id, title: "Sitio web profesional",
      description: "Dise\u00f1o y desarrollo de sitio responsivo con configuraci\u00f3n inicial y soporte de lanzamiento.",
      offer_type: "service_offer", service_label: "Desarrollo web",
      image_urls: ["/og-image.png"], price_now: 185000, price_before: 240000, currency: "CRC",
      price_unit: "project", location_label: "Todo Costa Rica", valid_until: futureDate(30), quantity_available: 8,
      status: "published", service_category_id: isaacCategory, created_at: iso(1), updated_at: iso(1),
    },
    {
      id: ids.offers[1], professional_id: isaacPro.id, title: "Paquete de presencia digital",
      description: "Paquete con sitio informativo, configuraci\u00f3n de perfil y piezas visuales para iniciar en l\u00ednea.",
      offer_type: "package", service_label: "Desarrollo web",
      image_urls: ["/landing-professionals-search.png", "/og-image.png", "/logo-wordmark-transparent.png"],
      price_now: 295000, price_before: 350000, currency: "CRC", price_unit: "total",
      location_label: "Costa Rica", valid_until: futureDate(15), quantity_available: 4, status: "published",
      service_category_id: isaacCategory, created_at: iso(4), updated_at: iso(2),
    },
    {
      id: ids.offers[2], professional_id: isaacPro.id, title: "Auditor\u00eda de experiencia web",
      description: "Publicaci\u00f3n pausada para revisar filtros, estados, edici\u00f3n y acciones del panel.",
      offer_type: "service_offer", service_label: "Desarrollo web", image_urls: [], price_now: 65000,
      price_before: null, currency: "CRC", price_unit: "total", location_label: "Videoconsulta",
      valid_until: futureDate(45), quantity_available: null, status: "paused", service_category_id: isaacCategory,
      created_at: iso(10), updated_at: iso(3),
    },
    {
      id: ids.offers[3], professional_id: sg.id, title: "Instalaci\u00f3n de red empresarial",
      description: "Incluye diagn\u00f3stico, instalaci\u00f3n y configuraci\u00f3n inicial para una oficina peque\u00f1a.",
      offer_type: "service_offer", service_label: "Redes e internet",
      image_urls: ["/test-professionals/sg-solutions.png", "/showcase/sg-solutions.jpg"], price_now: 120000,
      price_before: 150000, currency: "CRC", price_unit: "project", location_label: "Atenas, Alajuela",
      valid_until: futureDate(20), quantity_available: 5, status: "published", service_category_id: sgCategory,
      created_at: iso(2), updated_at: iso(2),
    },
    {
      id: ids.offers[4], professional_id: sg.id, title: "Kit de conectividad",
      description: "Producto agotado de prueba para validar el estado, los filtros y la administraci\u00f3n de inventario.",
      offer_type: "product", service_label: "Redes e internet", image_urls: ["/images/demo/sg-solutions.png"],
      price_now: 45000, price_before: 52000, currency: "CRC", price_unit: "total", location_label: "Todo Costa Rica",
      valid_until: pastDate(1), quantity_available: 0, status: "sold_out", service_category_id: sgCategory,
      created_at: iso(15), updated_at: iso(1),
    },
  ];
  await must("seed offers", supabase.from("professional_offers").insert(offers));

  const applicationRows = [
    [ids.applications[0], ids.jobs[0], candidates[0], "submitted", 2],
    [ids.applications[1], ids.jobs[0], candidates[1], "reviewing", 3],
    [ids.applications[2], ids.jobs[0], candidates[2], "shortlisted", 4],
    [ids.applications[3], ids.jobs[1], candidates[3], "rejected", 5],
    [ids.applications[4], ids.jobs[3], candidates[4], "hired", 12],
    [ids.applications[5], ids.jobs[4], { profile_id: isaac.id, profiles: isaac }, "withdrawn", 1],
  ].map(([id, jobId, candidate, status, daysAgo], index) => ({
    id,
    job_id: jobId,
    applicant_id: candidate.profile_id,
    cover_letter: `Postulaci\u00f3n sint\u00e9tica ${index + 1} para validar el flujo completo de empleos en test.`,
    phone: `+506 8800 00${index + 10}`,
    resume_url: index === 0 ? "job-applications/regression/CV-regresion.pdf" : null,
    portfolio_url: index % 2 === 0 ? "https://example.com/portafolio-regresion" : null,
    applicant_email: candidate.profiles?.email || `regression-${index + 1}@example.com`,
    status,
    created_at: iso(daysAgo),
    updated_at: iso(Math.max(0, daysAgo - 1)),
  }));
  await must("seed job applications", supabase.from("job_applications").insert(applicationRows));

  await must(
    "seed saved marketplace items",
    supabase.from("saved_items").insert([
      {
        user_id: isaac.id, item_type: "job", item_id: ids.jobs[4], created_at: iso(1),
        snapshot: {
          title: jobs[4].title, employer_name: "SG Solutions", location_label: jobs[4].location_label,
          salary: "\u20a1500 000 - \u20a1750 000 por mes", employer_avatar_url: "/test-professionals/sg-solutions.png",
        },
      },
      {
        user_id: isaac.id, item_type: "offer", item_id: ids.offers[3], created_at: iso(1),
        snapshot: {
          title: offers[3].title, professional_name: "SG Solutions", service_label: offers[3].service_label,
          price: "\u20a1120 000", image_url: offers[3].image_urls[0],
        },
      },
      {
        user_id: candidates[0].profile_id, item_type: "job", item_id: ids.jobs[0], created_at: iso(2),
        snapshot: {
          title: jobs[0].title, employer_name: "ContrataCR", location_label: jobs[0].location_label,
          salary: "\u20a1450 000 - \u20a1650 000 por mes", employer_avatar_url: isaac.avatar_url,
        },
      },
      {
        user_id: candidates[0].profile_id, item_type: "offer", item_id: ids.offers[0], created_at: iso(2),
        snapshot: {
          title: offers[0].title, professional_name: "ContrataCR", service_label: offers[0].service_label,
          price: "\u20a1185 000", image_url: offers[0].image_urls[0],
        },
      },
    ]),
  );

  const tickets = [
    {
      id: ids.tickets[0], user_id: isaac.id, name: isaac.full_name, email: isaac.email,
      subject: "Consulta de perfil profesional", message: "Necesito confirmar que mi cobertura se muestra correctamente.",
      topic: "profile", status: "open", last_reply_at: iso(2), last_reply_role: "user", created_at: iso(3),
      user_confirmed: false, created_app_environment: SEED, created_supabase_project_ref: TEST_SUPABASE_REF,
    },
    {
      id: ids.tickets[1], user_id: isaac.id, name: isaac.full_name, email: isaac.email,
      subject: "Problema t\u00e9cnico en la plataforma", message: "Caso en progreso para validar el hilo y los estados de soporte.",
      topic: "technical", status: "in_progress", last_reply_at: iso(1), last_reply_role: "admin", created_at: iso(6),
      user_confirmed: false, created_app_environment: SEED, created_supabase_project_ref: TEST_SUPABASE_REF,
    },
    {
      id: ids.tickets[2], user_id: isaac.id, name: isaac.full_name, email: isaac.email,
      subject: "Consulta resuelta", message: "Caso resuelto para validar el historial de soporte.",
      topic: "account", status: "resolved", last_reply_at: iso(4), last_reply_role: "admin", created_at: iso(9),
      created_app_environment: SEED, created_supabase_project_ref: TEST_SUPABASE_REF, user_confirmed: true,
    },
  ];
  await must("seed support tickets", supabase.from("support_tickets").insert(tickets));
  await must(
    "seed support messages",
    supabase.from("support_ticket_messages").insert([
      { ticket_id: ids.tickets[0], sender_role: "user", sender_id: isaac.id, sender_name: isaac.full_name, body: tickets[0].message, created_at: iso(3) },
      { ticket_id: ids.tickets[1], sender_role: "user", sender_id: isaac.id, sender_name: isaac.full_name, body: tickets[1].message, created_at: iso(6) },
      { ticket_id: ids.tickets[1], sender_role: "admin", sender_id: null, sender_name: "Soporte ContrataCR", body: "Estamos revisando el caso y te avisaremos por este mismo hilo.", created_at: iso(1) },
      { ticket_id: ids.tickets[2], sender_role: "user", sender_id: isaac.id, sender_name: isaac.full_name, body: tickets[2].message, created_at: iso(9) },
      { ticket_id: ids.tickets[2], sender_role: "admin", sender_id: null, sender_name: "Soporte ContrataCR", body: "El caso qued\u00f3 resuelto. Gracias por confirmar.", created_at: iso(4) },
    ]),
  );

  const regressionNotifications = [
      {
        user_id: isaac.id, type: "support_reply", title: "Nueva respuesta de soporte",
        message: "Soporte respondi\u00f3 tu caso de prueba.", read: false, created_at: iso(1),
        data: { regressionSeed: SEED, link: `/soporte/${ids.tickets[1]}`, ticket_id: ids.tickets[1] },
      },
      {
        user_id: isaac.id, type: "followed_professional_activity", title: "Nueva oferta de SG Solutions",
        message: "SG Solutions public\u00f3 una oferta de instalaci\u00f3n de red empresarial.", read: false, created_at: iso(2),
        data: { regressionSeed: SEED, link: `/ofertas/${ids.offers[3]}`, offer_id: ids.offers[3], activity_type: "offer" },
      },
      {
        user_id: isaac.id, type: "job_application_status", title: "Postulaci\u00f3n actualizada",
        message: "Tu postulaci\u00f3n de prueba fue retirada.", read: true, created_at: iso(3),
        data: { regressionSeed: SEED, link: `/empleos/${ids.jobs[4]}`, job_id: ids.jobs[4], application_id: ids.applications[5], status: "withdrawn" },
      },
      {
        user_id: isaac.id, type: "verification_approved", title: "Identidad verificada",
        message: "Tu verificaci\u00f3n est\u00e1 activa.", read: true, created_at: iso(7),
        data: { regressionSeed: SEED, link: "/dashboard/profesional?tab=profile&section=verification" },
      },
    ];
  for (const notification of regressionNotifications) {
    await must(
      `seed regression notification ${notification.type}`,
      supabase.from("notifications").insert(notification),
    );
  }

  const [jobCount, offerCount, applicationCount, savedCount, ticketCount] = await Promise.all([
    must("count jobs", supabase.from("job_posts").select("id", { count: "exact", head: true }).in("id", ids.jobs)),
    must("count offers", supabase.from("professional_offers").select("id", { count: "exact", head: true }).in("id", ids.offers)),
    must("count applications", supabase.from("job_applications").select("id", { count: "exact", head: true }).in("id", ids.applications)),
    must("count saved items", supabase.from("saved_items").select("id", { count: "exact", head: true }).in("item_id", [...ids.jobs, ...ids.offers])),
    must("count tickets", supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("id", ids.tickets)),
  ]);

  console.log("Full regression marketplace seed completed on test.");
  console.log(JSON.stringify({
    seed: SEED,
    isaacProfileId: isaac.id,
    sgProfessionalId: sg.id,
    jobs: jobCount?.length ?? ids.jobs.length,
    offers: offerCount?.length ?? ids.offers.length,
    applications: applicationCount?.length ?? ids.applications.length,
    savedItems: savedCount?.length ?? 4,
    supportTickets: ticketCount?.length ?? ids.tickets.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
