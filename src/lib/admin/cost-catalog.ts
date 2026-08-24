// Everything ContrataCR runs on, what each piece costs and where its free
// allowance ends. This is the informative backbone of the admin "Costos"
// section: the amounts here are defaults (what the plans cost as of
// 2026-08-24) and every one of them can be corrected from the admin, where the
// owner also records the date each service started and what the month's usage
// looks like. Amounts are in USD unless the service is paid in colones.

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
  /** Paid per piece rather than per period (ads, content). */
  variable?: boolean;
  currency?: "USD" | "CRC";
  limit: CostLimit;
  /** Where to read the real usage. */
  usageUrl?: string;
  /** The default amount is an assumption to confirm with the provider's invoice. */
  verify?: boolean;
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
    limit: {
      included: "10 millones de solicitudes al mes y 30 millones de ms de CPU. D1: 25 000 millones de filas leídas y 5 GB. R2: 10 GB. Workers AI: 10 000 neuronas por día.",
      beyond: "Se cobra por uso sin cortar el servicio: $0.30 por millón de solicitudes extra, $0.02 por millón de ms de CPU, $0.015 por GB extra en R2, $0.011 por 1 000 neuronas extra.",
    },
    usageUrl: "https://dash.cloudflare.com/?to=/:account/workers-and-pages",
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "datos",
    role: "Base de datos Postgres, autenticación, tiempo real (chat) y almacenamiento de la app en producción.",
    plan: "Pro",
    monthlyUsd: 25,
    annualUsd: 0,
    limit: {
      included: "8 GB de base de datos, 100 GB de archivos, 250 GB de transferencia y 100 000 usuarios activos al mes.",
      beyond: "Con el tope de gasto activado (por defecto) no se cobra más: al superar un límite el proyecto queda restringido hasta el mes siguiente. Sin tope, cobra por uso ($0.125 por GB extra de base de datos).",
    },
    usageUrl: "https://supabase.com/dashboard/org/_/usage",
    verify: true,
  },
  {
    id: "claude",
    name: "Claude (Anthropic)",
    category: "herramientas",
    role: "Desarrollo de la app con Claude Code: código, pruebas, revisiones y despliegues.",
    plan: "Max",
    monthlyUsd: 100,
    annualUsd: 0,
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
    plan: "Free (repositorio público)",
    monthlyUsd: 0,
    annualUsd: 0,
    limit: {
      included: "Minutos ilimitados de Actions mientras el repositorio es público (del 1 al 23 de agosto de 2026 se usaron 4 742 minutos).",
      beyond: "Si el repositorio pasa a privado: 2 000 minutos gratis al mes; después $0.008 por minuto en Linux y $0.08 en macOS (compilaciones de iOS).",
    },
    usageUrl: "https://github.com/settings/billing/summary",
  },
  {
    id: "namecheap",
    name: "Namecheap (dominio)",
    category: "infraestructura",
    role: "Registro del dominio contratacr.com.",
    plan: "Renovación anual",
    monthlyUsd: 0,
    annualUsd: 15,
    limit: {
      included: "Un dominio; el precio es fijo por año.",
      beyond: "Si no se renueva, el dominio expira y el sitio deja de resolver.",
    },
    usageUrl: "https://ap.www.namecheap.com/domains/list/",
    verify: true,
  },
  {
    id: "google-maps",
    name: "Google Maps Platform",
    category: "infraestructura",
    role: "Mapa y búsqueda de lugares en /buscar y en los perfiles.",
    plan: "Pago por uso con crédito mensual",
    monthlyUsd: 0,
    annualUsd: 0,
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
    plan: "Free",
    monthlyUsd: 0,
    annualUsd: 0,
    limit: {
      included: "300 correos por día.",
      beyond: "Los correos que excedan el día no se envían hasta el siguiente; el plan Starter (desde $9 al mes) quita el tope diario.",
    },
    usageUrl: "https://app.brevo.com/",
    verify: true,
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "datos",
    role: "Fotos de perfil y de publicaciones (respaldo de R2 mientras se termina la migración).",
    plan: "Free",
    monthlyUsd: 0,
    annualUsd: 0,
    limit: {
      included: "25 créditos al mes (≈ 25 GB de almacenamiento o transferencia, o 25 000 transformaciones).",
      beyond: "Al agotar los créditos las imágenes nuevas fallan; el siguiente plan (Plus) cuesta $89 al mes. Por eso las imágenes se mueven a R2.",
    },
    usageUrl: "https://console.cloudinary.com/",
    verify: true,
  },
  {
    id: "firebase",
    name: "Firebase Cloud Messaging",
    category: "movil",
    role: "Notificaciones push de la app (Android; iOS pendiente de APNs).",
    plan: "Spark (gratis)",
    monthlyUsd: 0,
    annualUsd: 0,
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
    limit: { included: "Un equipo de desarrollo, apps ilimitadas.", beyond: "Si no se renueva, la app sale del App Store." },
    usageUrl: "https://developer.apple.com/account",
    verify: true,
  },
  {
    id: "google-play",
    name: "Google Play Console",
    category: "movil",
    role: "Publicar la app en Google Play.",
    plan: "Pago único",
    monthlyUsd: 0,
    annualUsd: 0,
    limit: { included: "$25 una sola vez al crear la cuenta.", beyond: "No aplica." },
    usageUrl: "https://play.google.com/console",
    verify: true,
  },
  {
    id: "meta-ads",
    name: "Meta Ads (Facebook e Instagram)",
    category: "marketing",
    role: "Campañas pagadas para captar clientes (campaña «Clientes - Registro - Ago 2026», $5 al día).",
    plan: "Presupuesto diario por campaña",
    monthlyUsd: 0,
    annualUsd: 0,
    variable: true,
    limit: {
      included: "Nada incluido: cada campaña gasta hasta su presupuesto diario.",
      beyond: "Meta cobra al alcanzar el umbral de facturación de la cuenta o al final del mes. El gasto se registra aquí desde Ads Manager.",
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
    variable: true,
    currency: "CRC",
    limit: {
      included: "₡10 000 por publicación o destacada · ₡20 000 por video.",
      beyond: "No hay tope: cada pieza se registra aquí al pagarla.",
    },
  },
];

export const CONTENT_RATES_CRC = { publicacion: 10_000, video: 20_000 } as const;

export function findCostService(id: string) {
  return COST_SERVICES.find((service) => service.id === id) ?? null;
}
