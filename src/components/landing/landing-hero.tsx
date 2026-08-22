"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, MapPin } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { cloudinaryAssetUrl } from "@/lib/cloudinary";
import type { SearchSuggestion } from "@/app/api/search/suggestions/route";
import { searchLocations, resolveLocation, type LocationSuggestion } from "@/lib/data/location-search";
import { loadGoogleMaps } from "@/lib/maps/loader";
import { matchProvinceCanton } from "@/lib/data/cr-geography";
import { resolveCategoryIntent } from "@/lib/data/categories";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";

// A Google Places ADDRESS prediction shown alongside our province/cantón suggestions, so the
// location field autocompletes real addresses (not just province/cantón names).
type AddressSuggestion = { type: "address"; placeId: string; label: string };
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Show professional, high-trust service examples first so the landing page feels
// broad enough for Costa Rica: health, finance, technical and home services.
const ROTATING_LINES: Record<string, string[]> = {
  es: ["Salud,", "Contabilidad,", "Fisioterapia,", "Electricidad,", "Tecnología,", "Psicología,", "Arquitectura,", "Veterinaria,"],
  en: ["Health,", "Accounting,", "Physical therapy,", "Electrical,", "Technology,", "Psychology,", "Architecture,", "Veterinary,"],
};

/* ── Hero image — ONE easy-to-swap asset shown in the dome. ──
   Replace `src` (and `alt`) with the final high-quality Costa Rican photo when
   it's provided; nothing else needs to change. Placeholder = a local service
   professional at work (never a foreign-looking house). */
const HERO_IMAGE = {
  src: cloudinaryAssetUrl("contratacr/home/hero-sanjose.jpg", "f_auto,q_auto,w_1600"),
  alt: "Vista de la ciudad de San José, Costa Rica al atardecer",
  // A 32px blurred copy of the same photo, inlined so the arch shows the picture
  // (not a grey block) from the very first paint while the real file arrives.
  blurDataURL: "data:image/jpeg;base64,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",
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

/* Anchored position for a dropdown PORTALED to <body>.
   ──────────────────────────────────────────────────────────────────
   WHY A PORTAL: the home search bar is a single rounded pill with
   `overflow-hidden` (for its shape). The autocomplete panels used to be absolute
   children INSIDE that pill, so the pill's `overflow-hidden` CLIPPED them to zero
   height. Portaling each dropdown to <body> makes it IMMUNE to any ancestor
   overflow/stacking — it can never be clipped again.
   WHY ABSOLUTE-IN-DOCUMENT (not `fixed`): a `fixed` panel is pinned to the
   VIEWPORT, so on mobile — where focusing the input opens the keyboard and shifts
   the visual viewport — the panel floated UP and OVER the field while the input
   scrolled down with the page (it "detached" and covered what you were typing).
   Positioning `absolute` in DOCUMENT coords (rect + scrollX/scrollY) keeps the
   panel in the SAME coordinate space as the input, so they move together and it
   always sits DIRECTLY BELOW the field. `maxH` caps it to the space above the
   keyboard; the list scrolls internally. Returns null while the field is hidden
   (responsive `display:none` → rect 0×0), so only the VISIBLE field's dropdown
   renders even though desktop + mobile both mount. */
function useAnchoredRect(ref: RefObject<HTMLElement | null>, open: boolean, minWidth = 0) {
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null);
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const el = ref.current;
    if (!el) { setPos(null); return; }
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setPos(null); return; } // field hidden (display:none)
      const sx = window.scrollX;
      const sy = window.scrollY;
      const vv = window.visualViewport;
      const viewBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
      const width = Math.max(r.width, minWidth);
      let left = r.left + sx;
      if (left + width > sx + window.innerWidth - 8) {
        left = Math.max(8 + sx, sx + window.innerWidth - 8 - width);
      }
      const maxH = Math.max(140, Math.min(320, viewBottom - r.bottom - 12));
      setPos({ left, top: r.bottom + sy + 8, width, maxH });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, ref, minWidth]);
  return pos;
}

/* ─── Autocomplete dropdown (service/profession) — PORTALED to <body> ─── */
function SuggestionsDropdown({
  anchorRef,
  open,
  suggestions,
  activeIdx,
  onPick,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  suggestions: SearchSuggestion[];
  activeIdx: number;
  onPick: (s: SearchSuggestion) => void;
}) {
  const show = open && suggestions.length > 0;
  const pos = useAnchoredRect(anchorRef, show, 240);
  if (!show || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{ position: "absolute", left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto overscroll-contain py-1 text-left"
      role="listbox"
    >
      {suggestions.map((s, i) => (
        <button
          key={`c-${s.id}`}
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
          <Search className="h-4 w-4 text-[#009FD9] shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-[#111827] truncate">{s.label}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">
            Servicio
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
}

/* ─── Location autocomplete dropdown (provinces + cantones + Google addresses) — PORTALED ─── */
function LocationDropdown({
  anchorRef,
  open,
  suggestions,
  addresses,
  activeIdx,
  onPick,
  onPickAddress,
  onNearMe,
  nearMeLabel,
  geoLoading,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  suggestions: LocationSuggestion[];
  addresses: AddressSuggestion[];
  activeIdx: number;
  onPick: (s: LocationSuggestion) => void;
  onPickAddress: (a: AddressSuggestion) => void;
  onNearMe: () => void;
  nearMeLabel: string;
  geoLoading: boolean;
}) {
  const show = open;
  const pos = useAnchoredRect(anchorRef, show, 260);
  if (!show || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{ position: "absolute", left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto overscroll-contain py-1 text-left"
      role="listbox"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onNearMe}
        disabled={geoLoading}
        className="flex w-full items-center gap-2.5 whitespace-nowrap border-b border-[#eef2f6] px-3.5 py-3 text-left text-sm font-semibold text-[#009FD9] transition-colors hover:bg-[#EBF5FB] disabled:opacity-60"
      >
        {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        <span>{nearMeLabel}</span>
      </button>

      {/* Our province/cantón taxonomy (keyboard-navigable). */}
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

      {/* Google Places addresses. */}
      {addresses.map((a) => (
        <button
          key={`addr-${a.placeId}`}
          type="button"
          role="option"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPickAddress(a)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
        >
          <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
          <span className="flex-1 min-w-0 block text-sm text-[#111827] truncate">{a.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">Dirección</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

export function LandingHero() {
  const [service, setService] = useState("");
  // The chosen service suggestion (so a category filters by id, not free text).
  const [serviceSel, setServiceSel] = useState<SearchSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // Anchor refs for the PORTALED dropdowns — one per field per breakpoint (desktop +
  // mobile both mount; the hidden one has a 0×0 rect, so its dropdown renders nothing).
  const svcDesktopRef = useRef<HTMLDivElement>(null);
  const svcMobileRef = useRef<HTMLDivElement>(null);
  const locDesktopRef = useRef<HTMLDivElement>(null);
  const locMobileRef = useRef<HTMLDivElement>(null);
  // Location is a typeable autocomplete over provinces + cantones AND Google Places addresses.
  const [location, setLocation] = useState("");
  const [locationSel, setLocationSel] = useState<LocationSuggestion | null>(null);
  const [locSug, setLocSug] = useState<LocationSuggestion[]>([]);
  const [addrSug, setAddrSug] = useState<AddressSuggestion[]>([]);
  const [openLoc, setOpenLoc] = useState(false);
  const [locActive, setLocActive] = useState(-1);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Google Places (new API): ready flag, a session token, and the resolved place a user picked
  // (provincia/cantón from its admin areas + lat/lng) used when the search runs.
  const mapsReadyRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const pickedAddrRef = useRef<{ provinceId?: string; cantonId?: string; lat?: number; lng?: number; label: string } | null>(null);
  const nearMeRef = useRef<{ lat: number; lng: number } | null>(null);

  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("landing.hero");
  const nearMeActiveLabel = t("nearMeActive");

  const lines = ROTATING_LINES[locale] ?? ROTATING_LINES.es;
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
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}&locale=${locale}`);
        const { suggestions } = await res.json();
        setSuggestions(suggestions ?? []);
        setActiveIdx(-1);
        setOpenSug(true);
      } catch {
        /* ignore — search still works without suggestions */
      }
    }, q.length < 2 ? 0 : 250);
    return () => clearTimeout(id);
  }, [service, locale]);

  // Local (synchronous) province/cantón suggestions as the user types.
  useEffect(() => {
    const next = searchLocations(location);
    setLocSug(next);
    setLocActive(-1);
  }, [location]);

  // Google Maps (Places) is only needed for ADDRESS autocomplete, so it loads the
  // first time the location field gets attention instead of on every home view:
  // ~330 KB across ten scripts that most visits never used.
  const mapsRequestedRef = useRef(false);
  const ensureMaps = () => {
    if (!GMAPS_KEY || mapsRequestedRef.current) return;
    mapsRequestedRef.current = true;
    loadGoogleMaps(GMAPS_KEY).then(() => { mapsReadyRef.current = true; }).catch(() => { mapsRequestedRef.current = false; });
  };

  // Google Places ADDRESS predictions (new AutocompleteSuggestion API), debounced. Costa Rica
  // only. Best-effort: any failure just leaves the province/cantón taxonomy working.
  useEffect(() => {
    const q = location.trim();
    if (q.length >= 2) ensureMaps();
    if (nearMeRef.current && q === nearMeActiveLabel) return;
    if (q.length < 3) { setAddrSug([]); return; }
    const id = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maps = (window as any).google?.maps;
        if (!mapsReadyRef.current || !maps?.places?.AutocompleteSuggestion) { setAddrSug([]); return; }
        if (!sessionTokenRef.current) sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
        const { suggestions } = await maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q, includedRegionCodes: ["cr"], sessionToken: sessionTokenRef.current,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: AddressSuggestion[] = (suggestions ?? []).map((s: any) => s.placePrediction).filter(Boolean).slice(0, 5).map((p: any) => ({
          type: "address" as const, placeId: p.placeId, label: (p.text?.text ?? p.text ?? "").toString(),
        })).filter((a: AddressSuggestion) => a.placeId && a.label);
        setAddrSug(items);
      } catch { setAddrSug([]); }
    }, 250);
    return () => clearTimeout(id);
  }, [location, nearMeActiveLabel]);

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
    pickedAddrRef.current = null;
    nearMeRef.current = null;
    setGeoError(null);
    setAddrSug([]);
    setOpenLoc(false);
  }

  // Picking a Google address → resolve its province/cantón (from admin areas) + lat/lng, so the
  // search filters by that area and sorts by proximity. Best-effort; falls back to text search.
  async function selectAddress(a: AddressSuggestion) {
    setLocation(a.label);
    setLocationSel(null);
    nearMeRef.current = null;
    setGeoError(null);
    setAddrSug([]);
    setOpenLoc(false);
    pickedAddrRef.current = { label: a.label };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maps = (window as any).google?.maps;
      const place = new maps.places.Place({ id: a.placeId });
      await place.fetchFields({ fields: ["location", "addressComponents"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comps: any[] = place.addressComponents ?? [];
      const pick = (type: string) => comps.find((c) => c.types?.includes(type))?.longText as string | undefined;
      const { provinceId, cantonId } = matchProvinceCanton(pick("administrative_area_level_1"), pick("administrative_area_level_2"));
      const lat = typeof place.location?.lat === "function" ? place.location.lat() : place.location?.lat;
      const lng = typeof place.location?.lng === "function" ? place.location.lng() : place.location?.lng;
      pickedAddrRef.current = { provinceId, cantonId, lat, lng, label: a.label };
      sessionTokenRef.current = null; // end the Places session after a selection
    } catch { /* keep the typed label; the search falls back to text */ }
  }

  // Build params from current state and navigate. Service: a picked category
  // filters by id; otherwise free text → q. Location is OPTIONAL — the search
  // always runs with whatever is filled (service-only, location-only, or both).
  //
  // `locationOverride` lets Enter pass an explicitly-resolved location WITHOUT
  // waiting for React state to flush (avoids a stale `location`): a taxonomy
  // province/cantón, or a resolved Google address (province/cantón + lat/lng).
  type LocOverride =
    | { kind: "taxonomy"; sug: LocationSuggestion }
    | { kind: "address"; provinceId?: string; cantonId?: string; lat?: number; lng?: number }
    | { kind: "nearMe"; lat: number; lng: number };
  function runSearch(serviceOverride?: SearchSuggestion, locationOverride?: LocOverride) {
    const params = new URLSearchParams();
    // `serviceOverride` (from Enter) resolves a partial term to the best service
    // suggestion. Otherwise we infer the service from the typed text or send q.
    const chosen = serviceOverride ?? (serviceSel && serviceSel.label === service ? serviceSel : null);
    if (chosen) {
      params.set("categoria", chosen.id);
    } else {
      const svc = service.trim();
      if (svc) {
        const inferred = resolveCategoryIntent(svc, locale);
        if (inferred) params.set("categoria", inferred.id);
        else params.set("q", svc);
      }
    }
    // Location resolution order: explicit Enter override → a picked Google ADDRESS
    // (province/cantón + proximity) → a picked/typed province/cantón from our taxonomy.
    const picked = pickedAddrRef.current;
    const nearMe = nearMeRef.current;
    if (locationOverride?.kind === "taxonomy") {
      const loc = locationOverride.sug;
      if (loc.type === "province") params.set("provincia", loc.id);
      else {
        params.set("provincia", loc.provinceId);
        params.set("canton", loc.id);
      }
    } else if (locationOverride?.kind === "address") {
      if (locationOverride.provinceId) {
        params.set("provincia", locationOverride.provinceId);
        if (locationOverride.cantonId) params.set("canton", locationOverride.cantonId);
      }
      if (locationOverride.lat != null && locationOverride.lng != null) {
        params.set("lat", locationOverride.lat.toFixed(5));
        params.set("lng", locationOverride.lng.toFixed(5));
      }
    } else if (locationOverride?.kind === "nearMe") {
      params.set("lat", locationOverride.lat.toFixed(5));
      params.set("lng", locationOverride.lng.toFixed(5));
    } else if (picked && picked.label === location && (picked.provinceId || picked.lat != null)) {
      if (picked.provinceId) {
        params.set("provincia", picked.provinceId);
        if (picked.cantonId) params.set("canton", picked.cantonId);
      }
      if (picked.lat != null && picked.lng != null) {
        params.set("lat", picked.lat.toFixed(5));
        params.set("lng", picked.lng.toFixed(5));
      }
    } else if (nearMe && location === nearMeActiveLabel) {
      params.set("lat", nearMe.lat.toFixed(5));
      params.set("lng", nearMe.lng.toFixed(5));
    } else {
      const loc = locationSel && locationSel.label === location ? locationSel : resolveLocation(location);
      if (loc) {
        if (loc.type === "province") params.set("provincia", loc.id);
        else params.set("canton", loc.id);
      }
    }
    setOpenSug(false);
    setOpenLoc(false);
    trackMetaEvent("Search", {
      content_type: "professional_service",
      search_string: params.get("categoria") ? "category" : params.get("q") ? "text" : "general",
      has_location: params.has("provincia") || params.has("canton") || params.has("lat"),
    });
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
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Resolve the partial term to the highlighted OR the FIRST (best) suggestion and search it.
        runSearch(suggestions[activeIdx >= 0 ? activeIdx : 0]);
        return;
      } else if (e.key === "Escape") {
        setOpenSug(false);
        return;
      }
    }
    // No suggestions → run the search with the literal/exact text (graceful fallback).
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  }

  async function handleLocKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const hasSug = locSug.length > 0 || addrSug.length > 0;
    if (openLoc && hasSug) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setLocActive((i) => Math.min(i + 1, locSug.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setLocActive((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Enter") {
        // Auto-complete the HIGHLIGHTED or FIRST/best suggestion AND run the search in
        // one press. Taxonomy (province/cantón) resolves synchronously; if only Google
        // ADDRESS results exist, resolve the first one first (its ref is set before the
        // promise resolves), then search. Either way location is filled + applied.
        e.preventDefault();
        if (locSug.length > 0) {
          const chosen = locSug[locActive >= 0 ? locActive : 0];
          setLocation(chosen.label);
          setLocationSel(chosen);
          pickedAddrRef.current = null;
          setOpenLoc(false);
          runSearch(undefined, { kind: "taxonomy", sug: chosen });
        } else {
          setOpenLoc(false);
          await selectAddress(addrSug[0]);
          const p = pickedAddrRef.current;
          runSearch(undefined, p && (p.provinceId || p.lat != null)
            ? { kind: "address", provinceId: p.provinceId, cantonId: p.cantonId, lat: p.lat, lng: p.lng }
            : undefined);
        }
        return;
      } else if (e.key === "Escape") {
        setOpenLoc(false);
        return;
      }
    }
    // No open dropdown / no matches → just run the search with whatever is filled
    // (location is OPTIONAL — service-only still searches).
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  function requestNearMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(t("geoUnsupported"));
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    setOpenLoc(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        nearMeRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        pickedAddrRef.current = null;
        setLocationSel(null);
        setLocation(nearMeActiveLabel);
        setAddrSug([]);
        setLocSug([]);
        setGeoLoading(false);
      },
      () => {
        nearMeRef.current = null;
        setGeoLoading(false);
        setGeoError(t("geoFailed"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  function handleLocationChange(value: string) {
    setLocation(value);
    setLocationSel(null);
    nearMeRef.current = null;
    setGeoError(null);
    setOpenLoc(value.trim().length >= 2);
  }

  return (
    <section className="relative bg-white overflow-hidden">
      {/* Headline — narrower container for readability */}
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center pt-20 sm:pt-28 pb-8">
        <h1
          className="font-extrabold text-[#1a2744] tracking-tight"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.6rem)", lineHeight: 1.1 }}
        >
          <RotatingLine lines={lines} />
          <span className="block">{t("headline2")}</span>
        </h1>
      </div>

      {/* ── Search bar — full-width in wider container ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-8 pb-6">
        <form
          onSubmit={handleSearch}
          className="w-full"
        >
          {/* Desktop row: single line h-14 */}
          <div className="hidden sm:block relative">
            <div className="flex items-center h-14 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-5 shadow-[0_8px_48px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_60px_rgba(0,159,217,0.20)] transition-shadow duration-300">
              {/* Service input — its dropdown PORTALS to <body> (anchored to this wrapper),
                  so the bar's `overflow-hidden` can never clip it. */}
              <div ref={svcDesktopRef} className="flex items-center gap-3 flex-1 min-w-0 h-full">
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
                <SuggestionsDropdown anchorRef={svcDesktopRef} open={openSug} suggestions={suggestions} activeIdx={activeIdx} onPick={selectSuggestion} />
              </div>
              {/* Divider + location autocomplete */}
              <div className="w-px bg-gray-200 self-stretch my-3 mx-2 shrink-0" />
              <div ref={locDesktopRef} className="flex items-center gap-2 min-w-[150px] shrink-0 h-full">
                <MapPin className="h-5 w-5 text-gray-300 shrink-0" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onKeyDown={handleLocKeyDown}
                  onFocus={() => { ensureMaps(); setOpenLoc(location.trim().length >= 2); }}
                  onBlur={() => setTimeout(() => setOpenLoc(false), 120)}
                  placeholder={t("location")}
                  className="flex-1 w-full text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openLoc}
                  aria-autocomplete="list"
                />
                <LocationDropdown anchorRef={locDesktopRef} open={openLoc && location.trim().length >= 2} suggestions={locSug} addresses={addrSug} activeIdx={locActive} onPick={selectLocation} onPickAddress={selectAddress} onNearMe={requestNearMe} nearMeLabel={t("nearMe")} geoLoading={geoLoading} />
              </div>
              {/* Buscar button */}
              <button
                type="submit"
                className="ml-2 h-full self-stretch px-8 bg-[#009FD9] hover:bg-[#0089bb] text-white text-base font-bold transition-colors duration-150 active:bg-[#007da8] whitespace-nowrap shrink-0"
              >
                {t("search")}
              </button>
            </div>
          </div>

          {/* Mobile stacked layout — service, then location, then Buscar */}
          <div className="sm:hidden flex flex-col gap-2">
            <div ref={svcMobileRef} className="relative">
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
              <SuggestionsDropdown anchorRef={svcMobileRef} open={openSug} suggestions={suggestions} activeIdx={activeIdx} onPick={selectSuggestion} />
            </div>
            <div ref={locMobileRef} className="relative">
              <div className="flex items-center h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-4 pr-3 shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
                <MapPin className="h-5 w-5 text-gray-300 shrink-0 mr-3" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onKeyDown={handleLocKeyDown}
                  onFocus={() => { ensureMaps(); setOpenLoc(location.trim().length >= 2); }}
                  onBlur={() => setTimeout(() => setOpenLoc(false), 120)}
                  placeholder={t("location")}
                  className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                  role="combobox"
                  aria-expanded={openLoc}
                  aria-autocomplete="list"
                />
              </div>
              <LocationDropdown anchorRef={locMobileRef} open={openLoc && location.trim().length >= 2} suggestions={locSug} addresses={addrSug} activeIdx={locActive} onPick={selectLocation} onPickAddress={selectAddress} onNearMe={requestNearMe} nearMeLabel={t("nearMe")} geoLoading={geoLoading} />
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

        {geoError && (
          <p className="mt-2 text-center text-xs font-medium text-red-600">{geoError}</p>
        )}

      </div>

      {/* Arch / dome image — responsive height */}
      <div className="flex justify-center px-4 pb-0">
        <div
          className="relative overflow-hidden w-full h-[180px] bg-[#c9d6e0] sm:h-[280px] md:h-[360px] lg:h-[420px]"
          style={{ maxWidth: 800, borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        >
          <Image
            src={HERO_IMAGE.src}
            alt={HERO_IMAGE.alt}
            fill
            className="object-cover object-center"
            priority
            fetchPriority="high"
            placeholder="blur"
            blurDataURL={HERO_IMAGE.blurDataURL}
            sizes="(min-width:860px) 800px, 100vw"
          />
        </div>
      </div>
    </section>
  );
}
