"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { Link } from "@/i18n/navigation";
import {
  ChevronDown, Search, FileText, ShieldCheck, Star, Link2,
  UserPlus, BadgeCheck, ArrowRight,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/* ── FAQ ── */
const FAQ_ITEMS = [
  {
    q: "¿Es gratis buscar profesionales?",
    a: "Sí, completamente gratis para clientes. Puedes buscar, comparar y contactar profesionales sin pagar nada.",
  },
  {
    q: "¿Cómo verifican a los profesionales?",
    a: "Confirmamos la cédula de cada profesional contra el padrón del Registro Civil (TSE). La insignia de identidad verificada solo aparece cuando esa confirmación es correcta.",
  },
  {
    q: "¿Quién maneja el pago?",
    a: "El pago lo acuerdan y lo hacen el cliente y el profesional directamente, fuera de la plataforma. ContrataCR no cobra comisiones ni intermedia el dinero.",
  },
  {
    q: "¿ContrataCR garantiza el trabajo?",
    a: "ContrataCR es un punto de encuentro: te conectamos con profesionales verificados, pero el servicio lo acuerdan y ejecutan las dos partes. Por eso las reseñas y la verificación de identidad son importantes.",
  },
  {
    q: "¿Cómo funcionan las reseñas?",
    a: "Solo quienes recibieron un servicio pueden dejar una reseña, y la reputación funciona en ambas direcciones: los clientes reseñan a los profesionales y los profesionales pueden reportar a un cliente.",
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-[#f3f4f6] rounded-2xl border border-[#e5e7eb] bg-white px-5">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left gap-4 group"
            aria-expanded={open === i}
          >
            <span className="text-base font-semibold text-[#111827] group-hover:text-[#009FD9] transition-colors">
              {item.q}
            </span>
            <ChevronDown className={`h-5 w-5 text-[#9ca3af] shrink-0 transition-transform duration-200 ${open === i ? "rotate-180 text-[#009FD9]" : ""}`} />
          </button>
          {open === i && <p className="pb-5 -mt-1 text-sm text-[#6b7280] leading-relaxed">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

/* ── Numbered step ── */
function Step({ n, icon, title, desc }: { n: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="relative rounded-2xl border border-[#e5e7eb] bg-white p-6 pt-7">
      <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-[#009FD9] text-white text-sm font-bold shadow">{n}</span>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{icon}</div>
      <h3 className="font-semibold text-[#111827] mb-1.5">{title}</h3>
      <p className="text-sm text-[#6b7280] leading-relaxed">{desc}</p>
    </div>
  );
}

export default function ComoFuncionaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-16 text-center px-4 bg-white">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Cómo funciona
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#111827] mb-4 leading-tight">
            Contratar un servicio,<br className="hidden sm:block" /> simple y directo
          </h1>
          <p className="text-lg text-[#6b7280] max-w-2xl mx-auto">
            ContrataCR conecta a clientes con profesionales verificados de Costa Rica. Sin intermediarios y sin comisiones: tú coordinas directo con el profesional.
          </p>
        </FadeInUp>
      </section>

      {/* ── Para clientes ── */}
      <section className="py-16 sm:py-20 px-4 bg-white">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] mb-2">Para clientes</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Encuentra y solicita en 3 pasos</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Step n={1} icon={<Search className="h-5 w-5" />} title="Busca el servicio" desc="Escribe lo que necesitas y filtra por provincia y cantón para ver profesionales cerca de ti." />
              <Step n={2} icon={<ShieldCheck className="h-5 w-5" />} title="Elige con confianza" desc="Compara perfiles con identidad verificada, casos de éxito, precios y reseñas reales." />
              <Step n={3} icon={<WhatsAppIcon className="h-5 w-5" />} title="Coordina por WhatsApp" desc="Acuerdan precio, fecha y horario directamente. Sin intermediarios y sin comisiones." />
            </div>

            {/* Two ways to start */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              <Link href="/buscar" className="group flex items-start gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-6 hover:border-[#009FD9] hover:shadow-md transition-all">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]"><Search className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#111827]">Busca un profesional</p>
                  <p className="text-sm text-[#6b7280] mt-0.5">Explora perfiles y agenda directamente.</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#009FD9]">Ver profesionales <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </Link>
              <Link href="/publicar-proyecto" className="group flex items-start gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-6 hover:border-[#009FD9] hover:shadow-md transition-all">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#111827]">Publica tu proyecto</p>
                  <p className="text-sm text-[#6b7280] mt-0.5">Describe lo que necesitas y recibe propuestas.</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#009FD9]">Publicar proyecto <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </Link>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* ── Para profesionales ── */}
      <section className="py-16 sm:py-20 px-4 bg-[#EBF5FB]">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] mb-2">Para profesionales</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Recibe clientes en 3 pasos</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Step n={1} icon={<UserPlus className="h-5 w-5" />} title="Crea tu perfil gratis" desc="Tu profesión, servicios, zona de cobertura, precios y casos de éxito. Toma unos minutos." />
              <Step n={2} icon={<BadgeCheck className="h-5 w-5" />} title="Verifica tu identidad" desc="Confirmamos tu cédula contra el padrón (TSE) y obtienes la insignia de identidad verificada que genera confianza." />
              <Step n={3} icon={<Star className="h-5 w-5" />} title="Recibe clientes" desc="Apareces en las búsquedas de tu cantón, recibes solicitudes y respondes proyectos. Coordinas todo por WhatsApp." />
            </div>
            <div className="mt-10 text-center">
              <SmartRegisterLink className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-8 py-3.5 rounded-2xl transition-colors shadow-sm">
                Registra tu perfil gratis <ArrowRight className="h-4 w-4" />
              </SmartRegisterLink>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* ── Confianza ── */}
      <section className="py-16 sm:py-20 px-4 bg-white">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Pensado para la confianza</h2>
              <p className="text-[#6b7280] mt-2 max-w-xl mx-auto">Tres cosas que hacen que contratar (y ser contratado) sea más seguro.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { icon: <ShieldCheck className="h-5 w-5" />, title: "Identidad verificada", desc: "Validamos la cédula contra el padrón del TSE antes de mostrar la insignia. Sabes con quién estás tratando." },
                { icon: <Link2 className="h-5 w-5" />, title: "Sin intermediarios", desc: "ContrataCR conecta; no garantiza resultados ni cobra comisiones. El acuerdo y el pago son directos entre las dos partes." },
                { icon: <Star className="h-5 w-5" />, title: "Reseñas en ambas vías", desc: "Solo quienes recibieron el servicio reseñan, y los profesionales también pueden reportar a un cliente." },
              ].map((c) => (
                <div key={c.title} className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{c.icon}</div>
                  <h3 className="font-semibold text-[#111827] mb-1.5">{c.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20 px-4 bg-[#f9fafb]">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-2 text-center">Preguntas frecuentes</h2>
            <p className="text-[#6b7280] text-center mb-10">Las dudas más comunes sobre ContrataCR.</p>
            <FaqAccordion />
          </FadeInUp>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 bg-[#1a2744] text-center">
        <FadeInUp>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">¿Listo para empezar?</h2>
          <p className="text-[#93c5fd] mb-8 max-w-md mx-auto text-sm">Busca un profesional verificado o publica tu proyecto gratis.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/buscar" className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-7 py-3 rounded-2xl transition-all">
              <Search className="h-4 w-4" /> Buscar profesionales
            </Link>
            <Link href="/publicar-proyecto" className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-7 py-3 rounded-2xl transition-all border border-white/20">
              <FileText className="h-4 w-4" /> Publicar mi proyecto
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}
