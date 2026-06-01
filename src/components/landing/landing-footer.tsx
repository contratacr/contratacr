import { Link } from "@/i18n/navigation";

export function LandingFooter() {
  return (
    <footer className="bg-[#F8FAFC] border-t border-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <path d="M11 1L21 11L11 21L1 11L11 1Z" fill="#2563EB"/>
                <path d="M7.5 11L10 13.5L14.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-base font-extrabold text-[#1a2744] tracking-tight">
                Contrata<span className="text-[#2563EB]">CR</span>
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-5 max-w-[220px]">
              El mercado de servicios profesionales exclusivo para Costa Rica.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-[#2563EB] hover:border-[#2563EB]/20 hover:bg-[#EBF5FB] transition-all"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Para clientes */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a2744] mb-4">
              Para clientes
            </h3>
            <ul className="space-y-3">
              {[
                { label: "Buscar profesionales", href: "/buscar" },
                { label: "Cómo funciona", href: "/como-funciona" },
                { label: "Categorías", href: "/categorias" },
                { label: "Servicios populares", href: "/buscar" },
                { label: "Regístrate gratis", href: "/registro" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-gray-400 hover:text-[#2563EB] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Para profesionales */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a2744] mb-4">
              Para profesionales
            </h3>
            <ul className="space-y-3">
              {[
                { label: "Registrá tu perfil", href: "/registro/profesional" },
                { label: "Cómo funciona", href: "/como-funciona" },
                { label: "Planes y precios", href: "/planes" },
                { label: "Recursos para pros", href: "/recursos" },
                { label: "Verificación de cédula", href: "/verificacion" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-gray-400 hover:text-[#2563EB] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Soporte */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a2744] mb-4">
              Soporte
            </h3>
            <ul className="space-y-3">
              {[
                { label: "Centro de ayuda", href: "/ayuda" },
                { label: "Contáctanos", href: "/contacto" },
                { label: "Seguridad", href: "/seguridad" },
                { label: "Términos de uso", href: "/terminos" },
                { label: "Privacidad", href: "/privacidad" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-gray-400 hover:text-[#2563EB] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-100 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-300">
            © {new Date().getFullYear()} ContrataCR. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-gray-300">
            <span>🇨🇷</span>
            <span>Hecho con orgullo en Costa Rica</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* Social icons as inline SVG components to avoid extra deps */
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
  { label: "X / Twitter", href: "#", Icon: XIcon },
  { label: "Facebook", href: "#", Icon: FacebookIcon },
  { label: "LinkedIn", href: "#", Icon: LinkedInIcon },
];
