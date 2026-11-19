import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers applied to every response. Conservative set that hardens
// against clickjacking, MIME-sniffing, and protocol downgrade without risking
// breakage (no restrictive CSP default-src that could block Cloudinary/Supabase).
const securityHeaders = [
  // Force HTTPS for 2 years (incl. subdomains) once seen over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Block MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Anti-clickjacking (legacy header + modern CSP frame-ancestors).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // Don't leak full URLs to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful features the app doesn't use; allow geolocation for the map.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // Local Pro QA traverses more than the default five development entries.
  // Keep compiled modules between flows; never relax authentication timeouts
  // or change the production cache/data policy to accommodate compilation.
  ...(process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321"
    ? { onDemandEntries: { maxInactiveAge: 15 * 60 * 1000, pagesBufferLength: 20 } }
    : {}),
  ...(process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_PRO_LAN_ORIGIN
    ? { allowedDevOrigins: [new URL(process.env.NEXT_PUBLIC_PRO_LAN_ORIGIN).hostname] } : {}),
  // Sin el círculo «N» de desarrollo: caía justo encima de la pestaña
  // Profesionales del menú de abajo y el toque le llegaba a él, no a la pestaña
  // (parecía que el botón no respondía). Los errores de compilación y de
  // ejecución se siguen mostrando igual. En producción no existe.
  devIndicators: false,
  // Volver a una sección ya visitada no debe recargarla: el armazón de cada
  // página queda en el caché del cliente y la navegación es instantánea, sin
  // skeleton ni marca. Los datos frescos los piden las propias pantallas
  // (paneles, chat, tablones cachean y refrescan por su cuenta), así que
  // cachear el armazón unos minutos no muestra nada viejo.
  experimental: {
    // 177 importaciones de `lucide-react`: que cada una traiga su icono y no el barril.
    optimizePackageImports: ["lucide-react"],
    // Ronda 7C (Pro local): los archivos privados Pro admiten 20 MiB; el cuerpo JSON en base64 llega a
    // ~28 MB y el middleware (proxy) lo recorta a 10 MB por defecto. 30 MB cubre ese máximo.
    proxyClientMaxBodySize: "30mb",
    staleTimes: {
      dynamic: 300,
      static: 1800,
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "randomuser.me" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "assets.contratacr.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders.filter(header => !["Content-Security-Policy", "Referrer-Policy"].includes(header.key)) },
      // Private print and file handlers own their stricter response CSP and referrer policy.
      // Global response headers would replace those dynamic route headers.
      { source: "/:path((?!api/pro/(?:invoice-print|payment-receipt-print|work-files|team-task-discussion|company-files|daily-log-files)/?$).*)", headers: securityHeaders.filter(header => ["Content-Security-Policy", "Referrer-Policy"].includes(header.key)) },
      // Next's global defaults also override route headers locally. Keep the
      // native handoff stricter; Cloudflare receives the same headers directly
      // from its route handler (it does not apply this Next header table).
      { source: "/auth/callback", has: [{ type: "query", key: "flow", value: "android-apple" }], headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
      ] },
      // Guardar y rellenar contraseñas en la app de iPhone (webcredentials):
      // Apple lee este archivo como JSON. En Cloudflare lo pone public/_headers.
      { source: "/.well-known/apple-app-site-association", headers: [{ key: "Content-Type", value: "application/json" }] },
      // Match the Workers asset policy during local/Next deployments. These
      // are public presentation images, not account or professional data.
      ...["/hero/:path*", "/featured-brands/:path*"].map(source => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      })),
    ];
  },
  // Short vanity links for social bios ("contratacr.com/ig" reads clean where a
  // utm-laden URL would not). Each redirect lands on the home page carrying the
  // attribution parameters the app stores at registration (migration 177).
  async redirects() {
    return [
      { source: "/ig", destination: "/?utm_source=instagram&utm_medium=organic&utm_campaign=bio", permanent: false },
      { source: "/tt", destination: "/?utm_source=tiktok&utm_medium=organic&utm_campaign=bio", permanent: false },
      { source: "/fb", destination: "/?utm_source=facebook&utm_medium=organic&utm_campaign=bio", permanent: false },
      { source: "/wa", destination: "/?utm_source=whatsapp&utm_medium=referral&utm_campaign=bio", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
