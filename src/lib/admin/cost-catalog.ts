// Everything ContrataCR runs on, what each piece costs and where its free
// allowance ends. This is the informative backbone of the admin "Costos"
// section. Amounts and start dates are the owner's figures as of 2026-08-24
// (start dates are approximate — they only anchor the "since the start"
// total); the admin can correct the amounts and note the month's usage.

export type CostCategory = "infraestructura" | "datos" | "herramientas" | "movil" | "marketing" | "contenido";

export type CostLimit = {
  /** What is included before the provider charges more, in plain words. */
  included: string;
  /** What happens past that point: a charge per unit, a required plan, a pause. */
  beyond: string;
};

export type CostService = {
  id: string;
  name: string;
  category: CostCategory;
  /** What ContrataCR uses it for. */
  role: string;
  plan: string;
  monthlyUsd: number;
  annualUsd: number;
  /** Month the service started being paid (approximate). */
  since: string | null;
  /** Paid per piece rather than per period (content). */
  variable?: boolean;
  currency?: "USD" | "CRC";
  limit: CostLimit;
  /** Where to read the real usage. */
  usageUrl?: string;
};

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  infraestructura: "Infraestructura",
  datos: "Base de datos y archivos",
  herramientas: "Herramientas de desarrollo",
  movil: "Tiendas y móvil",
  marketing: "Publicidad",
  contenido: "Contenido en redes",
};

export const COST_SERVICES: readonly CostService[] = [
  {
    id: "cloudflare-workers",
    name: "Cloudflare Workers",
    category: "infraestructura",
    role: "Aloja contratacr.com y test.contratacr.com (la app, la API y el CDN). También D1 (padrón), R2 (archivos) y Workers AI (asistente).",
    plan: "Workers Paid",
    monthlyUsd: 5,
    annualUsd: 0,
    since: "2026-07-01",
    limit: {
      included: "10 millones de solicitudes al mes y 30 millones de ms de CPU. D1: 25 000 millones de filas leídas y 5 GB. R2: 10 GB. Workers AI: 10 000 neuronas por día.",
      beyond: "Se cobra por uso sin cortar el servicio: $0.30 por millón de solicitudes extra, $0.02 por millón de ms de CPU, $0.015 por GB extra en R2, $0.011 por 1 000 neuronas extra.",
    },
    usageUrl: "https://dash.cloudflare.com/?to=/:account/workers-and-pages",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "infraestructura",
    role: "Alojamiento anterior de la app, reemplazado por Cloudflare. Se pagó un mes de Pro ($20) y $45 de uso.",
    plan: "Hobby (gratis)",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-06-01",
    limit: {
      included: "Plan gratuito para proyectos personales: 100 GB de transferencia al mes.",
      beyond: "Ya no aloja nada de ContrataCR; no genera cargos.",
    },
    usageUrl: "https://vercel.com/dashboard",
  },
  {
    id: "namecheap",
    name: "Namecheap (dominio)",
    category: "infraestructura",
    role: "Registro del dominio contratacr.com.",
    plan: "Renovación anual",
    monthlyUsd: 0,
    annualUsd: 15,
    since: "2026-05-31",
    limit: {
      included: "Un dominio; el precio es fijo por año.",
      beyond: "Si no se renueva, el dominio expira y el sitio deja de resolver.",
    },
    usageUrl: "https://ap.www.namecheap.com/domains/list/",
  },
  {
    id: "google-maps",
    name: "Google Cloud (Maps)",
    category: "infraestructura",
    role: "Mapa y búsqueda de lugares en /buscar y en los perfiles.",
    plan: "Gratis (crédito mensual)",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-05-31",
    limit: {
      included: "$200 de crédito gratis cada mes (≈ 28 000 cargas de mapa).",
      beyond: "Se cobra por uso: $7 por cada 1 000 cargas de mapa adicionales. Las claves tienen restricción por dominio.",
    },
    usageUrl: "https://console.cloud.google.com/google/maps-apis/metrics",
  },
  {
    id: "brevo",
    name: "Brevo (correo)",
    category: "infraestructura",
    role: "Correos transaccionales: verificación, recuperación de contraseña, avisos.",
    plan: "Gratis",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-05-31",
    limit: {
      included: "300 correos por día.",
      beyond: "Los correos que excedan el día no se envían hasta el siguiente; el plan Starter (desde $9 al mes) quita el tope diario.",
    },
    usageUrl: "https://app.brevo.com/",
  },
  {
    id: "resend",
    name: "Resend (correo)",
    category: "infraestructura",
    role: "Envío de correos de respaldo.",
    plan: "Gratis",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-05-31",
    limit: {
      included: "3 000 correos al mes y 100 por día.",
      beyond: "Al superar el tope los envíos fallan hasta el día o mes siguiente; el plan Pro cuesta $20 al mes.",
    },
    usageUrl: "https://resend.com/overview",
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "datos",
    role: "Base de datos Postgres, autenticación, tiempo real (chat) y almacenamiento de la app. Se pagó un mes de Pro ($25).",
    plan: "Gratis",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-05-31",
    limit: {
      included: "500 MB de base de datos, 1 GB de archivos, 5 GB de transferencia y 50 000 usuarios activos al mes; dos proyectos.",
      beyond: "No cobra de más: al superar un límite el proyecto se restringe (y se pausa tras una semana sin actividad). El plan Pro ($25 al mes) sube los límites a 8 GB / 100 GB / 250 GB.",
    },
    usageUrl: "https://supabase.com/dashboard/org/_/usage",
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "datos",
    role: "Fotos de perfil y de publicaciones (respaldo de R2 mientras se termina la migración).",
    plan: "Gratis",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-05-31",
    limit: {
      included: "25 créditos al mes (≈ 25 GB de almacenamiento o transferencia, o 25 000 transformaciones).",
      beyond: "Al agotar los créditos las imágenes nuevas fallan; el siguiente plan (Plus) cuesta $89 al mes. Por eso las imágenes se mueven a R2.",
    },
    usageUrl: "https://console.cloudinary.com/",
  },
  {
    id: "claude",
    name: "Claude (Anthropic)",
    category: "herramientas",
    role: "Desarrollo de la app con Claude Code: código, pruebas, revisiones y despliegues.",
    plan: "Max",
    monthlyUsd: 100,
    annualUsd: 0,
    since: "2026-06-01",
    limit: {
      included: "Uso por ventanas de 5 horas y un tope semanal, ambos incluidos en la suscripción.",
      beyond: "No cobra de más: al llegar al tope se pausa hasta la siguiente ventana.",
    },
    usageUrl: "https://claude.ai/settings/usage",
  },
  {
    id: "github",
    name: "GitHub",
    category: "herramientas",
    role: "Código fuente, ramas main/test/mobile y las acciones que prueban y despliegan cada cambio.",
    plan: "Gratis (repositorio público)",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-05-31",
    limit: {
      included: "Minutos ilimitados de Actions mientras el repositorio es público (del 1 al 23 de agosto de 2026 se usaron 4 742 minutos).",
      beyond: "Si el repositorio pasa a privado: 2 000 minutos gratis al mes; después $0.008 por minuto en Linux y $0.08 en macOS (compilaciones de iOS).",
    },
    usageUrl: "https://github.com/settings/billing/summary",
  },
  {
    id: "firebase",
    name: "Firebase Cloud Messaging",
    category: "movil",
    role: "Notificaciones push de la app (Android; iOS pendiente de APNs).",
    plan: "Gratis",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-07-01",
    limit: { included: "Envío de notificaciones sin límite de costo.", beyond: "No aplica." },
    usageUrl: "https://console.firebase.google.com/",
  },
  {
    id: "apple-developer",
    name: "Apple Developer Program",
    category: "movil",
    role: "Publicar la app en el App Store, TestFlight e inicio de sesión con Apple.",
    plan: "Membresía anual",
    monthlyUsd: 0,
    annualUsd: 99,
    since: "2026-07-01",
    limit: { included: "Un equipo de desarrollo, apps ilimitadas.", beyond: "Si no se renueva, la app sale del App Store." },
    usageUrl: "https://developer.apple.com/account",
  },
  {
    id: "google-play",
    name: "Google Play Console",
    category: "movil",
    role: "Publicar la app en Google Play. Se pagó una sola vez al abrir la cuenta.",
    plan: "Pago único de $25",
    monthlyUsd: 0,
    annualUsd: 0,
    since: "2026-07-01",
    limit: { included: "$25 una sola vez al crear la cuenta de desarrollador (no se renueva).", beyond: "No aplica." },
    usageUrl: "https://play.google.com/console",
  },
  {
    id: "meta-ads",
    name: "Meta Ads (Facebook e Instagram)",
    category: "marketing",
    role: "Campañas pagadas para captar clientes; alrededor de $35 al mes.",
    plan: "Presupuesto mensual aproximado",
    monthlyUsd: 35,
    annualUsd: 0,
    since: "2026-06-01",
    limit: {
      included: "Nada incluido: cada campaña gasta hasta su presupuesto diario.",
      beyond: "Meta cobra al alcanzar el umbral de facturación de la cuenta o al final del mes. Un mes con más gasto se anota en Movimientos.",
    },
    usageUrl: "https://adsmanager.facebook.com/adsmanager/manage/campaigns",
  },
  {
    id: "sharon-content",
    name: "Sharon Velásquez (contenido)",
    category: "contenido",
    role: "Publicaciones, destacadas y videos para las redes de ContrataCR.",
    plan: "Por pieza",
    monthlyUsd: 0,
    annualUsd: 0,
    since: null,
    variable: true,
    currency: "CRC",
    limit: {
      included: "₡10 000 por publicación o destacada · ₡20 000 por video.",
      beyond: "No hay tope: cada pieza se registra en Movimientos al pagarla.",
    },
  },
];

export const CONTENT_RATES_CRC = { publicacion: 10_000, video: 20_000 } as const;

export function findCostService(id: string) {
  return COST_SERVICES.find((service) => service.id === id) ?? null;
}
