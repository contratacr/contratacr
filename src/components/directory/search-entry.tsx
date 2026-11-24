"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ArrowLeft, ChevronRight, Clock, MapPin, Search, Store, TrendingUp, Utensils, Wrench, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSiteFeatures } from "@/components/site-features";
import { VoiceButton } from "./voice-button";
import { guardarBusquedaReciente, leerBusquedasRecientesConFecha, olvidarBusquedaReciente, readRecentVisits, type RecentVisit } from "@/lib/recent-visits";
import { getCategoryLabel, searchCategories } from "@/lib/data/categories";
import { suggestDirectorySections } from "@/lib/search/directory-search";

/**
 * Search entry of the app home (Yelp "search entry" screen, our colours): back, field with voice, location row,
 * two shortcut chips, recent searches, recently viewed businesses, trending searches; while typing, suggestions.
 * Submit goes to /buscar (service or place results decide themselves). Storage reads/writes are in try/catch inside
 * lib/recent-visits.ts. Trending list is a curated list (no search-volume source exists), never presented as live data.
 */
const TRENDING: { es: string; en: string }[] = [
  { es: "Plomeros", en: "Plumbers" }, { es: "Taller mecánico", en: "Auto repair" }, { es: "Restaurantes nuevos y populares", en: "New and popular restaurants" },
  { es: "Electricistas", en: "Electricians" }, { es: "Mudanzas", en: "Movers" }, { es: "Farmacias abiertas", en: "Open pharmacies" },
  { es: "Limpieza del hogar", en: "House cleaning" }, { es: "Cerrajeros", en: "Locksmiths" },
];

type Suggestion = { key: string; label: string; q: string; mod?: string };

export function buildSuggestions(term: string, kind: "place" | "service", en: boolean): Suggestion[] {
  const t = (es: string, e: string) => (en ? e : es);
  const base: Suggestion[] = [
    { key: "price", label: `${term} - ${t("Precios y disponibilidad", "Prices and availability")}`, q: term },
    { key: "plain", label: term, q: term },
  ];
  const extra: Suggestion[] = kind === "place"
    ? [
        { key: "delivery", label: `${term} - ${t("A domicilio", "Delivery")}`, q: term },
        { key: "takeout", label: `${term} - ${t("Para llevar", "Takeout")}`, q: term, mod: "takeout" },
        { key: "terrace", label: `${term} - ${t("Terraza", "Terrace")}`, q: term },
      ]
    : [
        { key: "install", label: `${term} - ${t("Instalación", "Installation")}`, q: term },
        { key: "repair", label: `${term} - ${t("Reparación", "Repair")}`, q: term },
        { key: "open24", label: `${term} - ${t("Abierto 24 horas", "Open 24 hours")}`, q: term, mod: "open" },
      ];
  return [...base, ...extra];
}

export function SearchEntry({ onClose, initialText = "", autoVoice = false }: { onClose: () => void; initialText?: string; autoVoice?: boolean }) {
  const locale = useLocale();
  const en = locale === "en";
  const t = (es: string, e: string) => (en ? e : es);
  const router = useRouter();
  const { directorySections } = useSiteFeatures();
  const [text, setText] = useState(initialText);
  const [place, setPlace] = useState("");
  // Mounted only after a tap (never server-rendered), so reading the browser storage while initialising is safe.
  const [recents, setRecents] = useState<string[]>(() => leerBusquedasRecientesConFecha().map((r) => r.termino));
  const [visits] = useState<RecentVisit[]>(() => readRecentVisits("profesionales").slice(0, 4));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  const term = text.trim();
  const kind: "place" | "service" = useMemo(() => (term.length >= 3 && suggestDirectorySections(term, directorySections, locale, 1).length > 0 ? "place" : "service"), [term, directorySections, locale]);
  const suggestions = term.length >= 2 ? buildSuggestions(term, kind, en) : [];
  const related = useMemo(() => (term.length >= 2 ? searchCategories(term, locale).slice(0, 5).map((c) => ({ id: c.id, label: getCategoryLabel(c.id, locale) })) : []), [term, locale]);

  const go = (q: string, mod?: string) => {
    const value = q.trim();
    if (!value) return;
    guardarBusquedaReciente(value);
    const params = new URLSearchParams({ q: value });
    if (place.trim()) params.set("ubicacion", place.trim());
    if (mod) params.set("mod", mod);
    router.push(`/buscar?${params.toString()}`);
    onClose();
  };

  const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white px-3.5 text-[14px] font-semibold text-[#162543] hover:border-[#009FD9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Buscar", "Search")} data-search-entry className="fixed inset-0 z-[95] overflow-y-auto overscroll-contain bg-white text-[#162543]">
      <form onSubmit={(e) => { e.preventDefault(); go(text); }} className="sticky top-0 z-10 border-b border-[#e5e9ee] bg-white px-3 pb-3 pt-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onClose} aria-label={t("Volver", "Back")} data-search-back className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-[#d7e1ea] bg-[#f4f7fa] pl-4 pr-1">
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} type="text" enterKeyHint="search" autoComplete="off" maxLength={100} data-search-input
              aria-label={t("Buscar", "Search")} placeholder={t("Escriba o busque con su voz", "Type or search by voice")} className="h-11 min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-[#7a889c]" />
            {text && <button type="button" onClick={() => { setText(""); input.current?.focus(); }} aria-label={t("Borrar", "Clear")} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#5b6b82]"><X className="h-4 w-4" aria-hidden /></button>}
            <VoiceButton lang={locale} label={t("Buscar con su voz", "Search by voice")} autoStart={autoVoice} onText={(v) => { setText(v); go(v); }} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 pl-11">
          <MapPin className="h-[18px] w-[18px] shrink-0 text-[#009FD9]" aria-hidden />
          <span className="shrink-0 text-[14px] font-bold" data-search-current-location>{t("Ubicación actual", "Current location")}</span>
          <span className="text-[#b6c2d1]" aria-hidden>|</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} type="text" autoComplete="off" maxLength={80} aria-label={t("Lugar", "Place")}
            placeholder={t("barrio, ciudad, provincia o código postal", "neighborhood, city, province or postal code")} className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#7a889c]" />
        </div>
      </form>

      <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-3">
        {suggestions.length > 0 ? (
          <div data-search-suggestions>
            <ul>
              {suggestions.map((s) => (
                <li key={s.key}>
                  <button type="button" onClick={() => go(s.q, s.mod)} data-suggestion={s.key} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left text-[15px] font-semibold hover:bg-[#f4f7fa]">
                    <Search className="h-[18px] w-[18px] shrink-0 text-[#009FD9]" aria-hidden /><span className="min-w-0 flex-1 truncate">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {related.length > 0 && (
              <section className="mt-4 border-t border-[#eef2f6] pt-4" data-search-related>
                <h2 className="mb-2 text-[16px] font-extrabold">{t("La gente también busca", "People also search for")}</h2>
                <div className="flex flex-wrap gap-2">
                  {related.map((r) => <button key={r.id} type="button" onClick={() => go(r.label)} className={chip}>{r.label}</button>)}
                </div>
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 pb-2">
              {directorySections.includes("restaurantes") && <Link href="/restaurantes" onClick={onClose} className={chip} data-search-chip="restaurantes"><Utensils className="h-4 w-4 text-[#009FD9]" aria-hidden />{t("Restaurantes", "Restaurants")}</Link>}
              <Link href={`/asistente?q=${encodeURIComponent(t("Necesito ayuda para arreglar ", "I need help fixing "))}`} onClick={onClose} className={chip} data-search-chip="arreglar"><Wrench className="h-4 w-4 text-[#009FD9]" aria-hidden />{t("Necesito ayuda para arreglar", "I need help fixing")}<ChevronRight className="h-4 w-4 text-[#7a889c]" aria-hidden /></Link>
            </div>

            {recents.length > 0 && (
              <section className="mt-4" data-search-recents>
                <h2 className="mb-2 text-[16px] font-extrabold">{t("Búsquedas recientes", "Recent searches")}</h2>
                <div className="flex flex-wrap gap-2">
                  {recents.map((r) => (
                    <span key={r} className={`${chip} pr-1`}>
                      <button type="button" onClick={() => go(r)} className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#7a889c]" aria-hidden />{r}</button>
                      <button type="button" aria-label={t(`Quitar ${r}`, `Remove ${r}`)} onClick={() => { olvidarBusquedaReciente(r); setRecents((l) => l.filter((x) => x !== r)); }} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7a889c]"><X className="h-3.5 w-3.5" aria-hidden /></button>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {visits.length > 0 && (
              <section className="mt-5" data-search-visited>
                <h2 className="mb-1 text-[16px] font-extrabold">{t("Negocios vistos recientemente", "Recently viewed businesses")}</h2>
                <ul>
                  {visits.map((v) => (
                    <li key={v.id}>
                      <Link href={v.href} onClick={onClose} className="flex min-h-14 items-center gap-3 rounded-xl py-1.5 hover:bg-[#f4f7fa]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {v.imagen ? <img src={v.imagen} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EBF5FB] text-[13px] font-extrabold text-[#007fae]">{v.iniciales ?? <Store className="h-5 w-5" aria-hidden />}</span>}
                        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold">{v.titulo}</span>{v.subtitulo && <span className="block truncate text-[13px] text-[#5b6b82]">{v.subtitulo}</span>}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-5" data-search-trending>
              <h2 className="mb-2 text-[16px] font-extrabold">{t("Búsquedas en tendencia", "Trending searches")}</h2>
              <div className="flex flex-wrap gap-2">
                {TRENDING.map((x) => { const label = en ? x.en : x.es; return <button key={x.es} type="button" onClick={() => go(label)} className={chip}><TrendingUp className="h-4 w-4 text-[#009FD9]" aria-hidden />{label}</button>; })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
