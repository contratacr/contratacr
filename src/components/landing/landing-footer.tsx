"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContrataCRLogo } from "./landing-navbar";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";

function InstagramIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function TikTokIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://www.facebook.com/share/18tY9mAhub/?mibextid=wwXIfr", Icon: FacebookIcon },
  { label: "Instagram", href: "https://www.instagram.com/contratacr/", Icon: InstagramIcon },
  { label: "TikTok", href: "https://www.tiktok.com/@contratacr", Icon: TikTokIcon },
];

// Labels resolve to footer.<key> at render so they translate per locale.
const COLUMNS = [
  {
    headingKey: "clients.title",
    links: [
      { key: "clients.search",     href: "/buscar" },
      { key: "clients.publish",    href: "/publicar-proyecto" },
      { key: "clients.howItWorks", href: "/como-funciona" },
      { key: "clients.help",       href: "/ayuda" },
    ],
  },
  {
    headingKey: "pros.title",
    links: [
      { key: "pros.register",   href: "/registro/profesional" },
      { key: "pros.attract",    href: "/atraer-clientes" },
      { key: "pros.howItWorks", href: "/como-funciona" },
    ],
  },
  {
    headingKey: "support.title",
    links: [
      { key: "support.contact", href: "/soporte" },
      { key: "support.help",    href: "/ayuda" },
    ],
  },
];

export function LandingFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="bg-[#111827] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-8">

        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 pb-10 border-b border-white/10">

          {/* Brand column — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            <Link href="/" aria-label="ContrataCR inicio" className="inline-flex mb-4">
              <ContrataCRLogo chip className="[&_span]:text-white [&_.text-\[\#009FD9\]]:text-[#38bdf8]" />
            </Link>
            <p className="text-sm text-white/50 leading-relaxed mb-6 max-w-[260px]">
              {t("tagline")}
            </p>
            {/* Social */}
            <div className="flex items-center gap-2">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 text-white/50 hover:bg-[#009FD9]/20 hover:text-[#38bdf8] transition-all"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.headingKey}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
                {t(col.headingKey)}
              </h3>
              <ul className="space-y-3">
                {col.links.map(({ key, href }) => (
                  <li key={key}>
                    {href === "/registro/profesional" ? (
                      <SmartRegisterLink className="text-sm text-white/60 hover:text-white transition-colors">
                        {t(key)}
                      </SmartRegisterLink>
                    ) : (
                      <Link
                        href={href}
                        className="text-sm text-white/60 hover:text-white transition-colors"
                      >
                        {t(key)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/25">
            {t("rights", { year: new Date().getFullYear() })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/terminos" className="text-xs text-white/40 hover:text-white transition-colors">{t("terms")}</Link>
            <Link href="/privacidad" className="text-xs text-white/40 hover:text-white transition-colors">{t("privacy")}</Link>
            <span className="text-xs text-white/25">{t("madeIn")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
