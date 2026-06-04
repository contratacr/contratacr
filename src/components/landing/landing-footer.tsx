import { Link } from "@/i18n/navigation";
import { ContrataCRLogo } from "./landing-navbar";

function InstagramIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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
function LinkedInIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "X", href: "#", Icon: XIcon },
  { label: "Facebook", href: "#", Icon: FacebookIcon },
  { label: "LinkedIn", href: "#", Icon: LinkedInIcon },
];

const COLUMNS = [
  {
    heading: "Para clientes",
    links: [
      { label: "Buscar profesionales", href: "/buscar" },
      { label: "Publicar un proyecto", href: "/publicar-proyecto" },
      { label: "Cómo funciona",        href: "/como-funciona" },
      { label: "Centro de ayuda",      href: "/ayuda" },
    ],
  },
  {
    heading: "Para profesionales",
    links: [
      { label: "Registrá tu perfil",   href: "/registro/profesional" },
      { label: "Cómo atraer clientes", href: "/atraer-clientes" },
      { label: "Cómo funciona",        href: "/como-funciona" },
    ],
  },
  {
    heading: "Soporte",
    links: [
      { label: "Contactar soporte", href: "/soporte" },
      { label: "Centro de ayuda",   href: "/ayuda" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="bg-[#111827] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-8">

        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 pb-10 border-b border-white/10">

          {/* Brand column — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            <ContrataCRLogo className="mb-4 [&_span]:text-white [&_.text-\[\#009FD9\]]:text-[#38bdf8]" />
            <p className="text-sm text-white/50 leading-relaxed mb-6 max-w-[260px]">
              El mercado de servicios profesionales exclusivo para Costa Rica. Gratuito para clientes y profesionales, sin comisiones ni cargos de ningún tipo.
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
            <div key={col.heading}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
                {col.heading}
              </h3>
              <ul className="space-y-3">
                {col.links.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm text-white/60 hover:text-white transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} ContrataCR. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/25">Diseñado y desarrollado en Costa Rica 🇨🇷</span>
            <a
              href="mailto:soportecontratacr@hotmail.com"
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              soportecontratacr@hotmail.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
