import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-[#e5e7eb] bg-white mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#319278]">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-[#111827] text-lg">
                Contrata<span className="text-[#319278]">CR</span>
              </span>
            </div>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              El marketplace de servicios profesionales para Costa Rica.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-sm font-semibold text-[#111827] mb-3">Para clientes</h3>
            <ul className="space-y-2">
              {[
                { label: "Buscar profesionales", href: "/buscar" },
                { label: "Cómo funciona", href: "/como-funciona" },
                { label: "Categorías", href: "/categorias" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#111827] mb-3">Para profesionales</h3>
            <ul className="space-y-2">
              {[
                { label: "Registrar perfil", href: "/registro/profesional" },
                { label: "Cómo funciona", href: "/como-funciona#profesionales" },
                { label: "Planes", href: "/planes" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#111827] mb-3">Empresa</h3>
            <ul className="space-y-2">
              {[
                { label: "Sobre nosotros", href: "/nosotros" },
                { label: "Contacto", href: "/contacto" },
                { label: "Términos de uso", href: "/terminos" },
                { label: "Privacidad", href: "/privacidad" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#e5e7eb] mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[#9ca3af]">
            © 2026 ContrataCR. Todos los derechos reservados.
          </p>
          <p className="text-xs text-[#9ca3af]">
            Hecho con ❤️ en Costa Rica 🇨🇷
          </p>
        </div>
      </div>
    </footer>
  );
}
