"use client";

/* TODO: Confirm real partner/media logos with the business team before going live */

import { useTranslations } from "next-intl";

const LOGOS = [
  { name: "Next.js",       style: { fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" } },
  { name: "Supabase",      style: { fontSize: 16, fontWeight: 900, letterSpacing: "0.02em" } },
  { name: "Vercel",        style: { fontSize: 15, fontWeight: 800, letterSpacing: "0.01em" } },
  { name: "Google Maps",   style: { fontSize: 14, fontWeight: 700, letterSpacing: "0.03em" } },
  { name: "Cloudinary",    style: { fontSize: 15, fontWeight: 800, letterSpacing: "0.02em" } },
  { name: "Tailwind CSS",  style: { fontSize: 14, fontWeight: 800, letterSpacing: "0.02em" } },
  { name: "TypeScript",    style: { fontSize: 15, fontWeight: 900, letterSpacing: "0.01em" } },
  { name: "PostgreSQL",    style: { fontSize: 14, fontWeight: 800, letterSpacing: "0.02em" } },
];

const DOUBLED = [...LOGOS, ...LOGOS];

export function MarqueeStrip() {
  const t = useTranslations("landing.marquee");

  return (
    <section
      className="overflow-hidden"
      style={{
        background: "#ffffff",
        borderTop: "1px solid #f0f1f3",
        borderBottom: "1px solid #f0f1f3",
        padding: "32px 0",
      }}
    >
      <p className="text-center mb-6 font-extrabold text-[#1a2744] text-xl sm:text-2xl tracking-tight">
        {t("heading")}
      </p>

      <div className="flex animate-logo-scroll" style={{ width: "max-content", gap: 0 }}>
        {DOUBLED.map((logo, i) => (
          <div key={i} className="flex items-center shrink-0" style={{ padding: "0 48px" }}>
            <span
              style={{ ...logo.style, color: "#c0c7d0", whiteSpace: "nowrap", userSelect: "none", transition: "color 0.2s" }}
              className="hover:!text-[#9ca3af] cursor-default"
            >
              {logo.name}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
