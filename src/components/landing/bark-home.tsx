"use client";

import { useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Search, MapPin, ChevronLeft, ChevronRight } from "lucide-react";

/* ───────────────────────── data ─────────────────────────
   ContrataCR categories paired with photography, in the spirit of a clean
   service-directory home. Images are Unsplash (allowed in next.config). */

const PROVINCES = [
  "San José", "Alajuela", "Cartago", "Heredia",
  "Guanacaste", "Puntarenas", "Limón",
];

type Cat = { id: string; label: string; photo: string; online?: boolean };

// Unsplash photo id → cropped URL
const img = (id: string, w = 640, h = 430) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;

const C = {
  limpieza:        { id: "limpieza",               label: "Limpieza del hogar",   photo: "1581578731548-c64695cc6952" },
  jardineria:      { id: "jardineria",             label: "Jardinería",           photo: "1416879595882-3373a0480b5b" },
  pintura:         { id: "pintura",                label: "Pintura",              photo: "1562259949-e8e7689d7828" },
  plomeria:        { id: "plomeria",               label: "Plomería",             photo: "1607472586893-edb57bdc0e39" },
  carpinteria:     { id: "carpinteria",            label: "Carpintería",          photo: "1504148455328-c376907d081c" },
  cerrajeria:      { id: "cerrajeria",             label: "Cerrajería",           photo: "1582139329536-e7284fece509" },
  entrenamiento:   { id: "entrenamiento_personal", label: "Entrenamiento personal", photo: "1571019613454-1cb2f99b2d8b", online: true },
  psicologia:      { id: "psicologia",             label: "Psicología y terapia", photo: "1573497019940-1c28c88b4f3e", online: true },
  masajes:         { id: "masajes",                label: "Masajes terapéuticos", photo: "1600334089648-b0d9d3028eb2" },
  peluqueria:      { id: "peluqueria",             label: "Peluquería y barbería", photo: "1560066984-138dadb4c035" },
  foto_eventos:    { id: "fotografia_eventos",     label: "Fotografía de eventos", photo: "1519741497674-611481863552" },
  dj:              { id: "dj_sonido",              label: "DJ y sonido",          photo: "1493676304819-0d7a8d026dcf" },
  fotografia:      { id: "fotografia",             label: "Fotografía profesional", photo: "1452587925148-ce544e77e70d" },
  web:             { id: "desarrollo_web",         label: "Diseño web",           photo: "1467232004584-a241de8bcf5d", online: true },
  contabilidad:    { id: "contabilidad",           label: "Contabilidad",         photo: "1554224155-6726b3ff858f", online: true },
  marketing:       { id: "marketing_digital",      label: "Marketing digital",    photo: "1460925895917-afdab827c52f", online: true },
  mudanzas:        { id: "mudanzas",               label: "Mudanzas",             photo: "1600518464441-9154a4dea21b" },
} satisfies Record<string, Cat>;

const MARQUEE: Cat[] = [
  C.limpieza, C.web, C.jardineria, C.contabilidad, C.masajes, C.entrenamiento,
  C.plomeria, C.pintura, C.peluqueria, C.foto_eventos, C.marketing, C.carpinteria,
];

const SECTIONS: { title: string; items: Cat[] }[] = [
  { title: "Hogar y jardín",       items: [C.jardineria, C.limpieza, C.pintura] },
  { title: "Salud y bienestar",    items: [C.entrenamiento, C.psicologia, C.masajes] },
  { title: "Bodas y eventos",      items: [C.foto_eventos, C.dj, C.fotografia] },
  { title: "Servicios para empresas", items: [C.web, C.contabilidad, C.marketing] },
];

const POPULAR: Cat[] = [
  C.limpieza, C.jardineria, C.entrenamiento, C.plomeria,
  C.peluqueria, C.cerrajeria, C.mudanzas, C.carpinteria,
];

/* ───────────────────────── cards ───────────────────────── */

// Section / popular card — label below the image (Bark style)
function ServiceCard({ cat, className = "" }: { cat: Cat; className?: string }) {
  return (
    <Link href={`/buscar?categoria=${cat.id}`} className={`group block ${className}`}>
      <div className="relative aspect-[3/2] rounded-xl overflow-hidden bg-[#EBF5FB]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img(cat.photo)}
          alt={cat.label}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {cat.online && (
          <span className="absolute top-3 right-3 bg-[#009FD9] text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm">
            Disponible en línea
          </span>
        )}
      </div>
      <p className="mt-3 font-semibold text-[#1a2744] group-hover:text-[#009FD9] transition-colors">
        {cat.label}
      </p>
    </Link>
  );
}

// Marquee card — label overlaid on the image
function MarqueeCard({ cat }: { cat: Cat }) {
  return (
    <Link
      href={`/buscar?categoria=${cat.id}`}
      className="relative block w-[240px] sm:w-[280px] shrink-0 aspect-[3/2] rounded-xl overflow-hidden group"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img(cat.photo)}
        alt={cat.label}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      {cat.online && (
        <span className="absolute top-3 right-3 bg-[#009FD9] text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm">
          Disponible en línea
        </span>
      )}
      <p className="absolute bottom-3 left-4 right-4 text-white font-semibold drop-shadow">
        {cat.label}
      </p>
    </Link>
  );
}

/* ───────────────────────── page ───────────────────────── */

export function BarkHome() {
  const router = useRouter();
  const [service, setService] = useState("");
  const [province, setProvince] = useState("");
  const popularRef = useRef<HTMLDivElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (service.trim()) params.set("q", service.trim());
    if (province) params.set("provincia", province);
    router.push(`/buscar?${params.toString()}`);
  }

  function scrollPopular(dir: 1 | -1) {
    popularRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  return (
    <main className="bg-white">
      <style>{`
        @keyframes barkMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .bark-marquee-track { animation: barkMarquee 55s linear infinite; }
        .bark-marquee:hover .bark-marquee-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .bark-marquee-track { animation: none; } }
      `}</style>

      {/* ── Hero ── */}
      <section className="px-4 pt-28 sm:pt-32 pb-10">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold text-[#1a2744] leading-[1.05] tracking-tight">
            Encontrá al profesional
            <br className="hidden sm:block" /> perfecto para vos
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-400">
            Recibí cotizaciones gratis en minutos
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="mt-8 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:bg-white sm:border sm:border-gray-200 sm:rounded-lg sm:shadow-sm sm:p-1.5">
              <div className="flex items-center gap-2 flex-1 h-12 bg-white border border-gray-200 sm:border-0 rounded-lg sm:rounded-none px-4">
                <Search className="h-5 w-5 text-gray-300 shrink-0 sm:hidden" />
                <input
                  type="text"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="¿Qué servicio buscás?"
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                />
              </div>
              <div className="hidden sm:block w-px h-7 bg-gray-200 shrink-0" />
              <div className="flex items-center gap-2 sm:min-w-[180px] h-12 bg-white border border-gray-200 sm:border-0 rounded-lg sm:rounded-none px-4">
                <MapPin className="h-5 w-5 text-gray-300 shrink-0" />
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="flex-1 text-base text-gray-500 bg-transparent focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="">Provincia</option>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button
                type="submit"
                className="h-12 sm:h-11 px-8 bg-[#009FD9] hover:bg-[#0089bb] text-white text-base font-bold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Buscar
              </button>
            </div>
          </form>

          <p className="mt-3 text-sm text-gray-400">
            Popular:{" "}
            {[C.limpieza, C.web, C.entrenamiento].map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/buscar?categoria=${c.id}`} className="text-gray-500 hover:text-[#009FD9] transition-colors">
                  {c.label}
                </Link>
              </span>
            ))}
          </p>
        </div>

        {/* Sentinel — the navbar reveals its compact search once this scrolls out */}
        <div id="hero-search-sentinel" aria-hidden className="h-0" />
      </section>

      {/* ── Auto-scrolling category marquee ── */}
      <section className="pb-16 sm:pb-20 overflow-hidden">
        <div className="bark-marquee relative">
          <div className="bark-marquee-track flex gap-4 w-max px-2">
            {[...MARQUEE, ...MARQUEE].map((cat, i) => (
              <MarqueeCard key={`${cat.id}-${i}`} cat={cat} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Grouped sections ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {SECTIONS.map((section) => (
          <section key={section.title} className="pb-14 sm:pb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#1a2744]">{section.title}</h2>
              <Link href="/categorias" className="text-sm font-semibold text-gray-400 hover:text-[#009FD9] transition-colors">
                Ver todas
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
              {section.items.map((cat) => <ServiceCard key={cat.id} cat={cat} />)}
            </div>
          </section>
        ))}

        {/* ── Most-popular carousel with arrows ── */}
        <section className="pb-20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#1a2744]">Categorías más populares</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollPopular(-1)}
                aria-label="Anterior"
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-gray-100 text-[#1a2744] hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => scrollPopular(1)}
                aria-label="Siguiente"
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-gray-100 text-[#009FD9] hover:bg-gray-200 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            ref={popularRef}
            className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {POPULAR.map((cat) => (
              <ServiceCard key={cat.id} cat={cat} className="w-[240px] sm:w-[280px] shrink-0" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
