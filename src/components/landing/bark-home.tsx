"use client";

import { useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Search, MapPin, X } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { normalizeText } from "@/lib/data/categories";

/* ───────────────────────── data ─────────────────────────
   ContrataCR categories paired with authentic photography, in the spirit of a
   clean service directory. Photos are Unsplash (allowed in next.config). */

type Cat = { id: string; label: string; photo: string };

// Unsplash photo id → cropped URL
const img = (id: string, w = 480, h = 360) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;

const C = {
  limpieza:      { id: "limpieza",               label: "Limpieza del hogar",     photo: "1581578731548-c64695cc6952" },
  jardineria:    { id: "jardineria",             label: "Jardinería",             photo: "1416879595882-3373a0480b5b" },
  pintura:       { id: "pintura",                label: "Pintura",                photo: "1562259949-e8e7689d7828" },
  plomeria:      { id: "plomeria",               label: "Plomería",               photo: "1607472586893-edb57bdc0e39" },
  carpinteria:   { id: "carpinteria",            label: "Carpintería",            photo: "1504148455328-c376907d081c" },
  cerrajeria:    { id: "cerrajeria",             label: "Cerrajería",             photo: "1582139329536-e7284fece509" },
  entrenamiento: { id: "entrenamiento_personal", label: "Entrenamiento personal", photo: "1571019613454-1cb2f99b2d8b" },
  psicologia:    { id: "psicologia",             label: "Psicología y terapia",   photo: "1573497019940-1c28c88b4f3e" },
  masajes:       { id: "masajes",                label: "Masajes terapéuticos",   photo: "1600334089648-b0d9d3028eb2" },
  peluqueria:    { id: "peluqueria",             label: "Peluquería y barbería",  photo: "1560066984-138dadb4c035" },
  foto_eventos:  { id: "fotografia_eventos",     label: "Fotografía de eventos",  photo: "1519741497674-611481863552" },
  dj:            { id: "dj_sonido",              label: "DJ y sonido",            photo: "1493676304819-0d7a8d026dcf" },
  fotografia:    { id: "fotografia",             label: "Fotografía profesional", photo: "1452587925148-ce544e77e70d" },
  web:           { id: "desarrollo_web",         label: "Diseño web",             photo: "1467232004584-a241de8bcf5d" },
  contabilidad:  { id: "contabilidad",           label: "Contabilidad",           photo: "1554224155-6726b3ff858f" },
  marketing:     { id: "marketing_digital",      label: "Marketing digital",      photo: "1460925895917-afdab827c52f" },
  mudanzas:      { id: "mudanzas",               label: "Mudanzas",               photo: "1600518464441-9154a4dea21b" },
} satisfies Record<string, Cat>;

// Two bands that drift in opposite directions (slow, continuous)
const ROW_TOP: Cat[] = [
  C.limpieza, C.web, C.jardineria, C.contabilidad, C.masajes, C.entrenamiento, C.plomeria, C.peluqueria,
];
const ROW_BOTTOM: Cat[] = [
  C.foto_eventos, C.marketing, C.carpinteria, C.psicologia, C.mudanzas, C.pintura, C.dj, C.cerrajeria,
];

const SECTIONS: { title: string; items: Cat[] }[] = [
  { title: "Hogar y jardín",          items: [C.jardineria, C.limpieza, C.pintura] },
  { title: "Salud y bienestar",       items: [C.entrenamiento, C.psicologia, C.masajes] },
  { title: "Bodas y eventos",         items: [C.foto_eventos, C.dj, C.fotografia] },
  { title: "Servicios para empresas", items: [C.web, C.contabilidad, C.marketing] },
];

const POPULAR_LINKS: Cat[] = [C.limpieza, C.web, C.entrenamiento];

/* ── Location autocomplete options (provinces + cantons) ── */
type Loc = { label: string; provincia: string; canton?: string };
const LOCATIONS: Loc[] = [
  ...PROVINCES.map((p) => ({ label: p.name, provincia: p.name })),
  ...PROVINCES.flatMap((p) =>
    p.cantons.map((c) => ({ label: `${c.name}, ${p.name}`, provincia: p.name, canton: c.name }))
  ),
];

/* ───────────────────────── uniform card ─────────────────────────
   Every category card on the home uses THIS exact design + hover. */
function ServiceCard({ cat, className = "" }: { cat: Cat; className?: string }) {
  return (
    <Link href={`/buscar?categoria=${cat.id}`} className={`group block ${className}`}>
      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[#EBF5FB]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img(cat.photo)}
          alt={cat.label}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      </div>
      <p className="mt-2.5 text-sm font-semibold text-[#1a2744] group-hover:text-[#009FD9] transition-colors">
        {cat.label}
      </p>
    </Link>
  );
}

/* ───────────────────────── page ───────────────────────── */
export function BarkHome() {
  const router = useRouter();
  const [service, setService] = useState("");
  const [locText, setLocText] = useState("");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [openLoc, setOpenLoc] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const suggestions = useMemo(() => {
    const q = normalizeText(locText.trim());
    if (!q) return [];
    return LOCATIONS.filter((l) => normalizeText(l.label).includes(q)).slice(0, 7);
  }, [locText]);

  function pickLoc(l: Loc) {
    setLoc(l);
    setLocText(l.label);
    setOpenLoc(false);
    setActiveIdx(-1);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (service.trim()) params.set("q", service.trim());
    if (loc) {
      params.set("provincia", loc.provincia);
      if (loc.canton) params.set("canton", loc.canton);
    }
    router.push(`/buscar?${params.toString()}`);
  }

  function onLocKeyDown(e: React.KeyboardEvent) {
    if (!openLoc || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pickLoc(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setOpenLoc(false); }
  }

  return (
    <main className="bg-white">
      <style>{`
        @keyframes barkLeft  { from { transform: translateX(0);    } to { transform: translateX(-50%); } }
        @keyframes barkRight { from { transform: translateX(-50%); } to { transform: translateX(0);    } }
        .bark-track { display: flex; gap: 1rem; width: max-content; will-change: transform; }
        .bark-track-l { animation: barkLeft  72s linear infinite; }
        .bark-track-r { animation: barkRight 86s linear infinite; }
        .bark-band:hover .bark-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .bark-track { animation: none !important; } }
      `}</style>

      {/* ── Hero ── */}
      <section className="px-4 pt-28 sm:pt-32 pb-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold text-[#1a2744] leading-[1.05] tracking-tight">
            Encuentra al profesional
            <br className="hidden sm:block" /> perfecto para ti
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-400">
            Recibe cotizaciones gratis en minutos
          </p>

          {/* Search: service + location autocomplete + Buscar */}
          <form onSubmit={handleSearch} className="mt-8 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:bg-white sm:border sm:border-gray-200 sm:rounded-lg sm:shadow-sm sm:p-1.5">
              {/* Service */}
              <div className="flex items-center gap-2 flex-1 h-12 bg-white border border-gray-200 sm:border-0 rounded-lg sm:rounded-none px-4">
                <Search className="h-5 w-5 text-gray-300 shrink-0 sm:hidden" />
                <input
                  type="text"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="¿Qué servicio buscas?"
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                />
              </div>

              <div className="hidden sm:block w-px h-7 bg-gray-200 shrink-0" />

              {/* Location with autocomplete */}
              <div className="relative flex items-center gap-2 sm:min-w-[220px] h-12 bg-white border border-gray-200 sm:border-0 rounded-lg sm:rounded-none px-4">
                <MapPin className="h-5 w-5 text-gray-300 shrink-0" />
                <input
                  type="text"
                  value={locText}
                  onChange={(e) => { setLocText(e.target.value); setLoc(null); setOpenLoc(true); setActiveIdx(-1); }}
                  onFocus={() => { if (suggestions.length) setOpenLoc(true); }}
                  onBlur={() => setTimeout(() => setOpenLoc(false), 120)}
                  onKeyDown={onLocKeyDown}
                  placeholder="Provincia o cantón"
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openLoc}
                  aria-autocomplete="list"
                />
                {locText && (
                  <button type="button" aria-label="Limpiar" onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setLocText(""); setLoc(null); setOpenLoc(false); }}
                    className="text-gray-300 hover:text-gray-500 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {openLoc && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 text-left">
                    {suggestions.map((l, i) => (
                      <button
                        key={l.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickLoc(l)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${i === activeIdx ? "bg-[#EBF5FB]" : "hover:bg-gray-50"}`}
                      >
                        <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                        <span className="text-sm text-[#111827] truncate">{l.label}</span>
                      </button>
                    ))}
                  </div>
                )}
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
            {POPULAR_LINKS.map((c, i) => (
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

      {/* ── Two category bands, drifting in opposite directions ── */}
      <section className="bark-band pb-16 sm:pb-20 space-y-4 overflow-hidden">
        <div className="overflow-hidden">
          <div className="bark-track bark-track-l px-2">
            {[...ROW_TOP, ...ROW_TOP].map((cat, i) => (
              <ServiceCard key={`t-${cat.id}-${i}`} cat={cat} className="w-[200px] sm:w-[230px] shrink-0" />
            ))}
          </div>
        </div>
        <div className="overflow-hidden">
          <div className="bark-track bark-track-r px-2">
            {[...ROW_BOTTOM, ...ROW_BOTTOM].map((cat, i) => (
              <ServiceCard key={`b-${cat.id}-${i}`} cat={cat} className="w-[200px] sm:w-[230px] shrink-0" />
            ))}
          </div>
        </div>
      </section>

      {/* ── Grouped service sections ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {SECTIONS.map((section) => (
          <section key={section.title} className="pb-14 sm:pb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#1a2744]">{section.title}</h2>
              <Link href="/categorias" className="text-sm font-semibold text-gray-400 hover:text-[#009FD9] transition-colors">
                Ver todas
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 sm:gap-6">
              {section.items.map((cat) => <ServiceCard key={cat.id} cat={cat} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
