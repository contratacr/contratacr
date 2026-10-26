"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";
import { Link } from "@/i18n/navigation";
import { ContrataCRLogo } from "./landing-navbar";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { SupportLink } from "@/components/support/support-link";
import { AppStoreFooterLinks } from "./app-download";
import { SocialLinks } from "./social-links";
import { useAuth } from "@/hooks/use-auth";

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
    ],
  },
  {
    // ONE support channel: self-serve help (/ayuda) + the ticket-based support
    // center (/soporte). No separate "Contacto" link or raw mailto — the platform
    // centralizes everything through the ticket system (the legal contact email
    // lives on Términos/Privacidad, not here).
    headingKey: "support.title",
    links: [
      { key: "clients.howItWorks", href: "/como-funciona" },
      { key: "pros.verification", href: "/verificacion-de-identidad" },
      { key: "support.help",    href: "/ayuda" },
      { key: "support.contact", href: "/soporte" },
    ],
  },
];

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LandingFooter() {
  const t = useTranslations("footer");
  const { user } = useAuth();
  const interactive = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
    // Un solo panel para todos: `?mode=use` era del modo cliente, que ya no
  // existe —el panel lo acepta y lo ignora—, así que el enlace es el mismo.
  const panelHref = "/dashboard/profesional";
  return (
    // La misma separación sutil que la fila de derechos, en todas las páginas.
    <footer className="ccr-app-footer relative bg-white text-[#162543]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8">
        <div aria-hidden="true" className="border-t border-[#162543]/10 pt-3 md:pt-10 lg:pt-12" />

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-0 pb-0 md:grid-cols-3 md:gap-x-8 md:gap-y-8 md:pb-7 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-10 lg:pb-8">

          {/* Brand introduction */}
          <div className="order-last pt-8 md:order-first md:col-span-3 md:pt-0 lg:col-span-1">
            <Link href="/" aria-label="ContrataCR" className="inline-flex mb-4">
              <ContrataCRLogo />
            </Link>
            <p className="text-sm text-[#64748b] leading-6 max-w-sm lg:max-w-[280px]">
              {t("tagline")}
            </p>

          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <nav key={col.headingKey} aria-label={t(col.headingKey)} className="border-b border-[#162543]/10 md:border-0">
              <h3 className="text-[15px] font-semibold text-[#162543] md:mb-3 md:text-sm md:font-bold">
                <span className="hidden md:inline">{t(col.headingKey)}</span>
                <button
                  type="button"
                  disabled={!interactive}
                  aria-expanded={openGroup === col.headingKey}
                  aria-controls={`footer-${col.headingKey.replaceAll(".", "-")}`}
                  onClick={() => setOpenGroup(openGroup === col.headingKey ? null : col.headingKey)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9] md:hidden"
                >
                  {t(col.headingKey)}
                  <ChevronDown aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 text-[#64748b] transition-transform duration-200 motion-reduce:transition-none ${openGroup === col.headingKey ? "rotate-180" : ""}`} />
                </button>
              </h3>
              <ul id={`footer-${col.headingKey.replaceAll(".", "-")}`} className={`${openGroup === col.headingKey ? "grid" : "hidden"} grid-cols-1 gap-y-1 pb-5 md:grid md:pb-0`}>
                {col.headingKey === "support.title" && user && (
                  <li>
                    <Link href={panelHref} className="inline-flex py-2 text-sm leading-5 text-[#162543] hover:text-[#0083b0] transition-colors">
                      {t("support.panel")}
                    </Link>
                  </li>
                )}
                {col.links.map(({ key, href }) => (
                  <li key={key}>
                    {href === "/registro/profesional" ? (
                      <SmartRegisterLink className="inline-flex py-2 text-sm leading-5 text-[#162543] hover:text-[#0083b0] transition-colors">
                        {t(key)}
                      </SmartRegisterLink>
                    ) : href === "/soporte" ? (
                      <SupportLink className="inline-flex py-2 text-sm leading-5 text-left text-[#162543] hover:text-[#0083b0] transition-colors">
                        {t(key)}
                      </SupportLink>
                    ) : (
                      <Link
                        href={href}
                        className="inline-flex py-2 text-sm leading-5 text-[#162543] hover:text-[#0083b0] transition-colors"
                      >
                        {t(key)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Social and downloads have their own row, separate from navigation. */}
        <div data-testid="footer-community-row" className="grid grid-cols-2 gap-x-6 gap-y-6 border-b border-[#162543]/10 pb-7 pt-6 md:flex md:items-center md:justify-between md:py-5">
          <SocialLinks />
          <div className="[&>div]:flex-wrap [&>div]:gap-x-2 [&>div]:gap-y-2 [&>div>span]:w-full [&>div>span]:text-xs [&>div>span]:font-medium [&>div>span]:text-[#64748b] md:[&>div]:gap-5 md:[&>div>span]:w-auto md:[&>div>span]:text-sm"><AppStoreFooterLinks /></div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-start justify-between gap-4 pt-6 md:flex-row md:items-center">
          <p className="text-xs leading-5 text-[#64748b]">
            {t("rights", { year: new Date().getFullYear() })}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/terminos" className="text-xs text-[#162543] hover:text-[#0083b0] transition-colors">{t("terms")}</Link>
            <Link href="/privacidad" className="text-xs text-[#162543] hover:text-[#0083b0] transition-colors">{t("privacy")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
