"use client";

import { useMemo, useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { ChevronDown, Search, X, MessageSquare } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { SUPPORT_WHATSAPP_URL } from "@/lib/constants";
import { normalizeText } from "@/lib/data/categories";

type Item = { q: string; a: string };
type Group = { key: string; items: Item[] };

const GROUPS: Group[] = [
  {
    key: "Para clientes",
    items: [
      { q: "¿Cuánto cuesta usar ContrataCR?", a: "Es completamente gratis para clientes. Buscar profesionales, publicar proyectos y contactar no tiene ningún costo, y ContrataCR no cobra comisiones." },
      { q: "¿Cómo busco y contacto a un profesional?", a: "Usa el buscador (por servicio, provincia y cantón). Abre el perfil que te interese, revisa sus casos de éxito y reseñas, y solicita el servicio o escríbele directo por WhatsApp para coordinar precio y fecha." },
      { q: "¿Qué es publicar un proyecto?", a: "Es una alternativa a buscar tú mismo: describes lo que necesitas (por ejemplo, “pintura de sala 4×4 m”) y los profesionales de tu zona te envían propuestas con su precio. Tú eliges con quién trabajar." },
      { q: "¿Quién maneja el pago?", a: "El pago lo acuerdan y lo realizan el cliente y el profesional directamente, fuera de la plataforma. ContrataCR no procesa pagos ni cobra comisiones." },
      { q: "¿Qué significa “Identidad verificada”?", a: "Significa que confirmamos la cédula del profesional contra el padrón del TSE y que el nombre coincide con los registros oficiales. Es una señal de confianza, pero no certifica la calidad ni el resultado del trabajo." },
      { q: "¿Cómo dejo una reseña?", a: "Después de completar un servicio, desde tu panel de cliente (sección Solicitudes o Proyectos). Solo quienes recibieron el servicio pueden reseñar, así las reseñas son auténticas." },
      { q: "¿Cómo reporto a un profesional?", a: "Desde su perfil o desde la solicitud puedes reportarlo. Nuestro equipo revisa cada reporte y puede suspender cuentas o retirar la verificación." },
      { q: "¿Mi información personal está segura?", a: "Sí. Tu teléfono y correo nunca se muestran públicamente; el contacto ocurre cuando tú lo inicias (por lo general por WhatsApp). Cumplimos con la Ley 8968 de protección de datos de Costa Rica." },
    ],
  },
  {
    key: "Para profesionales",
    items: [
      { q: "¿Cómo me registro como profesional?", a: "Toca “Registrarse como profesional”. Puedes usar tu correo o Google/Facebook. En unos minutos defines tu profesión, servicios, zona y precios. Es gratis." },
      { q: "¿Cómo verifico mi identidad y obtengo la insignia?", a: "Al registrarte validamos tu cédula contra el padrón del TSE. Si coincide, obtienes la insignia “Identidad verificada” al instante. Si no pasa automáticamente, puedes apelar desde tu panel." },
      { q: "¿Cómo recibo clientes?", a: "Apareces en las búsquedas de tu cantón para tu categoría. Recibes solicitudes y, si publicaste proyectos relevantes, puedes enviar propuestas. Coordinas todo por WhatsApp." },
      { q: "¿Cómo publico mis horarios?", a: "En tu panel, sección Disponibilidad, generas tus horarios por servicio y ubicación. También puedes mantener tu disponibilidad privada y atender solo por WhatsApp." },
      { q: "¿ContrataCR cobra comisión?", a: "No. El perfil es gratis y no cobramos comisiones ni mensualidades. Te quedas con el 100% de lo que cobras." },
      { q: "¿Cómo respondo a un proyecto?", a: "En tu panel ves los proyectos abiertos de tu categoría y zona. Envías una propuesta con tu precio y disponibilidad; si el cliente la acepta, coordinan directamente." },
    ],
  },
  {
    key: "Cuenta y seguridad",
    items: [
      { q: "¿ContrataCR garantiza el trabajo?", a: "No. ContrataCR es una plataforma intermediaria que conecta clientes con profesionales verificados; el servicio lo acuerdan y ejecutan las dos partes. Por eso la verificación de identidad y las reseñas son tan importantes." },
      { q: "¿Cómo cierro o desactivo mi cuenta?", a: "Desde tu panel, en tu perfil, puedes desactivar tu cuenta. Es reversible: vuelves a activarla iniciando sesión. Mientras esté desactivada no apareces en las búsquedas." },
      { q: "¿Cómo cambio mi contraseña?", a: "Si olvidaste tu contraseña, usa “¿Olvidaste tu contraseña?” en el inicio de sesión y te enviamos un enlace para crear una nueva." },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.key })));

function FaqItem({ item, id, open, onToggle }: { item: Item; id: string; open: boolean; onToggle: (id: string) => void }) {
  return (
    <div>
      <button onClick={() => onToggle(id)} aria-expanded={open} className="w-full flex items-center justify-between py-4 text-left gap-4 group">
        <span className="text-[15px] font-semibold text-[#111827] group-hover:text-[#009FD9] transition-colors">{item.q}</span>
        <ChevronDown className={`h-5 w-5 text-[#9ca3af] shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-[#009FD9]" : ""}`} />
      </button>
      {open && <p className="pb-4 -mt-1 text-sm text-[#6b7280] leading-relaxed">{item.a}</p>}
    </div>
  );
}

export default function AyudaPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = normalizeText(query.trim());
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  const matches = useMemo(
    () => (q ? ALL.filter((it) => normalizeText(`${it.q} ${it.a}`).includes(q)) : null),
    [q]
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero + search */}
      <section className="relative overflow-hidden pt-32 pb-10 text-center px-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
        <FadeInUp>
          <span className="relative inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">Centro de ayuda</span>
          <h1 className="relative text-4xl sm:text-5xl font-extrabold text-[#111827] mb-4 leading-tight">¿En qué te podemos ayudar?</h1>
          <p className="relative text-lg text-[#6b7280] max-w-lg mx-auto mb-8">Busca tu pregunta o explora por tema.</p>
          <div className="relative mx-auto max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9ca3af] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca una pregunta… ej. reseñas, verificación, pago"
              className="w-full rounded-2xl border border-[#e5e7eb] bg-white py-3.5 pl-12 pr-11 text-base text-[#111827] placeholder:text-[#9ca3af] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Limpiar" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </FadeInUp>
      </section>

      {/* FAQ */}
      <section className="pb-16 px-4 bg-white">
        <div className="mx-auto max-w-3xl">
          {matches ? (
            matches.length > 0 ? (
              <>
                <p className="text-sm text-[#6b7280] mb-2">{matches.length} {matches.length === 1 ? "resultado" : "resultados"} para “{query}”</p>
                <div className="divide-y divide-[#f3f4f6] rounded-2xl border border-[#e5e7eb] bg-white px-5">
                  {matches.map((it, i) => (
                    <FaqItem key={`m-${i}`} item={it} id={`m-${i}`} open={open === `m-${i}`} onToggle={toggle} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 rounded-2xl border border-dashed border-[#d1d5db] bg-[#f9fafb]">
                <p className="text-[#374151] font-medium">No encontramos resultados para “{query}”.</p>
                <p className="text-sm text-[#9ca3af] mt-1">Prueba con otra palabra o contáctanos más abajo.</p>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-8">
              {GROUPS.map((group) => (
                <FadeInUp key={group.key}>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-[#009FD9] mb-3">{group.key}</h2>
                  <div className="divide-y divide-[#f3f4f6] rounded-2xl border border-[#e5e7eb] bg-white px-5">
                    {group.items.map((it, i) => {
                      const id = `${group.key}-${i}`;
                      return <FaqItem key={id} item={it} id={id} open={open === id} onToggle={toggle} />;
                    })}
                  </div>
                </FadeInUp>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact */}
      <section className="py-14 px-4 bg-[#f9fafb]">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <div className="bg-white rounded-2xl border border-[#e5e7eb] p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-[#111827] mb-1">¿No encontraste lo que buscas?</h2>
                <p className="text-sm text-[#6b7280]">Abre un ticket y nuestro equipo te responde, o escríbenos por WhatsApp para algo urgente.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
                <Link href="/soporte" className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-xl transition-all text-sm whitespace-nowrap">
                  <MessageSquare className="h-4 w-4" /> Contactar soporte
                </Link>
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1db954] text-white font-bold px-6 py-3 rounded-xl transition-all text-sm whitespace-nowrap">
                  <WhatsAppIcon className="h-4 w-4" /> WhatsApp
                </a>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
