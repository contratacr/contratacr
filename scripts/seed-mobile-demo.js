const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const TEST_SUPABASE_REF = "sodegkfjjrdkbohycqyq";
const envFile = process.env.DEMO_ENV_FILE || ".env.test";

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
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
  throw new Error(`Refusing to seed Supabase project ${supabaseRef}; expected test project ${TEST_SUPABASE_REF}.`);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in the test environment file.");
}

const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function findMirroredProfessionalByBusinessName(businessName) {
  const professionals = await must(
    `find ${businessName} professionals`,
    supabase
      .from("professionals")
      .select("id,slug,profile_id,category_id,provincia_id,canton_id,lat,lng")
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

const demo = "mobile-test-demo";
const appUrl = process.env.DEMO_APP_URL || "https://test.contratacr.com";
const hiddenDemoSlugs = new Set(["test-contratacr-1n0wba32", "test-contratacr-web"]);
const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (daysAgo = 0, h = 9) => {
  const date = new Date(now - daysAgo * day);
  date.setHours(h, 0, 0, 0);
  return date.toISOString();
};

const repairMojibake = (value = "") => {
  let repaired = String(value);
  for (let pass = 0; pass < 2 && /[\u00c3\u00c2]/.test(repaired); pass += 1) {
    const candidate = Buffer.from(repaired, "latin1").toString("utf8");
    const currentMarkers = (repaired.match(/[\u00c3\u00c2\ufffd]/g) || []).length;
    const candidateMarkers = (candidate.match(/[\u00c3\u00c2\ufffd]/g) || []).length;
    if (candidateMarkers >= currentMarkers) break;
    repaired = candidate;
  }
  return repaired;
};

const fixAccentArtifacts = (value = "") =>
  repairMojibake(value)
    .replace(/conexi\?n/g, "conexi\u00f3n")
    .replace(/d\?a/g, "d\u00eda")
    .replace(/P\?rez/g, "P\u00e9rez")
    .replace(/t\?cnico/g, "t\u00e9cnico")
    .replace(/instalaci\?n/g, "instalaci\u00f3n")
    .replace(/configuraci\?n/g, "configuraci\u00f3n")
    .replace(/G\?mez/g, "G\u00f3mez")
    .replace(/Atenci\?n/g, "Atenci\u00f3n")
    .replace(/se\?al/g, "se\u00f1al")
    .replace(/ten\?amos/g, "ten\u00edamos")
    .replace(/diagn\?stico/g, "diagn\u00f3stico")
    .replace(/r\?pida/g, "r\u00e1pida")
    .replace(/Andr\?s/g, "Andr\u00e9s")
    .replace(/qued\?/g, "qued\u00f3")
    .replace(/c\?maras/g, "c\u00e1maras")
    .replace(/despu\?s/g, "despu\u00e9s")
    .replace(/opci\?n/g, "opci\u00f3n")
    .replace(/\bSolis\b/g, "Sol\u00eds")
    .replace(/\bAndres\b/g, "Andr\u00e9s");

const avatars = {
  "test-arqui-linea": "https://randomuser.me/api/portraits/men/32.jpg",
  "test-auto-tapiceria-cr": "https://randomuser.me/api/portraits/men/45.jpg",
  "test-compu-atencion": "https://randomuser.me/api/portraits/women/44.jpg",
  "test-conta-clara": "https://randomuser.me/api/portraits/women/65.jpg",
  "test-contratacr-1n0wba32": `${appUrl}/android-chrome-512x512.png`,
  "test-contratacr-web": `${appUrl}/android-chrome-512x512.png`,
  "test-data-guard": "https://randomuser.me/api/portraits/men/75.jpg",
  "test-electro-soluciones": "https://randomuser.me/api/portraits/men/57.jpg",
  "test-english-coach": "https://randomuser.me/api/portraits/men/17.jpg",
  "test-eventos-nova": "https://randomuser.me/api/portraits/women/22.jpg",
  "test-foto-eventos": "https://randomuser.me/api/portraits/men/22.jpg",
  "test-impulso-digital": "https://randomuser.me/api/portraits/women/31.jpg",
  "test-jardin-vivo": "https://randomuser.me/api/portraits/men/41.jpg",
  "test-limpieza-total": "https://randomuser.me/api/portraits/women/50.jpg",
  "test-mecanica-movil": "https://randomuser.me/api/portraits/men/68.jpg",
  "test-muebles-barrantes": "https://randomuser.me/api/portraits/men/61.jpg",
  "test-pc-rapido": "https://randomuser.me/api/portraits/women/58.jpg",
  "test-plomeria-omega": "https://randomuser.me/api/portraits/men/52.jpg",
  "test-plomeros-del-valle": "https://randomuser.me/api/portraits/men/36.jpg",
  "test-redes-central": "https://randomuser.me/api/portraits/men/28.jpg",
  "test-securetek": "https://randomuser.me/api/portraits/women/39.jpg",
  "test-sg-solutions": `${appUrl}/test-professionals/sg-solutions.png`,
  "test-soporte-empresarial": "https://randomuser.me/api/portraits/men/46.jpg",
  "test-vet-en-casa": "https://randomuser.me/api/portraits/women/71.jpg",
  "test-web-norte": "https://randomuser.me/api/portraits/women/34.jpg",
};

const profileNames = {
  "test-arqui-linea": "Federico Salas",
  "test-auto-tapiceria-cr": "Gerardo Solís",
  "test-compu-atencion": "Laura Vargas",
  "test-conta-clara": "Paola Jiménez",
  "test-contratacr-1n0wba32": "Demo oculto",
  "test-contratacr-web": "Demo oculto",
  "test-data-guard": "Esteban Rivas",
  "test-electro-soluciones": "Carlos Pérez",
  "test-english-coach": "Jafeth Pérez Umaña",
  "test-eventos-nova": "Sofía Calderón",
  "test-foto-eventos": "Luis Méndez",
  "test-impulso-digital": "Valeria Castro",
  "test-jardin-vivo": "Roberto Arias",
  "test-limpieza-total": "Ana Chaves",
  "test-mecanica-movil": "Daniel Gómez",
  "test-muebles-barrantes": "Carlos Barrantes Chavarria",
  "test-pc-rapido": "Andrea Campos",
  "test-plomeria-omega": "Manuel Alfaro",
  "test-plomeros-del-valle": "José Retana",
  "test-redes-central": "Andrés Mora",
  "test-securetek": "Mariana Rojas",
  "test-sg-solutions": "SG Solutions",
  "test-soporte-empresarial": "Miguel Herrera",
  "test-vet-en-casa": "Dra. Karla León",
  "test-web-norte": "Natalia Brenes",
};

const proFix = {
  "test-arqui-linea": ["Arqui Línea", "Arquitectura", "Diseño arquitectónico, planos constructivos y remodelaciones residenciales."],
  "test-auto-tapiceria-cr": ["Auto Tapicería CR", "Tapicería automotriz", "Restauración de asientos, cielos y detalles interiores para vehículos."],
  "test-compu-atencion": ["Compu Atención", "Reparación de computadoras", "Diagnóstico, mantenimiento y reparación de computadoras para hogar y oficina."],
  "test-conta-clara": ["Conta Clara", "Contabilidad", "Contabilidad mensual, declaraciones y orden financiero para pymes."],
  "test-contratacr-1n0wba32": ["Demo oculto", "Ciberseguridad", "Perfil demo oculto para limpieza del ambiente de pruebas."],
  "test-data-guard": ["Data Guard CR", "Ciberseguridad", "Protección de cuentas, respaldo de información y diagnóstico de riesgos."],
  "test-electro-soluciones": ["Electro Soluciones", "Electricidad", "Instalaciones, reparaciones eléctricas y mantenimiento residencial."],
  "test-english-coach": ["English Coach CR", "Clases de inglés", "Clases de inglés conversacional y apoyo para entrevistas o trabajo."],
  "test-eventos-nova": ["Eventos Nova", "Organización de eventos", "Planificación, decoración y coordinación para eventos sociales y corporativos."],
  "test-foto-eventos": ["Foto Eventos CR", "Fotografía", "Fotografía profesional para eventos, productos y negocios locales."],
  "test-impulso-digital": ["Impulso Digital CR", "Marketing digital", "Campañas, redes sociales y contenido para negocios que quieren crecer."],
  "test-jardin-vivo": ["Jardín Vivo", "Jardinería", "Mantenimiento de jardines, poda, diseño verde y limpieza exterior."],
  "test-limpieza-total": ["Limpieza Total CR", "Limpieza", "Limpieza profunda, mantenimiento y apoyo para casas, oficinas y apartamentos."],
  "test-mecanica-movil": ["Mecánica Móvil 506", "Mecánica", "Servicio mecánico móvil, diagnóstico y mantenimiento preventivo."],
  "test-muebles-barrantes": ["Muebles Barrantes", "Tapicería de muebles", "Tapicería de muebles, restauración y fabricación de piezas a medida."],
  "test-pc-rapido": ["PC Rápido", "Reparación de computadoras", "Soporte técnico, limpieza interna, formateo y recuperación básica de equipos."],
  "test-plomeria-omega": ["Plomería Omega", "Plomería", "Reparación de fugas, instalación de grifería y mantenimiento de tuberías."],
  "test-plomeros-del-valle": ["Plomeros del Valle", "Plomería", "Plomería residencial con atención rápida en Atenas y alrededores."],
  "test-redes-central": ["Redes Central CR", "Redes e internet", "Instalación de redes, WiFi empresarial y cableado estructurado."],
  "test-securetek": ["SecureTek Costa Rica", "Ciberseguridad", "Evaluación de seguridad, configuración de accesos y protección de datos."],
  "test-sg-solutions": ["SG Solutions", "Redes e internet", "Soporte técnico, redes, internet y mantenimiento para hogares y empresas."],
  "test-soporte-empresarial": ["Soporte Empresarial CR", "Redes e internet", "Soporte técnico y redes para oficinas, comercios y equipos de trabajo."],
  "test-vet-en-casa": ["Vet en Casa", "Veterinaria", "Atención veterinaria a domicilio, vacunación y orientación preventiva."],
  "test-web-norte": ["Web Norte", "Desarrollo web", "Sitios web, landing pages y soporte digital para pequeñas empresas."],
};

const demoLocations = {
  "test-arqui-linea": ["Escazu, San Jose", 9.9189, -84.1397],
  "test-auto-tapiceria-cr": ["Heredia, Heredia", 9.9981, -84.1189],
  "test-compu-atencion": ["San Jose, San Jose", 9.9333, -84.0833],
  "test-conta-clara": ["Cartago, Cartago", 9.8644, -83.9194],
  "test-contratacr-1n0wba32": ["Atenas, Alajuela", 9.9796, -84.3781, "al", "al-at"],
  "test-data-guard": ["Sabana, San Jose", 9.9369, -84.1079],
  "test-electro-soluciones": ["Alajuela, Alajuela", 10.0163, -84.2116],
  "test-english-coach": ["Heredia, Heredia", 9.9988, -84.1167],
  "test-eventos-nova": ["San Pedro, San Jose", 9.9347, -84.0507],
  "test-foto-eventos": ["Curridabat, San Jose", 9.9147, -84.0345],
  "test-impulso-digital": ["Rohrmoser, San Jose", 9.9462, -84.1244],
  "test-jardin-vivo": ["Grecia, Alajuela", 10.0738, -84.3111],
  "test-limpieza-total": ["Atenas, Alajuela", 9.9804, -84.3792, "al", "al-at"],
  "test-mecanica-movil": ["Alajuela, Alajuela", 10.0103, -84.2170],
  "test-muebles-barrantes": ["Atenas, Alajuela", 9.9820, -84.3790, "al", "al-at"],
  "test-pc-rapido": ["San Jose, San Jose", 9.9339, -84.0900],
  "test-plomeria-omega": ["Alajuela, Alajuela", 10.0168, -84.2114],
  "test-plomeros-del-valle": ["Atenas, Alajuela", 9.9803, -84.3798, "al", "al-at"],
  "test-redes-central": ["San Jose, San Jose", 9.9342, -84.0837],
  "test-securetek": ["San Jose, San Jose", 9.9356, -84.1010],
  "test-sg-solutions": ["Atenas, Alajuela", 9.9798, -84.3812, "al", "al-at"],
  "test-soporte-empresarial": ["San Jose, San Jose", 9.9270, -84.0890],
  "test-vet-en-casa": ["Heredia, Heredia", 10.0030, -84.1160],
  "test-web-norte": ["San Carlos, Alajuela", 10.3270, -84.4300],
};

const isaacLocation = ["Atenas, Alajuela", 9.9796, -84.3781, "al", "al-at"];
const contratacrWebService = {
  id: "contratacr-desarrollo-web",
  name: "Desarrollo web",
  category: "desarrollo_web",
  active: true,
  price: "Consultar precio",
  priceType: "a_convenir",
  modalities: ["video"],
  startedAt: "2025-01",
  imageUrl: `${appUrl}/og-image.png`,
  description: [
    "Dise\u00f1o y desarrollo sitios web, landing pages, paneles internos y aplicaciones web completas para negocios que necesitan vender, atender mejor y operar con m\u00e1s orden.",
    "Puedo ayudarle desde una p\u00e1gina comercial sencilla hasta una plataforma con usuarios, perfiles, formularios, reservas, mensajes, notificaciones, mapas, pagos, anal\u00edtica, panel administrativo e integraciones con servicios externos.",
    "El trabajo incluye definici\u00f3n del flujo, estructura de contenido, dise\u00f1o responsive, desarrollo, pruebas en celular, configuraci\u00f3n de dominio, despliegue, medici\u00f3n b\u00e1sica y soporte para dejar el proyecto listo para usarse.",
    "Cada entrega se piensa primero para mobile: textos claros, llamadas a la acci\u00f3n visibles, carga r\u00e1pida, formularios simples y una experiencia que no dependa de que el cliente est\u00e9 en computadora."
  ].join("\n\n"),
};
const contratacrBio = [
  "Soy Isaac S\u00e1nchez Monge, fundador de ContrataCR y desarrollador web. Trabajo creando productos digitales pr\u00e1cticos para negocios reales: sitios que explican bien lo que se vende, aplicaciones que ordenan procesos y paneles que reducen trabajo manual.",
  "Mi enfoque mezcla dise\u00f1o, programaci\u00f3n y criterio comercial. Antes de escribir c\u00f3digo, ordeno el objetivo: qu\u00e9 necesita hacer el usuario, qu\u00e9 datos debe capturar el negocio y cu\u00e1l es la acci\u00f3n principal que debe quedar clara en celular.",
  "He construido flujos con autenticaci\u00f3n, perfiles p\u00fablicos, b\u00fasqueda, mapas, disponibilidad, solicitudes, propuestas, mensajer\u00eda, soporte, notificaciones, anal\u00edtica, integraciones con Supabase, almacenamiento de archivos y asistentes con IA.",
  "ContrataCR es el ejemplo m\u00e1s completo de mi trabajo: una plataforma para Costa Rica con experiencia web, mobile, iOS y Android, pensada para conectar clientes con profesionales y mostrar informaci\u00f3n clara antes de iniciar una conversaci\u00f3n."
].join("\n\n");
const contratacrPortfolioItems = [
  {
    id: "contratacr-buscador-perfiles",
    serviceId: contratacrWebService.id,
    profession: "desarrollo_web",
    title: "Buscador y perfiles profesionales de ContrataCR",
    description: "Dise\u00f1o y desarrollo del buscador de profesionales con filtros, mapa, cards de resultados, horarios visibles, perfiles p\u00fablicos, rese\u00f1as, casos de \u00e9xito y llamadas a la acci\u00f3n para coordinar desde la misma plataforma.",
    recipient: "ContrataCR",
    date: "2026",
    photos: [`${appUrl}/og-image.png`, `${appUrl}/web-app-manifest-flat-logo-v3-512x512.png`],
    likes: 18
  },
  {
    id: "contratacr-mobile-ios-android",
    serviceId: contratacrWebService.id,
    profession: "desarrollo_web",
    title: "Experiencia mobile, iOS y Android",
    description: "Adaptaci\u00f3n de ContrataCR para uso mobile con navegaci\u00f3n inferior, paneles que respetan safe areas, pantallas full screen, asistente IA optimizado para celular y vistas listas para capturas de App Store, Play Store y publicidad.",
    recipient: "ContrataCR mobile",
    date: "2026",
    photos: [`${appUrl}/apple-touch-icon-flat-logo-v3.png`, `${appUrl}/android-chrome-512x512.png`],
    likes: 12
  },
  {
    id: "contratacr-mensajes-soporte",
    serviceId: contratacrWebService.id,
    profession: "desarrollo_web",
    title: "Mensajes, soporte y conversaciones internas",
    description: "Construcci\u00f3n de mensajer\u00eda interna, conversaciones por contexto, soporte tipo chat, estados de no le\u00eddo, archivado y composer mobile inspirado en patrones modernos para que el usuario pueda coordinar sin salir de ContrataCR.",
    recipient: "ContrataCR",
    date: "2026",
    photos: [`${appUrl}/logo-wordmark-transparent.png`, `${appUrl}/brand/ai-assistant-robot.png`],
    likes: 9
  },
  {
    id: "contratacr-panel-operativo",
    serviceId: contratacrWebService.id,
    profession: "desarrollo_web",
    title: "Panel profesional y flujo de solicitudes",
    description: "Desarrollo de paneles para clientes y profesionales con solicitudes recibidas, oportunidades, propuestas, disponibilidad, notificaciones y datos demo reales para validar el producto en escenarios de captura y uso comercial.",
    recipient: "ContrataCR operaciones",
    date: "2026",
    photos: [`${appUrl}/logo-mark-transparent.png`, `${appUrl}/logo-wordmark-transparent.png`],
    likes: 11
  }
];
const contratacrPortfolioUrls = contratacrPortfolioItems.flatMap((item) => item.photos).slice(0, 5);
const sgService = {
  id: "redes_e_internet",
  name: "Redes e internet",
  category: "redes_e_internet",
  active: true,
  price: "Consultar precio",
  priceType: "a_convenir",
  modalities: ["presencial", "video"],
  startedAt: "2018-01",
  imageUrl: `${appUrl}/test-professionals/sg-solutions.png`,
  description: "Instalaci\u00f3n, diagn\u00f3stico y mantenimiento de redes, WiFi, cableado estructurado y conectividad para hogares, comercios y oficinas.",
};
const sgPortfolioItems = [
  {
    id: "sg-red-empresarial",
    serviceId: sgService.id,
    profession: "redes_e_internet",
    title: "Red empresarial y cobertura WiFi",
    description: "Diagn\u00f3stico, cableado y configuraci\u00f3n de una red estable para una oficina en Atenas.",
    recipient: "Cliente empresarial de prueba",
    date: "2026",
    photos: [`${appUrl}/test-professionals/sg-solutions.png`],
    likes: 8,
  },
];

function demoPlace(slug, professional, location = demoLocations[slug] || isaacLocation) {
  const [name, lat, lng, provinciaIdOverride, cantonIdOverride] = location;
  const provinciaId = provinciaIdOverride || professional.provincia_id || "al";
  const cantonId = cantonIdOverride || professional.canton_id || (provinciaId === "al" ? "al-at" : null);
  const workplace = {
    id: `${slug}-main-workplace`,
    name,
    address: `${name}, Costa Rica`,
    lat,
    lng,
    provinciaId,
  };
  if (cantonId) workplace.cantonId = cantonId;

  return {
    provinciaId,
    cantonId,
    lat,
    lng,
    workplaces: [workplace],
  };
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  const isaac = await must("isaac profile", supabase.from("profiles").select("*").eq("email", "isaacsanchezmonge@gmail.com").single());
  const [isaacPro] = await must("isaac professional", supabase.from("professionals").select("*").eq("profile_id", isaac.id).limit(1));
  if (!isaacPro) throw new Error("No professional profile found for Isaac");
  const isaacPlace = demoPlace("contratacr", isaacPro, isaacLocation);

  await must("isaac professional demo location", supabase.from("professionals").update({
    business_name: "ContrataCR",
    bio: contratacrBio,
    services: [contratacrWebService],
    professions: ["desarrollo_web"],
    category_id: "desarrollo_web",
    portfolio_items: contratacrPortfolioItems,
    portfolio_urls: contratacrPortfolioUrls,
    languages: ["es", "en"],
    contact_email: isaac.email,
    whatsapp: "+506 8888 8888",
    call_phone: "+506 8888 8888",
    social_links: {
      website: "https://contratacr.com",
      linkedin: "https://www.linkedin.com/company/contratacr",
      instagram: "https://www.instagram.com/contratacr",
    },
    certifications: [
      { id: "contratacr-full-stack", name: "Desarrollo web full stack", institution: "ContrataCR Labs", year: 2026, profession: "desarrollo_web" },
    ],
    years_experience: 1,
    rating_avg: 5,
    review_count: 5,
    videoconsulta: true,
    availability_public: true,
    contact_preference: "ambas",
    allow_phone_call: true,
    provincia_id: isaacPlace.provinciaId,
    canton_id: isaacPlace.cantonId,
    lat: isaacPlace.lat,
    lng: isaacPlace.lng,
    workplaces: isaacPlace.workplaces.map((workplace) => ({
      ...workplace,
      id: "contratacr-atenas-alajuela",
    })),
    search_provincias: [isaacPlace.provinciaId],
    search_cantones: isaacPlace.cantonId ? [isaacPlace.cantonId] : [],
    coverage_provincias: [isaacPlace.provinciaId],
    coverage_country: false,
    updated_at: new Date().toISOString(),
    created_app_environment: demo,
  }).eq("id", isaacPro.id));

  const pros = await must("demo professionals", supabase.from("professionals").select("id,slug,profile_id,category_id,provincia_id,canton_id,lat,lng").in("slug", Object.keys(proFix)));
  const bySlug = new Map(pros.map((p) => [p.slug, p]));
  const sgSolutions = await findMirroredProfessionalByBusinessName("SG Solutions");
  if (sgSolutions) bySlug.set("test-sg-solutions", sgSolutions);

  for (const [slug, [business, service, bio]] of Object.entries(proFix)) {
    const professional = bySlug.get(slug);
    if (!professional) continue;
    const hidden = hiddenDemoSlugs.has(slug);
    const repairedBusiness = fixAccentArtifacts(business);
    const repairedService = fixAccentArtifacts(service);
    const repairedBio = fixAccentArtifacts(bio);
    const isSgSolutions = slug === "test-sg-solutions";
    const profileUpdate = {
      avatar_url: avatars[slug],
      onboarding_completed: true,
      is_provider: true,
      is_disabled: hidden,
      updated_at: new Date().toISOString(),
      created_app_environment: hidden ? `${demo}-hidden` : demo,
    };
    if (!isSgSolutions) profileUpdate.full_name = fixAccentArtifacts(profileNames[slug]);
    await must(`profile ${slug}`, supabase.from("profiles").update(profileUpdate).eq("id", professional.profile_id));

    const rating = slug.includes("contratacr-1n0wba32") ? 4.9 : 4.7 + (slug.length % 4) * 0.1;
    const place = demoPlace(slug, professional);
    await must(`professional ${slug}`, supabase.from("professionals").update({
      business_name: repairedBusiness,
      bio: repairedBio,
      services: isSgSolutions
        ? [sgService]
        : [{
            id: professional.category_id || repairedService.toLowerCase().replace(/\s+/g, "_"),
            name: repairedService,
            active: true,
            price: "Consultar precio",
            priceType: "a_convenir",
            modalities: ["presencial"],
            startedAt: "2020-01",
            description: repairedBio,
          }],
      professions: [repairedService],
      portfolio_items: isSgSolutions ? sgPortfolioItems : [],
      portfolio_urls: isSgSolutions ? sgPortfolioItems[0].photos : [],
      languages: isSgSolutions ? ["es", "en"] : ["es"],
      contact_email: isSgSolutions ? "sg-solutions-regression@example.com" : null,
      social_links: isSgSolutions
        ? { website: "https://example.com/sg-solutions", instagram: "https://www.instagram.com/sg.solutions.test" }
        : {},
      certifications: isSgSolutions
        ? [{ id: "sg-redes", name: "Redes y cableado estructurado", institution: "Fixture de regresi\u00f3n", year: 2025, profession: "redes_e_internet" }]
        : [],
      is_verified: !hidden,
      verification_status: hidden ? "rejected" : "verified",
      is_available: !hidden,
      is_banned: hidden,
      availability_public: !hidden,
      allow_phone_call: !hidden,
      years_experience: 5 + (slug.length % 12),
      rating_avg: hidden ? 0 : Number(rating.toFixed(1)),
      review_count: hidden ? 0 : 2 + (slug.length % 6),
      whatsapp: "+506 2446 7846",
      call_phone: "+506 2446 7846",
      provincia_id: place.provinciaId,
      canton_id: place.cantonId,
      lat: place.lat,
      lng: place.lng,
      workplaces: place.workplaces,
      search_provincias: [place.provinciaId],
      search_cantones: place.cantonId ? [place.cantonId] : [],
      coverage_provincias: [place.provinciaId],
      coverage_country: false,
      updated_at: new Date().toISOString(),
      created_app_environment: hidden ? `${demo}-hidden` : demo,
    }).eq("id", professional.id));
  }

  const allProfessionals = await must("cleanup candidate professionals", supabase.from("professionals").select("id,slug,business_name,bio,profiles(full_name,email)").limit(1000));
  const badDemoPattern = /(?:^|\b)(e2e|test contrata|test-contrata|contratacr-test|contratacr seguridad|demo oculto)(?:\b|$)|\?/i;
  const badProfessionalIds = allProfessionals
    .filter((row) => {
      const email = row.profiles?.email || "";
      if (email === "isaacsanchezmonge@gmail.com") return false;
      const text = `${row.slug || ""} ${row.business_name || ""} ${row.bio || ""} ${row.profiles?.full_name || ""}`;
      return hiddenDemoSlugs.has(row.slug) || badDemoPattern.test(text);
    })
    .map((row) => row.id);
  if (badProfessionalIds.length) {
    await must("hide fake/test professionals", supabase.from("professionals").update({
      is_available: false,
      is_banned: true,
      is_verified: false,
      verification_status: "rejected",
      availability_public: false,
      updated_at: new Date().toISOString(),
    }).in("id", badProfessionalIds));
  }

  const demoNotifs = await must("select demo notifications", supabase.from("notifications").select("id,data").eq("user_id", isaac.id).limit(500));
  const demoNotifIds = demoNotifs.filter((n) => n.data?.demoSeed === demo).map((n) => n.id);
  if (demoNotifIds.length) await must("delete demo notifications", supabase.from("notifications").delete().in("id", demoNotifIds));

  const demoConvs = await must("select demo conversations", supabase.from("direct_conversations").select("id").or(`client_id.eq.${isaac.id},professional_profile_id.eq.${isaac.id}`).ilike("subject", "Demo:%"));
  const convIds = demoConvs.map((c) => c.id);
  if (convIds.length) {
    await must("delete demo messages", supabase.from("direct_messages").delete().in("conversation_id", convIds));
    await must("delete demo conversations", supabase.from("direct_conversations").delete().in("id", convIds));
  }

  await supabase.from("bookings").delete().eq("client_id", isaac.id).eq("created_app_environment", demo);
  await supabase.from("bookings").delete().eq("professional_id", isaacPro.id).eq("created_app_environment", demo);
  await supabase.from("projects").delete().eq("client_id", isaac.id).eq("created_app_environment", demo);
  await supabase.from("reviews").delete().eq("client_id", isaac.id).eq("created_app_environment", demo);
  await supabase.from("reviews").delete().eq("professional_id", isaacPro.id).eq("created_app_environment", demo);

  const demoReviewRows = await must(
    "select demo reviews for cleanup",
    supabase
      .from("reviews")
      .select("id,comment,job_title,client_name_snapshot,created_app_environment,created_source_host")
      .or(`created_app_environment.eq.${demo},created_source_host.eq.${appUrl},created_source_host.eq.mobile-test-seed`)
      .limit(1000),
  );
  const fakeReviewIds = demoReviewRows
    .filter((review) => /E2E|Test Contrata|test contrata|ContrataCR Seguridad|Demo oculto/i.test(`${review.client_name_snapshot || ""} ${review.comment || ""} ${review.job_title || ""}`))
    .map((review) => review.id);
  if (fakeReviewIds.length) {
    await must("delete fake demo reviews", supabase.from("reviews").delete().in("id", fakeReviewIds));
  }
  for (const review of demoReviewRows.filter((row) => !fakeReviewIds.includes(row.id))) {
    const comment = fixAccentArtifacts(review.comment || "");
    const jobTitle = fixAccentArtifacts(review.job_title || "");
    const clientName = fixAccentArtifacts(review.client_name_snapshot || "");
    if (comment !== (review.comment || "") || jobTitle !== (review.job_title || "") || clientName !== (review.client_name_snapshot || "")) {
      await must(`clean demo review ${review.id}`, supabase.from("reviews").update({
        comment,
        job_title: jobTitle,
        client_name_snapshot: clientName,
      }).eq("id", review.id));
    }
  }

  const saves = await must("select saved professionals", supabase.from("saved_professionals").select("id,snapshot").eq("client_id", isaac.id).limit(100));
  const saveIds = saves.filter((s) => s.snapshot?.demoSeed === demo).map((s) => s.id);
  if (saveIds.length) await must("delete saved professionals", supabase.from("saved_professionals").delete().in("id", saveIds));

  const demoProfessionalSlugs = ["test-sg-solutions", "test-plomeros-del-valle", "test-conta-clara", "test-limpieza-total", "test-web-norte", "test-redes-central", "test-muebles-barrantes", "test-vet-en-casa"];
  const demoPros = demoProfessionalSlugs
    .map((slug) => bySlug.get(slug))
    .filter(Boolean);
  const cat = Object.fromEntries(demoProfessionalSlugs.map((slug) => [slug, bySlug.get(slug)?.category_id]));
  if (demoPros.length) {
    await must("delete saved demo professionals", supabase.from("saved_professionals").delete().eq("client_id", isaac.id).in("professional_id", demoPros.map((p) => p.id)));
  }

  await must("insert saved professionals", supabase.from("saved_professionals").insert(demoPros.slice(0, 6).map((p, index) => ({
    client_id: isaac.id,
    professional_id: p.id,
    created_at: iso(index + 1),
    snapshot: { demoSeed: demo, source: "advertising-captures" },
  }))));

  const bookings = [
    ["test-sg-solutions", "Instalacion de red WiFi y mejora de cobertura en oficina", "confirmed", 1, "10:00", "SG Solutions"],
    ["test-plomeros-del-valle", "Revision de fuga en cocina y cambio de llave", "pending", 2, "14:00", "Plomeros del Valle"],
    ["test-limpieza-total", "Limpieza profunda de apartamento antes de entrega", "completed", 5, "08:00", "Limpieza Total CR"],
    ["test-conta-clara", "Asesoria para orden contable mensual", "pending", 4, "11:00", "Conta Clara"],
  ].map(([slug, desc, status, days, time, label]) => ({
    professional_id: bySlug.get(slug)?.id,
    client_id: isaac.id,
    category_id: cat[slug],
    service_description: desc,
    preferred_date: iso(-days),
    preferred_date_text: `En ${days} dias`,
    scheduled_date: new Date(now + days * day).toISOString().slice(0, 10),
    scheduled_time: time,
    status,
    client_name: isaac.full_name,
    client_email: isaac.email,
    client_phone: "+506 8616 2043",
    notes: `Demo para capturas: ${label}.`,
    created_at: iso(days + 1),
    updated_at: iso(days),
    created_app_environment: demo,
    created_source_host: "mobile-test-seed",
    created_supabase_project_ref: "sodegkfjjrdkbohycqyq",
  })).filter((booking) => booking.professional_id);
  const insertedBookings = await must("insert bookings", supabase.from("bookings").insert(bookings).select("*"));

  const clientProfiles = await must("demo client profiles", supabase.from("profiles").select("*").in("email", ["soporte@contratacr.com", "isanchezm421@gmail.com"]).limit(5));
  const clientA = clientProfiles[0] || isaac;
  await must("insert received bookings", supabase.from("bookings").insert([
    {
      professional_id: isaacPro.id,
      client_id: clientA.id,
      category_id: isaacPro.category_id,
      service_description: "Necesito una página web para mi negocio con formulario de contacto.",
      preferred_date: iso(-3),
      preferred_date_text: "Esta semana",
      scheduled_date: new Date(now + 3 * day).toISOString().slice(0, 10),
      scheduled_time: "09:00",
      status: "pending",
      client_name: "Cliente Demo",
      client_email: "cliente.demo@contratacr.com",
      client_phone: "+506 8888 8388",
      notes: "Quiero mostrar servicios, fotos y recibir mensajes.",
      created_at: iso(1),
      updated_at: iso(1),
      created_app_environment: demo,
      created_source_host: "mobile-test-seed",
    },
    {
      professional_id: isaacPro.id,
      client_id: clientA.id,
      category_id: isaacPro.category_id,
      service_description: "Landing page para campaña de Meta Ads.",
      preferred_date: iso(-7),
      preferred_date_text: "Próxima semana",
      scheduled_date: new Date(now + 7 * day).toISOString().slice(0, 10),
      scheduled_time: "15:00",
      status: "confirmed",
      client_name: "Mariana Rojas",
      client_email: "mariana.demo@contratacr.com",
      client_phone: "+506 7000 1200",
      notes: "Debe cargar rápido en celular.",
      created_at: iso(2),
      updated_at: iso(1),
      created_app_environment: demo,
      created_source_host: "mobile-test-seed",
    },
  ]));

  const projects = await must("insert projects", supabase.from("projects").insert([
    {
      client_id: isaac.id,
      category_id: cat["test-redes-central"],
      title: "Mejorar internet en oficina",
      description: "Necesito revisar cobertura WiFi, cableado y velocidad para 8 puestos de trabajo.",
      provincia_id: "al",
      canton_id: "al-at",
      budget_min: 120000,
      budget_max: 250000,
      timeline: "Esta semana",
      status: "open",
      client_name_snapshot: isaac.full_name,
      client_email_snapshot: isaac.email,
      client_phone_snapshot: "+506 8616 2043",
      created_at: iso(1),
      updated_at: iso(1),
      created_app_environment: demo,
      created_source_host: "mobile-test-seed",
    },
    {
      client_id: isaac.id,
      category_id: isaacPro.category_id,
      title: "Sitio web para emprendimiento",
      description: "Quiero una página moderna con servicios, WhatsApp, fotos y formulario de contacto.",
      provincia_id: "sj",
      canton_id: "sj-sj",
      budget_min: 180000,
      budget_max: 450000,
      timeline: "Este mes",
      status: "in_progress",
      accepted_professional_id: isaacPro.id,
      client_name_snapshot: isaac.full_name,
      client_email_snapshot: isaac.email,
      client_phone_snapshot: "+506 8616 2043",
      created_at: iso(3),
      updated_at: iso(1),
      created_app_environment: demo,
      created_source_host: "mobile-test-seed",
    },
    {
      client_id: isaac.id,
      category_id: cat["test-conta-clara"],
      title: "Ordenar contabilidad mensual",
      description: "Busco apoyo para declaraciones, facturacion y reportes mensuales.",
      provincia_id: "al",
      canton_id: "al-at",
      budget_min: 60000,
      budget_max: 150000,
      timeline: "Este mes",
      status: "open",
      client_name_snapshot: isaac.full_name,
      client_email_snapshot: isaac.email,
      client_phone_snapshot: "+506 8616 2043",
      created_at: iso(5),
      updated_at: iso(2),
      created_app_environment: demo,
      created_source_host: "mobile-test-seed",
    },
  ]).select("*"));

  async function conversation({ proSlug, subject, last, unread = 0, messages = [] }) {
    const professional = bySlug.get(proSlug);
    if (!professional) return null;
    const existing = await must(
      "select existing conversation",
      supabase
        .from("direct_conversations")
        .select("id")
        .eq("client_id", isaac.id)
        .eq("professional_id", professional.id)
        .is("booking_id", null)
        .is("project_id", null)
        .is("proposal_id", null)
        .maybeSingle(),
    );
    const conversationValues = {
      client_id: isaac.id,
      professional_id: professional.id,
      professional_profile_id: professional.profile_id,
      subject: `Demo: ${subject}`,
      status: "open",
      last_message: last,
      last_message_at: iso(0),
      last_sender_id: professional.profile_id,
      client_unread_count: unread,
      professional_unread_count: 0,
      created_at: iso(3),
      updated_at: iso(0),
    };
    const conv = existing
      ? await must(
          "update existing conversation",
          supabase
            .from("direct_conversations")
            .update(conversationValues)
            .eq("id", existing.id)
            .select("*")
            .single(),
        )
      : await must(
          "insert conversation",
          supabase.from("direct_conversations").insert(conversationValues).select("*").single(),
        );

    const messageIds = {
      "test-sg-solutions": [
        "b5100000-0000-4000-8000-000000000001",
        "b5100000-0000-4000-8000-000000000002",
        "b5100000-0000-4000-8000-000000000003",
      ],
      "test-plomeros-del-valle": [
        "b5200000-0000-4000-8000-000000000001",
        "b5200000-0000-4000-8000-000000000002",
      ],
      "test-conta-clara": [
        "b5300000-0000-4000-8000-000000000001",
        "b5300000-0000-4000-8000-000000000002",
      ],
    }[proSlug] || [];

    await must("upsert messages", supabase.from("direct_messages").upsert(messages.map((message, index) => ({
      id: messageIds[index],
      conversation_id: conv.id,
      sender_id: message.from === "me" ? isaac.id : professional.profile_id,
      body: message.body,
      attachment_urls: message.attachments || [],
      read_at: message.from === "me" || !unread ? iso(0) : null,
      created_at: iso(messages.length - index),
    })), { onConflict: "id" }));
    return conv;
  }

  const conv1 = await conversation({
    proSlug: "test-sg-solutions",
    subject: "Redes e internet",
    last: "Claro, podemos revisar cobertura y dejarle una propuesta.",
    unread: 2,
    messages: [
      { from: "me", body: "Hola, necesito mejorar el internet de una oficina pequena." },
      { from: "pro", body: "Con gusto. Podemos revisar router, repetidores y cableado." },
      { from: "pro", body: "Claro, podemos revisar cobertura y dejarle una propuesta." },
    ],
  });
  const conv2 = await conversation({
    proSlug: "test-plomeros-del-valle",
    subject: "Plomeria en Atenas",
    last: "Tengo espacio ma\u00f1ana en la ma\u00f1ana.",
    unread: 1,
    messages: [
      { from: "me", body: "Tengo una fuga pequena debajo del fregadero." },
      { from: "pro", body: "Tengo espacio ma\u00f1ana en la ma\u00f1ana." },
    ],
  });
  const conv3 = await conversation({
    proSlug: "test-conta-clara",
    subject: "Contabilidad mensual",
    last: "Le puedo enviar los requisitos por aquí.",
    unread: 0,
    messages: [
      { from: "me", body: "Quiero ordenar la contabilidad del negocio." },
      { from: "pro", body: "Le puedo enviar los requisitos por aquí." },
    ],
  });

  await must("insert notifications", supabase.from("notifications").insert([
    { user_id: isaac.id, type: "direct_message", title: "Nuevo mensaje", message: "SG Solutions respondió sobre la instalación de red WiFi.", data: { demoSeed: demo, href: "/es/mensajes", conversationId: conv1?.id }, read: false, created_at: iso(0) },
    { user_id: isaac.id, type: "booking_received", title: "Nueva solicitud", message: "Cliente Demo solicitó desarrollo web para su negocio.", data: { demoSeed: demo, href: "/es/panel?tab=solicitudes" }, read: false, created_at: iso(1) },
    { user_id: isaac.id, type: "proposal_received", title: "Nueva propuesta", message: "Conta Clara envió una propuesta para ordenar la contabilidad mensual.", data: { demoSeed: demo, href: "/es/panel?tab=proyectos" }, read: false, created_at: iso(2) },
    { user_id: isaac.id, type: "review_request", title: "Reseña pendiente", message: "Ya puede calificar el servicio recibido de Limpieza Total CR.", data: { demoSeed: demo, href: "/es/panel?tab=solicitudes" }, read: true, created_at: iso(3) },
    { user_id: isaac.id, type: "support_reply", title: "Soporte respondió", message: "Revisamos su consulta y dejamos una respuesta en el centro de soporte.", data: { demoSeed: demo, href: "/es/soporte" }, read: true, created_at: iso(4) },
  ]));

  await must("insert reviews", supabase.from("reviews").insert([
    { professional_id: isaacPro.id, client_id: clientA.id, rating: 5, comment: "Excelente trabajo. La página quedó clara, rápida y lista para recibir clientes.", job_title: "Sitio web para negocio local", client_name_snapshot: "Cliente Demo", client_email_snapshot: "cliente.demo@contratacr.com", created_at: iso(7), created_app_environment: demo, created_source_host: "mobile-test-seed" },
    { professional_id: bySlug.get("test-sg-solutions")?.id, client_id: isaac.id, rating: 5, comment: "Muy buen soporte técnico. Mejoraron la señal WiFi y explicaron todo con claridad.", job_title: "Mejora de red WiFi", client_name_snapshot: isaac.full_name, client_email_snapshot: isaac.email, created_at: iso(6), created_app_environment: demo, created_source_host: "mobile-test-seed" },
    { professional_id: bySlug.get("test-limpieza-total")?.id, client_id: isaac.id, rating: 5, comment: "La limpieza fue puntual y muy detallada. Excelente para apartamentos y oficinas.", job_title: "Limpieza profunda", client_name_snapshot: isaac.full_name, client_email_snapshot: isaac.email, created_at: iso(4), created_app_environment: demo, created_source_host: "mobile-test-seed" },
  ].filter((review) => review.professional_id)));

  const demoSlugs = new Set(Object.keys(proFix));
  const visible = await must("visible professionals", supabase.from("professionals").select("id,slug,business_name,services,verification_status,is_available,is_banned,profiles(avatar_url,is_disabled,full_name)").neq("verification_status", "rejected").eq("is_available", true).eq("is_banned", false).limit(200));
  const demoVisible = visible.filter((p) => demoSlugs.has(p.slug));
  const missing = demoVisible.filter((p) => !p.profiles?.avatar_url || /\?/.test(`${p.business_name || ""} ${p.profiles?.full_name || ""} ${JSON.stringify(p.services || [])}`));
  const badVisible = visible.filter((p) => badDemoPattern.test(`${p.slug || ""} ${p.business_name || ""} ${p.profiles?.full_name || ""}`));
  const reviewCheck = await must("review text check", supabase.from("reviews").select("id,comment,job_title,client_name_snapshot,created_app_environment,created_source_host").limit(1000));
  const badReviews = reviewCheck.filter((review) => {
    const source = `${review.created_app_environment || ""} ${review.created_source_host || ""}`;
    if (!source.includes("mobile-test")) return false;
    return /\?|resena|pagina|senal|tecnico/i.test(`${review.comment || ""} ${review.job_title || ""} ${review.client_name_snapshot || ""}`);
  });
  console.log(JSON.stringify({
    visible: visible.length,
    missingOrQuestionMarks: missing.map((p) => p.slug),
    badVisibleText: badVisible.map((p) => p.slug),
    badReviewText: badReviews.map((r) => r.id),
    bookingsForIsaac: insertedBookings.length,
    projectsForIsaac: projects.length,
    conversations: [conv1, conv2, conv3].filter(Boolean).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
