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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Short vanity links for social bios ("contratacr.com/ig" reads clean where a
  // utm-laden URL would not). Each redirect lands on the home page carrying the
  // attribution parameters the app stores at registration (migration 177).
  async redirects() {
    return [
      { source: "/ig", destination: "/es?utm_source=instagram&utm_medium=organic&utm_campaign=bio", permanent: false },
      { source: "/tt", destination: "/es?utm_source=tiktok&utm_medium=organic&utm_campaign=bio", permanent: false },
      { source: "/fb", destination: "/es?utm_source=facebook&utm_medium=organic&utm_campaign=bio", permanent: false },
      { source: "/wa", destination: "/es?utm_source=whatsapp&utm_medium=referral&utm_campaign=bio", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
