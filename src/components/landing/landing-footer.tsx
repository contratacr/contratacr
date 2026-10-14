"use client";

import { useTranslations } from "next-intl";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";
import { Link } from "@/i18n/navigation";
import { ContrataCRLogo } from "./landing-navbar";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { SupportLink } from "@/components/support/support-link";
import { AppStoreFooterLinks } from "./app-download";
import { useAuth } from "@/hooks/use-auth";

function InstagramIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function TikTokIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
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
// Every href points to a CURRENT, existing page (verified against the app routes).
// Los encabezados nombran la ACCIÓN, no a la persona. «Para clientes» y «Para
// profesionales» partían a la gente en dos tipos, y este app dice lo contrario
// en su propio código: no hay panel de cliente («everyone lives here») y un
// profesional también contrata. Quien se leía «Para profesionales» se saltaba
// la primera columna creyendo que no era suya.
const COLUMNS = [
  {
    headingKey: "clients.title",
    links: [
      { key: "clients.search",     href: "/profesionales" },
      { key: "clients.categories", href: "/servicios" },
      { key: "clients.offers",     href: "/promociones" },
      { key: "clients.howItWorks", href: "/como-funciona" },
      { key: "clients.publish",    href: "/publicar-proyecto" },
    ],
  },
  {
    headingKey: "pros.title",
    links: [
      { key: "pros.register",     href: "/registro/profesional" },
      // Los tres tableros son la puerta de entrada al trabajo: de aquí sale el
      // enlace interno que los buscadores siguen hasta ellos.
      { key: "pros.projects",     href: "/proyectos" },
      // Empleos se puede apagar entero con la bandera; el resto del app la
      // respeta y el pie lo enlazaba igual.
      ...(EMPLEOS_VISIBLE ? [{ key: "pros.jobs", href: "/empleos" }] : []),
      { key: "pros.attract",      href: "/mejorar-mi-perfil" },
      { key: "pros.verification", href: "/verificacion-de-identidad" },
    ],
  },
  {
    // ONE support channel: self-serve help (/ayuda) + the ticket-based support
    // center (/soporte). No separate "Contacto" link or raw mailto — the platform
    // centralizes everything through the ticket system (the legal contact email
    // lives on Términos/Privacidad, not here).
    headingKey: "support.title",
    links: [
      { key: "support.help",    href: "/ayuda" },
      { key: "support.contact", href: "/soporte" },
    ],
  },
];

export function LandingFooter() {
  const t = useTranslations("footer");
  const { user } = useAuth();
    // Un solo panel para todos: `?mode=use` era del modo cliente, que ya no
  // existe —el panel lo acepta y lo ignora—, así que el enlace es el mismo.
  const panelHref = "/dashboard/profesional";
  return (
    // La misma separación sutil que la fila de derechos, en todas las páginas.
    <footer className="ccr-app-footer relative bg-white text-[#162543]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8">
        <div aria-hidden="true" className="border-t border-[#162543]/10 pt-14" />

        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 pb-10">

          {/* Brand column — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            <Link href="/" aria-label="ContrataCR" className="inline-flex mb-4">
              <ContrataCRLogo />
            </Link>
            <p className="text-sm text-[#162543] leading-relaxed mb-6 max-w-[260px]">
              {t("tagline")}
            </p>

          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.headingKey}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#162543] mb-4">
                {t(col.headingKey)}
              </h3>
              <ul className="space-y-3">
                {col.headingKey === "support.title" && user && (
                  <li>
                    <Link href={panelHref} className="text-sm text-[#162543] hover:text-[#0083b0] transition-colors">
                      {t("support.panel")}
                    </Link>
                  </li>
                )}
                {col.links.map(({ key, href }) => (
                  <li key={key}>
                    {href === "/registro/profesional" ? (
                      <SmartRegisterLink className="text-sm text-[#162543] hover:text-[#0083b0] transition-colors">
                        {t(key)}
                      </SmartRegisterLink>
                    ) : href === "/soporte" ? (
                      <SupportLink className="text-sm text-left text-[#162543] hover:text-[#0083b0] transition-colors">
                        {t(key)}
                      </SupportLink>
                    ) : (
                      <Link
                        href={href}
                        className="text-sm text-[#162543] hover:text-[#0083b0] transition-colors"
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

        {/* Social and downloads have their own row, separate from navigation. */}
        <div data-testid="footer-community-row" className="flex flex-col gap-5 border-b border-[#162543]/10 py-5 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label={t("followUs")} data-testid="footer-social-links" className="flex flex-wrap items-center gap-3">
            <span className="mr-1 text-sm text-[#162543]">{t("followUs")}</span>
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <a key={label} href={href} aria-label={label} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 items-center justify-center text-[#162543] transition-colors hover:text-[#0083b0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">
                <Icon />
              </a>
            ))}
          </nav>
          <AppStoreFooterLinks />
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#162543]">
            {t("rights", { year: new Date().getFullYear() })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/terminos" className="text-xs text-[#162543] hover:text-[#0083b0] transition-colors">{t("terms")}</Link>
            <Link href="/privacidad" className="text-xs text-[#162543] hover:text-[#0083b0] transition-colors">{t("privacy")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
