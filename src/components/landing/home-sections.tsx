import { Link } from "@/i18n/navigation";
import { Search, Star, ShieldCheck, MapPin, Link2, ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/* ───────────────────────── Popular categories ─────────────────────────
   A clean, icon-based grid (no stock photos) — each tile opens /buscar
   pre-filtered by that category. */
const POPULAR: { id: string; label: string; emoji: string }[] = [
  { id: "plomeria", label: "Plomería", emoji: "🔧" },
  { id: "electricidad", label: "Electricidad", emoji: "⚡" },
  { id: "limpieza", label: "Limpieza", emoji: "🧹" },
  { id: "pintura", label: "Pintura", emoji: "🎨" },
  { id: "jardineria", label: "Jardinería", emoji: "🌿" },
  { id: "carpinteria", label: "Carpintería", emoji: "🪚" },
  { id: "aire_acondicionado", label: "Aire acondicionado", emoji: "❄️" },
  { id: "cerrajeria", label: "Cerrajería", emoji: "🔑" },
  { id: "mudanzas", label: "Mudanzas", emoji: "📦" },
  { id: "cuidado_infantil", label: "Niñera", emoji: "👶" },
  { id: "fotografia", label: "Fotografía", emoji: "📷" },
  { id: "peluqueria", label: "Peluquería", emoji: "💇" },
];

export function PopularCategories() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Servicios populares</h2>
            <p className="text-[#6b7280] mt-1 text-sm sm:text-base">Encuentra al profesional que necesitas, listo para ayudarte.</p>
          </div>
          <Link href="/categorias" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-[#009FD9] hover:underline shrink-0">
            Ver todas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {POPULAR.map((c) => (
            <Link
              key={c.id}
              href={`/buscar?categoria=${c.id}`}
              className="group flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 text-center hover:border-[#009FD9] hover:shadow-md transition-all duration-200"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB] text-2xl transition-transform duration-200 group-hover:scale-105">{c.emoji}</span>
              <span className="text-sm font-medium text-[#374151]">{c.label}</span>
            </Link>
          ))}
        </div>

        <Link href="/categorias" className="sm:hidden mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[#009FD9]">
          Ver todas las categorías <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

/* ───────────────────────── How it works (3 steps) ───────────────────── */
export function HowItWorks() {
  const steps = [
    { n: "1", icon: <Search className="h-5 w-5" />, title: "Busca el servicio", desc: "Escribe lo que necesitas y tu zona. Te mostramos profesionales cerca de ti." },
    { n: "2", icon: <Star className="h-5 w-5" />, title: "Elige tu profesional", desc: "Compara perfiles con identidad verificada, precios y reseñas reales." },
    { n: "3", icon: <WhatsAppIcon className="h-5 w-5" />, title: "Coordina directo", desc: "Acuerdan precio y fecha por WhatsApp, sin intermediarios." },
  ];
  return (
    <section className="py-16 sm:py-20 bg-[#f9fafb]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Así de fácil</h2>
          <p className="text-[#6b7280] mt-2">Encontrar y solicitar un servicio toma solo unos minutos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-[#e5e7eb] bg-white p-6 pt-7 text-center">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-[#009FD9] text-white text-sm font-bold shadow">{s.n}</span>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{s.icon}</div>
              <h3 className="font-semibold text-[#111827] mb-1.5">{s.title}</h3>
              <p className="text-sm text-[#6b7280] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Why ContrataCR (trust) ──────────────────── */
export function WhyContrataCR() {
  const items = [
    { icon: <ShieldCheck className="h-5 w-5" />, title: "Identidad verificada", desc: "Confirmamos la cédula de cada profesional contra el padrón (TSE) antes de mostrar la insignia de verificación." },
    { icon: <Link2 className="h-5 w-5" />, title: "Sin intermediarios", desc: "ContrataCR te conecta con el profesional. Coordinan y acuerdan el pago directamente, sin comisiones de por medio." },
    { icon: <Star className="h-5 w-5" />, title: "Reseñas reales", desc: "Solo quienes recibieron el servicio pueden dejar una reseña. La reputación funciona en ambas direcciones." },
    { icon: <MapPin className="h-5 w-5" />, title: "En todo el país", desc: "Profesionales en las 7 provincias, listos para atender en tu cantón." },
  ];
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Por qué ContrataCR</h2>
          <p className="text-[#6b7280] mt-2 max-w-xl mx-auto">Hecho en Costa Rica para que contratar un servicio sea simple, directo y confiable.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((it) => (
            <div key={it.title} className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{it.icon}</div>
              <h3 className="font-semibold text-[#111827] mb-1.5">{it.title}</h3>
              <p className="text-sm text-[#6b7280] leading-relaxed">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
