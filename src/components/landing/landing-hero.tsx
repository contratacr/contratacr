"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, User } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { SearchSuggestion } from "@/app/api/search/suggestions/route";
import { searchLocations, resolveLocation, type LocationSuggestion } from "@/lib/data/location-search";

const ROTATING_LINES: Record<string, string[]> = {
  es: ["Plomería,", "Electricidad,", "Limpieza,", "Jardinería,", "Pintura,", "Niñera,", "Mudanzas,", "Fumigación,"],
  en: ["Plumbing,", "Electrical,", "Cleaning,", "Gardening,", "Painting,", "Babysitting,", "Moving,", "Pest control,"],
};

const POPULAR_TAGS: Record<string, string[]> = {
  es: ["Plomería", "Electricidad", "Limpieza", "Pintura", "Jardinería", "Mudanzas"],
  en: ["Plumbing", "Electrical", "Cleaning", "Painting", "Gardening", "Moving"],
};

/* ── Hero image — ONE easy-to-swap asset shown in the dome. ──
   Replace `src` (and `alt`) with the final high-quality Costa Rican photo when
   it's provided; nothing else needs to change. Placeholder = a local service
   professional at work (never a foreign-looking house). */
const HERO_IMAGE = {
  src: "https://res.cloudinary.com/dxxrjx2go/image/upload/f_auto,q_auto,w_1600/contratacr/home/hero-sanjose.jpg",
  alt: "Vista de la ciudad de San José, Costa Rica al atardecer",
};

/* Per-letter staggered vertical slide-up. Each letter of the word rises from
   below into place one after another (left → right), the word holds, then each
   letter slides up and out (same staggered order) as the next word's letters
   roll in. A clipping mask (overflow-hidden, one line tall) keeps letters within
   the line. Word stays centered; no layout shift. Reduced-motion → static word. */
const ROLL_LINE = 1.18;   // em — line/clip height (room for accents like í, J).
const LETTER_MS = 520;    // per-letter slide duration.
const STAGGER_MS = 46;    // delay between consecutive letters.
const WORD_HOLD_MS = 1400; // pause on the full word before it leaves.

function RotatingLine({ lines }: { lines: string[] }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);   // letters in place (entered)
  const [leaving, setLeaving] = useState(false); // letters sliding out

  // Enter → hold → exit → next word, per index. This animation ALWAYS plays —
  // reduced-motion is intentionally ignored here (the effect is subtle/smooth).
  useEffect(() => {
    const word = lines[index] ?? "";
    const span = Math.max(0, word.length - 1) * STAGGER_MS;
    const enterDur = LETTER_MS + span;
    const exitDur = LETTER_MS + span;

    setLeaving(false);
    setShown(false);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    const tExit = setTimeout(() => setLeaving(true), enterDur + WORD_HOLD_MS);
    const tNext = setTimeout(() => setIndex((i) => (i + 1) % lines.length), enterDur + WORD_HOLD_MS + exitDur);

    return () => { cancelAnimationFrame(raf); clearTimeout(tExit); clearTimeout(tNext); };
  }, [index, lines]);

  const word = lines[index] ?? "";
  const visible = shown && !leaving;

  return (
    <span
      className="flex justify-center overflow-hidden"
      style={{ height: `${ROLL_LINE}em` }}
      aria-label={word}
    >
      {Array.from(word).map((ch, i) => (
        <span
          key={`${index}-${i}`}
          aria-hidden
          style={{
            display: "inline-block",
            color: "#009FD9",
            willChange: "transform, opacity",
            transform: visible ? "translateY(0)" : `translateY(${leaving ? "-110%" : "110%"})`,
            opacity: visible ? 1 : 0,
            transition: shown
              ? `transform ${LETTER_MS}ms cubic-bezier(0.16,1,0.3,1) ${i * STAGGER_MS}ms, opacity ${LETTER_MS}ms ease ${i * STAGGER_MS}ms`
              : "none",
          }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

/* ─── Autocomplete dropdown ─── */
function SuggestionsDropdown({
  suggestions,
  activeIdx,
  onPick,
}: {
  suggestions: SearchSuggestion[];
  activeIdx: number;
  onPick: (s: SearchSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 text-left"
      role="listbox"
    >
      {suggestions.map((s, i) => (
        <button
          key={s.type === "category" ? `c-${s.id}` : `p-${s.slug}`}
          type="button"
          role="option"
          aria-selected={i === activeIdx}
          // Prevent the input's blur from firing before the click is handled
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
            i === activeIdx ? "bg-[#EBF5FB]" : "hover:bg-gray-50"
          )}
        >
          {s.type === "category" ? (
            <Search className="h-4 w-4 text-[#009FD9] shrink-0" />
          ) : (
            <User className="h-4 w-4 text-[#009FD9] shrink-0" />
          )}
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-[#111827] truncate">{s.label}</span>
            {s.type === "professional" && s.sublabel && (
              <span className="block text-xs text-gray-400 truncate">{s.sublabel}</span>
            )}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">
            {s.type === "category" ? "Servicio" : "Profesional"}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ─── Location autocomplete dropdown (provinces + cantones) ─── */
function LocationDropdown({
  suggestions,
  activeIdx,
  onPick,
}: {
  suggestions: LocationSuggestion[];
  activeIdx: number;
  onPick: (s: LocationSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 text-left"
      role="listbox"
    >
      {suggestions.map((s, i) => (
        <button
          key={`${s.type}-${s.id}`}
          type="button"
          role="option"
          aria-selected={i === activeIdx}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
            i === activeIdx ? "bg-[#EBF5FB]" : "hover:bg-gray-50"
          )}
        >
          <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-[#111827] truncate">{s.label}</span>
            {s.type === "canton" && (
              <span className="block text-xs text-gray-400 truncate">{s.sublabel}</span>
            )}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">
            {s.type === "province" ? "Provincia" : "Cantón"}
          </span>
        </button>
      ))}
    </div>
  );
}

export function LandingHero() {
  const [service, setService] = useState("");
  // The chosen service suggestion (so a category filters by id, not free text).
  const [serviceSel, setServiceSel] = useState<SearchSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  // Location is a typeable autocomplete over provinces + cantones.
  const [location, setLocation] = useState("");
  const [locationSel, setLocationSel] = useState<LocationSuggestion | null>(null);
  const [locSug, setLocSug] = useState<LocationSuggestion[]>([]);
  const [openLoc, setOpenLoc] = useState(false);
  const [locActive, setLocActive] = useState(-1);

  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("landing.hero");

  const lines = ROTATING_LINES[locale] ?? ROTATING_LINES.es;
  const tags = POPULAR_TAGS[locale] ?? POPULAR_TAGS.es;

  // Debounced service suggestion fetch as the user types
  useEffect(() => {
    const q = service.trim();
    const id = setTimeout(async () => {
      if (q.length < 2) {
        setSuggestions([]);
        setOpenSug(false);
        return;
      }
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}`);
        const { suggestions } = await res.json();
        setSuggestions(suggestions ?? []);
        setActiveIdx(-1);
        setOpenSug(true);
      } catch {
        /* ignore — search still works without suggestions */
      }
    }, q.length < 2 ? 0 : 250);
    return () => clearTimeout(id);
  }, [service]);

  // Local (synchronous) location suggestions as the user types.
  useEffect(() => {
    const next = searchLocations(location);
    setLocSug(next);
    setLocActive(-1);
  }, [location]);

  // Selecting a service suggestion FILLS the field — it does NOT search. The
  // search runs only on Buscar/Enter (see runSearch).
  function selectSuggestion(s: SearchSuggestion) {
    setService(s.label);
    setServiceSel(s);
    setOpenSug(false);
  }

  function selectLocation(s: LocationSuggestion) {
    setLocation(s.label);
    setLocationSel(s);
    setOpenLoc(false);
  }

  // Build params from current state and navigate. Service: a picked category
  // filters by id; otherwise free text → q. Location: a picked/resolved
  // province → provincia, canton → canton.
  function runSearch() {
    const params = new URLSearchParams();
    const svc = service.trim();
    if (serviceSel && serviceSel.type === "category" && serviceSel.label === service) {
      params.set("categoria", serviceSel.id);
    } else if (svc) {
      params.set("q", svc);
    }
    const loc = locationSel && locationSel.label === location ? locationSel : resolveLocation(location);
    if (loc) {
      if (loc.type === "province") params.set("provincia", loc.id);
      else params.set("canton", loc.id);
    }
    setOpenSug(false);
    setOpenLoc(false);
    router.push(`/buscar?${params.toString()}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (openSug && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIdx]);
        return;
      } else if (e.key === "Escape") {
        setOpenSug(false);
        return;
      }
    }
    // Enter with no active suggestion → run the search.
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  }

  function handleLocKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (openLoc && locSug.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setLocActive((i) => Math.min(i + 1, locSug.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setLocActive((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Enter" && locActive >= 0) {
        e.preventDefault();
        selectLocation(locSug[locActive]);
        return;
      } else if (e.key === "Escape") {
        setOpenLoc(false);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  return (
    <section className="relative bg-white overflow-hidden">
      {/* Headline + subtitle — narrower container for readability */}
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center pt-20 sm:pt-28 pb-6">
        <h1
          className="font-extrabold text-[#1a2744] tracking-tight mb-4"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.6rem)", lineHeight: 1.1 }}
        >
          <RotatingLine lines={lines} />
          <span className="block">{t("headline2")}</span>
        </h1>
        <p className="text-base sm:text-xl text-gray-400 max-w-lg mx-auto leading-relaxed">
          {t("subtitle")}
        </p>
      </div>

      {/* ── Search bar — full-width in wider container ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-8 pb-6">
        <form
          onSubmit={handleSearch}
          className="w-full"
        >
          {/* Desktop row: single line h-14 */}
          <div className="hidden sm:block relative">
            <div className="flex items-center h-14 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-5 pr-2 shadow-[0_8px_48px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_60px_rgba(0,159,217,0.20)] transition-shadow duration-300">
              {/* Service input + its dropdown (relative wrapper so the panel
                  aligns under just this field) */}
              <div className="relative flex items-center gap-3 flex-1 min-w-0 h-full">
                <Search className="h-5 w-5 text-gray-300 shrink-0" />
                <input
                  type="text"
                  value={service}
                  onChange={(e) => { setService(e.target.value); setServiceSel(null); }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { if (suggestions.length > 0) setOpenSug(true); }}
                  onBlur={() => setTimeout(() => setOpenSug(false), 120)}
                  placeholder={t("searchPlaceholder")}
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openSug}
                  aria-autocomplete="list"
                />
                {openSug && (
                  <SuggestionsDropdown suggestions={suggestions} activeIdx={activeIdx} onPick={selectSuggestion} />
                )}
              </div>
              {/* Divider + location autocomplete */}
              <div className="w-px bg-gray-200 self-stretch my-3 mx-2 shrink-0" />
              <div className="relative flex items-center gap-2 min-w-[150px] shrink-0 h-full">
                <MapPin className="h-5 w-5 text-gray-300 shrink-0" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setLocationSel(null); setOpenLoc(true); }}
                  onKeyDown={handleLocKeyDown}
                  onFocus={() => { if (locSug.length > 0) setOpenLoc(true); }}
                  onBlur={() => setTimeout(() => setOpenLoc(false), 120)}
                  placeholder={t("location")}
                  className="flex-1 w-full text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openLoc}
                  aria-autocomplete="list"
                />
                {openLoc && (
                  <LocationDropdown suggestions={locSug} activeIdx={locActive} onPick={selectLocation} />
                )}
              </div>
              {/* Buscar button */}
              <button
                type="submit"
                className="ml-2 h-10 px-8 bg-[#009FD9] hover:bg-[#0089bb] text-white text-base font-bold rounded-[4px] transition-all duration-150 active:scale-[0.97] shadow-sm whitespace-nowrap shrink-0"
              >
                {t("search")}
              </button>
            </div>
          </div>

          {/* Mobile stacked layout — service, then location, then Buscar */}
          <div className="sm:hidden flex flex-col gap-2">
            <div className="relative">
              <div className="flex items-center h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-4 pr-3 shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
                <Search className="h-5 w-5 text-gray-300 shrink-0 mr-3" />
                <input
                  type="text"
                  value={service}
                  onChange={(e) => { setService(e.target.value); setServiceSel(null); }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { if (suggestions.length > 0) setOpenSug(true); }}
                  onBlur={() => setTimeout(() => setOpenSug(false), 120)}
                  placeholder={t("searchPlaceholderShort")}
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openSug}
                  aria-autocomplete="list"
                />
              </div>
              {openSug && (
                <SuggestionsDropdown suggestions={suggestions} activeIdx={activeIdx} onPick={selectSuggestion} />
              )}
            </div>
            <div className="relative">
              <div className="flex items-center h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-4 pr-3 shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
                <MapPin className="h-5 w-5 text-gray-300 shrink-0 mr-3" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setLocationSel(null); setOpenLoc(true); }}
                  onKeyDown={handleLocKeyDown}
                  onFocus={() => { if (locSug.length > 0) setOpenLoc(true); }}
                  onBlur={() => setTimeout(() => setOpenLoc(false), 120)}
                  placeholder={t("location")}
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openLoc}
                  aria-autocomplete="list"
                />
              </div>
              {openLoc && (
                <LocationDropdown suggestions={locSug} activeIdx={locActive} onPick={selectLocation} />
              )}
            </div>
            <button
              type="submit"
              className="w-full h-12 bg-[#009FD9] hover:bg-[#0089bb] text-white text-base font-bold rounded-[6px] transition-all duration-150 active:scale-[0.97]"
            >
              {t("search")}
            </button>
          </div>
        </form>

        {/* Sentinel — IntersectionObserver in navbar watches this */}
        <div id="hero-search-sentinel" aria-hidden className="h-0" />

        {/* Popular tags */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-4 text-center">
          <span className="text-sm text-gray-400 self-center">{t("popular")}</span>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => { setService(tag); setServiceSel(null); }}
              className="text-sm text-gray-500 hover:text-[#009FD9] transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Arch / dome image — responsive height */}
      <div className="flex justify-center px-4 pb-0">
        <div
          className="relative overflow-hidden w-full h-[180px] sm:h-[280px] md:h-[360px] lg:h-[420px]"
          style={{ maxWidth: 800, borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        >
          <Image
            src={HERO_IMAGE.src}
            alt={HERO_IMAGE.alt}
            fill
            className="object-cover object-center"
            priority
            sizes="(min-width:860px) 800px, 100vw"
          />
        </div>
      </div>
    </section>
  );
}
