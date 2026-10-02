"use client";

import { useState, useEffect, useLayoutEffect, useRef, useTransition, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, Search, MapPin } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SearchSuggestion } from "@/app/api/search/suggestions/route";
import { searchLocations, resolveLocation, type LocationSuggestion } from "@/lib/data/location-search";
import { loadGoogleMaps } from "@/lib/maps/loader";
import { matchProvinceCanton } from "@/lib/data/cr-geography";
import { resolveCategoryIntent } from "@/lib/data/categories";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { rutaDeBusqueda } from "@/lib/buscar-url";

// A Google Places ADDRESS prediction shown alongside our province/cantón suggestions, so the
// location field autocompletes real addresses (not just province/cantón names).
type AddressSuggestion = { type: "address"; placeId: string; label: string };
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";


/* ── FOTO DE FONDO DEL HERO, a todo el ancho (como Angi) ──
   Un profesional trabajando, con la persona hacia la derecha: el centro queda
   libre para el título y el buscador. Unsplash entrega cada ancho ya
   recortado (en Cloudflare /_next/image no optimiza). La miniatura de 48 px va
   en línea para que el primer cuadro ya tenga la foto, no un hueco. */
// Cuatro profesionales trabajando, en fotos claras; van pasando con un fundido
// y un zoom lento. La persona va hacia un lado para dejar libre el centro.
const HERO_FOTOS: { id: string; foco: string }[] = [
  // `foco`: dónde está el profesional en la foto, para que el recorte —ancho en
  // computadora, angosto en el teléfono— lo deje siempre a la vista.
  // Teléfono: lo que importa queda arriba (y). Computadora: el profesional a la derecha (x).
  { id: "1505798577917-a65157d3320a", foco: "40% 15%" }, // ingletadora en una remodelación (clara: va primero)
  { id: "1555963966-b7ae5404b6ed", foco: "72% 30%" }, // liniero trabajando en un poste, a un costado
  { id: "1749532125405-70950966b0e5", foco: "65% 25%" }, // fontanero en un baño
  { id: "1589939705384-5185137a7f0f", foco: "75% 20%" }, // carpintería con casco
];
const HERO_MINIATURA = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4gxYSUNDX1BST0ZJTEUAAQEAAAxITGlubwIQAABtbnRyUkdCIFhZWiAHzgACAAkABgAxAABhY3NwTVNGVAAAAABJRUMgc1JHQgAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLUhQICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFjcHJ0AAABUAAAADNkZXNjAAABhAAAAGx3dHB0AAAB8AAAABRia3B0AAACBAAAABRyWFlaAAACGAAAABRnWFlaAAACLAAAABRiWFlaAAACQAAAABRkbW5kAAACVAAAAHBkbWRkAAACxAAAAIh2dWVkAAADTAAAAIZ2aWV3AAAD1AAAACRsdW1pAAAD+AAAABRtZWFzAAAEDAAAACR0ZWNoAAAEMAAAAAxyVFJDAAAEPAAACAxnVFJDAAAEPAAACAxiVFJDAAAEPAAACAx0ZXh0AAAAAENvcHlyaWdodCAoYykgMTk5OCBIZXdsZXR0LVBhY2thcmQgQ29tcGFueQAAZGVzYwAAAAAAAAASc1JHQiBJRUM2MTk2Ni0yLjEAAAAAAAAAAAAAABJzUkdCIElFQzYxOTY2LTIuMQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWFlaIAAAAAAAAPNRAAEAAAABFsxYWVogAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z2Rlc2MAAAAAAAAAFklFQyBodHRwOi8vd3d3LmllYy5jaAAAAAAAAAAAAAAAFklFQyBodHRwOi8vd3d3LmllYy5jaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABkZXNjAAAAAAAAAC5JRUMgNjE5NjYtMi4xIERlZmF1bHQgUkdCIGNvbG91ciBzcGFjZSAtIHNSR0IAAAAAAAAAAAAAAC5JRUMgNjE5NjYtMi4xIERlZmF1bHQgUkdCIGNvbG91ciBzcGFjZSAtIHNSR0IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZGVzYwAAAAAAAAAsUmVmZXJlbmNlIFZpZXdpbmcgQ29uZGl0aW9uIGluIElFQzYxOTY2LTIuMQAAAAAAAAAAAAAALFJlZmVyZW5jZSBWaWV3aW5nIENvbmRpdGlvbiBpbiBJRUM2MTk2Ni0yLjEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHZpZXcAAAAAABOk/gAUXy4AEM8UAAPtzAAEEwsAA1yeAAAAAVhZWiAAAAAAAEwJVgBQAAAAVx/nbWVhcwAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAo8AAAACc2lnIAAAAABDUlQgY3VydgAAAAAAAAQAAAAABQAKAA8AFAAZAB4AIwAoAC0AMgA3ADsAQABFAEoATwBUAFkAXgBjAGgAbQByAHcAfACBAIYAiwCQAJUAmgCfAKQAqQCuALIAtwC8AMEAxgDLANAA1QDbAOAA5QDrAPAA9gD7AQEBBwENARMBGQEfASUBKwEyATgBPgFFAUwBUgFZAWABZwFuAXUBfAGDAYsBkgGaAaEBqQGxAbkBwQHJAdEB2QHhAekB8gH6AgMCDAIUAh0CJgIvAjgCQQJLAlQCXQJnAnECegKEAo4CmAKiAqwCtgLBAssC1QLgAusC9QMAAwsDFgMhAy0DOANDA08DWgNmA3IDfgOKA5YDogOuA7oDxwPTA+AD7AP5BAYEEwQgBC0EOwRIBFUEYwRxBH4EjASaBKgEtgTEBNME4QTwBP4FDQUcBSsFOgVJBVgFZwV3BYYFlgWmBbUFxQXVBeUF9gYGBhYGJwY3BkgGWQZqBnsGjAadBq8GwAbRBuMG9QcHBxkHKwc9B08HYQd0B4YHmQesB78H0gflB/gICwgfCDIIRghaCG4IggiWCKoIvgjSCOcI+wkQCSUJOglPCWQJeQmPCaQJugnPCeUJ+woRCicKPQpUCmoKgQqYCq4KxQrcCvMLCwsiCzkLUQtpC4ALmAuwC8gL4Qv5DBIMKgxDDFwMdQyODKcMwAzZDPMNDQ0mDUANWg10DY4NqQ3DDd4N+A4TDi4OSQ5kDn8Omw62DtIO7g8JDyUPQQ9eD3oPlg+zD88P7BAJECYQQxBhEH4QmxC5ENcQ9RETETERTxFtEYwRqhHJEegSBxImEkUSZBKEEqMSwxLjEwMTIxNDE2MTgxOkE8UT5RQGFCcUSRRqFIsUrRTOFPAVEhU0FVYVeBWbFb0V4BYDFiYWSRZsFo8WshbWFvoXHRdBF2UXiReuF9IX9xgbGEAYZRiKGK8Y1Rj6GSAZRRlrGZEZtxndGgQaKhpRGncanhrFGuwbFBs7G2MbihuyG9ocAhwqHFIcexyjHMwc9R0eHUcdcB2ZHcMd7B4WHkAeah6UHr4e6R8THz4faR+UH78f6iAVIEEgbCCYIMQg8CEcIUghdSGhIc4h+yInIlUigiKvIt0jCiM4I2YjlCPCI/AkHyRNJHwkqyTaJQklOCVoJZclxyX3JicmVyaHJrcm6CcYJ0kneierJ9woDSg/KHEooijUKQYpOClrKZ0p0CoCKjUqaCqbKs8rAis2K2krnSvRLAUsOSxuLKIs1y0MLUEtdi2rLeEuFi5MLoIuty7uLyQvWi+RL8cv/jA1MGwwpDDbMRIxSjGCMbox8jIqMmMymzLUMw0zRjN/M7gz8TQrNGU0njTYNRM1TTWHNcI1/TY3NnI2rjbpNyQ3YDecN9c4FDhQOIw4yDkFOUI5fzm8Ofk6Njp0OrI67zstO2s7qjvoPCc8ZTykPOM9Ij1hPaE94D4gPmA+oD7gPyE/YT+iP+JAI0BkQKZA50EpQWpBrEHuQjBCckK1QvdDOkN9Q8BEA0RHRIpEzkUSRVVFmkXeRiJGZ0arRvBHNUd7R8BIBUhLSJFI10kdSWNJqUnwSjdKfUrESwxLU0uaS+JMKkxyTLpNAk1KTZNN3E4lTm5Ot08AT0lPk0/dUCdQcVC7UQZRUFGbUeZSMVJ8UsdTE1NfU6pT9lRCVI9U21UoVXVVwlYPVlxWqVb3V0RXklfgWC9YfVjLWRpZaVm4WgdaVlqmWvVbRVuVW+VcNVyGXNZdJ114XcleGl5sXr1fD19hX7NgBWBXYKpg/GFPYaJh9WJJYpxi8GNDY5dj62RAZJRk6WU9ZZJl52Y9ZpJm6Gc9Z5Nn6Wg/aJZo7GlDaZpp8WpIap9q92tPa6dr/2xXbK9tCG1gbbluEm5rbsRvHm94b9FwK3CGcOBxOnGVcfByS3KmcwFzXXO4dBR0cHTMdSh1hXXhdj52m3b4d1Z3s3gReG54zHkqeYl553pGeqV7BHtje8J8IXyBfOF9QX2hfgF+Yn7CfyN/hH/lgEeAqIEKgWuBzYIwgpKC9INXg7qEHYSAhOOFR4Wrhg6GcobXhzuHn4gEiGmIzokziZmJ/opkisqLMIuWi/yMY4zKjTGNmI3/jmaOzo82j56QBpBukNaRP5GokhGSepLjk02TtpQglIqU9JVflcmWNJaflwqXdZfgmEyYuJkkmZCZ/JpomtWbQpuvnByciZz3nWSd0p5Anq6fHZ+Ln/qgaaDYoUehtqImopajBqN2o+akVqTHpTilqaYapoum/adup+CoUqjEqTepqaocqo+rAqt1q+msXKzQrUStuK4trqGvFq+LsACwdbDqsWCx1rJLssKzOLOutCW0nLUTtYq2AbZ5tvC3aLfguFm40blKucK6O7q1uy67p7whvJu9Fb2Pvgq+hL7/v3q/9cBwwOzBZ8Hjwl/C28NYw9TEUcTOxUvFyMZGxsPHQce/yD3IvMk6ybnKOMq3yzbLtsw1zLXNNc21zjbOts83z7jQOdC60TzRvtI/0sHTRNPG1EnUy9VO1dHWVdbY11zX4Nhk2OjZbNnx2nba+9uA3AXcit0Q3ZbeHN6i3ynfr+A24L3hROHM4lPi2+Nj4+vkc+T85YTmDeaW5x/nqegy6LzpRunQ6lvq5etw6/vshu0R7ZzuKO6070DvzPBY8OXxcvH/8ozzGfOn9DT0wvVQ9d72bfb794r4Gfio+Tj5x/pX+uf7d/wH/Jj9Kf26/kv+3P9t////2wCEAAYHBwkLCQwNDQwQERAREBgWFBQWGCMZGxkbGSM1ISchISchNS85LysvOS9UQjs7QlRhUk5SYXZpaXaUjZTBwf8BBgcHCQsJDA0NDBAREBEQGBYUFBYYIxkbGRsZIzUhJyEhJyE1LzkvKy85L1RCOztCVGFSTlJhdmlpdpSNlMHB///AABEIACAAMAMBIgACEQEDEQH/xABwAAADAQADAAAAAAAAAAAAAAAFBgcEAQIDEAACAQQCAQQCAwAAAAAAAAABAgMABAUREiExBhNBUQdhFDJyAQEBAQAAAAAAAAAAAAAAAAADAgARAAIBBAIDAQAAAAAAAAAAAAECAAMREhMhQRQiMVH/2gAMAwEAAhEDEQA/AK/iMfGsagaIpq/hqIzoVLMX6dt7OKJkeViXAPJ91S40SK3eQj+pOhRqsdjPQ31jDcRWrSqsrjapRJ0FI8TY0tLknIdlAVig5Vius2XtIbgQsI5WAUdE/sNUl7Xi6GxDc43AJPRjFlLcSoUHj5rnE4O2gUSFQ0n39Vrt09yBSRROGRRGRonX0KtbfYLE/JMo8xBC4S43FHE4BkYDix/RNYvUPrGztpbZDcKY5y2uJ2F497ap4qZPJoFdmEHvuRwXXIE9efNL/wCSsM9jFjpdvxYOvdamH2gEev7Kq6vHLBzs6XqWHFxW6l7qxvHZpCdRqOSP3qiF3aNFaBpLeV9bZRyPTDxy1Qv8dJwwdtIzttgT388qo0s4KaHzS1EUObQqVWo1IZczvg5XawhaVSjFQeJGiN0bgIIf/VA5HWKJNNtSOjQ0Z2O1uVgcO3ugsrBdqOPwSPFRcTYz/9k=";
const CADA_FOTO_MS = 6500;
const urlDeFoto = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&q=85&auto=format&fit=crop`;

function FotoDeFondo() {
  const [actual, setActual] = useState(0);
  // La anterior se queda VISIBLE debajo mientras la nueva entra encima. Antes
  // todas se desvanecían a la vez y, al volver a la primera (que está debajo
  // de las demás en el DOM), por un instante se veía el fondo: un «refresco».
  const [anterior, setAnterior] = useState<number | null>(null);
  // Las otras fotos se piden después de la primera, no compiten con ella.
  const [cargarResto, setCargarResto] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const empezar = window.setTimeout(() => setCargarResto(true), 1500);
    const id = window.setInterval(() => setActual((i) => { setAnterior(i); return (i + 1) % HERO_FOTOS.length; }), CADA_FOTO_MS);
    return () => { window.clearTimeout(empezar); window.clearInterval(id); };
  }, []);
  const anchos = [800, 1200, 1600, 2200, 2800];
  return (
    <div aria-hidden className="absolute inset-0 isolate z-0 overflow-hidden bg-[#8a7a68]" style={{ backgroundImage: `url("${HERO_MINIATURA}")`, backgroundSize: "cover", backgroundPosition: "30% center" }}>
      {HERO_FOTOS.map((foto, i) => (i === 0 || cargarResto) && (
        // eslint-disable-next-line @next/next/no-img-element -- ya viene del tamaño justo desde Unsplash
        <img
          key={foto.id}
          src={urlDeFoto(foto.id, 1600)}
          srcSet={anchos.map((w) => `${urlDeFoto(foto.id, w)} ${w}w`).join(", ")}
          sizes="100vw"
          alt=""
          fetchPriority={i === 0 ? "high" : "low"}
          decoding="async"
          className={cn(
            "ccr-hero-foto-capa absolute inset-0 h-full w-full object-cover",
            i === actual ? "z-20 opacity-100 transition-opacity duration-[1400ms] ease-in-out" : i === anterior ? "z-10 opacity-100" : "z-0 opacity-0",
          )}
          style={{ objectPosition: foto.foco }}
        />
      ))}
      {/* Apenas un velo: la foto se ve clara y el panel da el contraste al texto. */}
      
    </div>
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
            <span className="block text-sm leading-snug text-[#162543] break-words">{s.label}</span>
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
            <span className="block text-sm leading-snug text-[#162543] break-words">{s.label}</span>
            {s.type === "canton" && (
              <span className="block text-xs leading-snug text-gray-400 break-words">{s.sublabel}</span>
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
          <span className="flex-1 min-w-0 block text-sm leading-snug text-[#162543] break-words">{a.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">Dirección</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

// EL TEXTO NUNCA SE CORTA: si lo escrito no cabe en su campo, la letra se
// achica de a poco (hasta un mínimo) para que entre completo.
function useLetraQueCabe(ref: RefObject<HTMLInputElement | null>, texto: string, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = "";
    const base = parseFloat(getComputedStyle(el).fontSize) || 16;
    if (!texto) return;
    const lienzo = document.createElement("canvas").getContext("2d");
    if (!lienzo) return;
    const estilo = getComputedStyle(el);
    lienzo.font = `${estilo.fontWeight} ${base}px ${estilo.fontFamily}`;
    const ancho = lienzo.measureText(texto).width;
    const libre = el.clientWidth - 2;
    if (ancho > libre && libre > 0) el.style.fontSize = `${Math.max(12, Math.floor(base * (libre / ancho) * 10) / 10)}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, ...deps]);
}

export function LandingHero() {
  const [service, setService] = useState("");
  // Qué campo se está usando: ese crece (con transición) y el otro se achica.
  const [foco, setFoco] = useState<"svc" | "loc" | null>(null);
  const [esTelefono, setEsTelefono] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const ver = () => setEsTelefono(m.matches);
    ver(); m.addEventListener("change", ver);
    return () => m.removeEventListener("change", ver);
  }, []);
  // The chosen service suggestion (so a category filters by id, not free text).
  const [serviceSel, setServiceSel] = useState<SearchSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // Anchor refs for the PORTALED dropdowns — one per field per breakpoint (desktop +
  // mobile both mount; the hidden one has a 0×0 rect, so its dropdown renders nothing).
  const svcDesktopRef = useRef<HTMLDivElement>(null);
  const svcMobileRef = useRef<HTMLDivElement>(null);
  // Las listas de sugerencias se anclan a TODA la píldora: anclada a un campo,
  // en el teléfono medían media pantalla y cortaban los nombres.
  const pildoraRef = useRef<HTMLDivElement>(null);
  // La portada dibuja las DOS variantes a la vez (una oculta por CSS) y ambas
  // llevaban el mismo ref: React se quedaba con la última, la de teléfono, así
  // que en escritorio el foco iba a un campo invisible y el Enter no hacía nada.
  const servicioInputRef = useRef<HTMLInputElement>(null);
  const servicioMobileRef = useRef<HTMLInputElement>(null);
  const enfocarVisible = (...refs: Array<React.RefObject<HTMLInputElement | null>>) => {
    const visible = refs.map((r) => r.current).find((el) => el && el.offsetParent !== null);
    (visible ?? refs[0]?.current)?.focus();
  };
  // Al elegir una sugerencia se rellena el campo, y ese cambio de texto volvía
  // a disparar la búsqueda de sugerencias: el panel reaparecía sobre el campo
  // de ubicación al que se acababa de saltar.
  const recienElegidoRef = useRef(false);
  const ubicacionInputRef = useRef<HTMLInputElement>(null);
  const ubicacionMobileRef = useRef<HTMLInputElement>(null);
  const locDesktopRef = useRef<HTMLDivElement>(null);
  const locMobileRef = useRef<HTMLDivElement>(null);
  // Location is a typeable autocomplete over provinces + cantones AND Google Places addresses.
  const [location, setLocation] = useState("");
  useLetraQueCabe(servicioInputRef, service, [foco, esTelefono]);
  useLetraQueCabe(ubicacionInputRef, location, [foco, esTelefono]);
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
  // BUSCAR RESPONDE AL TOQUE. La búsqueda general (Buscar sin escribir nada)
  // es lo que más se toca de la portada, y su página trae a todos los
  // profesionales: la primera vez de la sesión tardaba hasta 3 s y el botón no
  // decía nada (en producción, peor: un lienzo blanco de carga). Se precarga
  // entera cuando la portada ya terminó lo suyo, y mientras navega el botón
  // muestra que está buscando.
  const [buscando, startBusqueda] = useTransition();
  useEffect(() => {
    const id = window.setTimeout(() => {
      router.prefetch("/profesionales", { kind: "full" } as Parameters<typeof router.prefetch>[1]);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [router]);
  const nearMeActiveLabel = t("nearMeActive");

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
        if (recienElegidoRef.current) { recienElegidoRef.current = false; return; }
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
  function selectSuggestion(s: SearchSuggestion, correrBusqueda = false) {
    recienElegidoRef.current = true;
    setService(s.label);
    setServiceSel(s);
    setOpenSug(false);
    if (!location.trim()) {
      // Falta la ubicación: se pasa el foco en lugar de buscar a medias.
      setTimeout(() => enfocarVisible(ubicacionInputRef, ubicacionMobileRef), 0);
      return;
    }
    if (correrBusqueda) runSearch(s);
  }

  function selectLocation(s: LocationSuggestion, correrBusqueda = false) {
    setLocation(s.label);
    setLocationSel(s);
    pickedAddrRef.current = null;
    nearMeRef.current = null;
    setGeoError(null);
    setAddrSug([]);
    setOpenLoc(false);
    if (!service.trim()) {
      setTimeout(() => enfocarVisible(servicioInputRef, servicioMobileRef), 0);
      return;
    }
    if (correrBusqueda) runSearch(undefined, { kind: "taxonomy", sug: s });
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
    startBusqueda(() => router.push(rutaDeBusqueda(params)));
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
        // Se completa con la sugerencia marcada (o la mejor) y se salta al otro
        // campo; la búsqueda solo corre si ya están los dos.
        selectSuggestion(suggestions[activeIdx >= 0 ? activeIdx : 0], true);
        return;
      } else if (e.key === "Escape") {
        setOpenSug(false);
        return;
      }
    }
    // Sin sugerencias: con la ubicación vacía se salta a ella; si ya está, se busca.
    if (e.key === "Enter") {
      e.preventDefault();
      if (service.trim() && !location.trim()) {
        setOpenSug(false);
        enfocarVisible(ubicacionInputRef, ubicacionMobileRef);
        return;
      }
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
        const faltaServicio = !service.trim();
        if (locSug.length > 0) {
          const chosen = locSug[locActive >= 0 ? locActive : 0];
          setLocation(chosen.label);
          setLocationSel(chosen);
          pickedAddrRef.current = null;
          setOpenLoc(false);
          if (faltaServicio) { setTimeout(() => enfocarVisible(servicioInputRef, servicioMobileRef), 0); return; }
          runSearch(undefined, { kind: "taxonomy", sug: chosen });
        } else {
          setOpenLoc(false);
          await selectAddress(addrSug[0]);
          if (faltaServicio) { setTimeout(() => enfocarVisible(servicioInputRef, servicioMobileRef), 0); return; }
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
    <section className="ccr-hero-foto relative isolate flex min-h-[373px] items-end overflow-hidden sm:min-h-[480px] sm:items-center lg:min-h-[520px] lg:items-end">
      {/* Medidas de Angi en el teléfono: foto de ~373 px de alto, panel abajo
          con 35 px de margen inferior y 24 a los lados, negro al 32 %. En
          computadora, centrado. */}
      <FotoDeFondo />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-6 pt-40 sm:px-6 sm:py-10 lg:max-w-none lg:px-[10%] lg:pb-14 lg:pt-0">
      {/* El título y el buscador en un panel translúcido, centrado sobre la foto. */}
      <div className="ccr-hero-entra rounded-lg bg-black/[0.32] px-3.5 py-4 sm:px-10 sm:py-10 lg:mx-0 lg:rounded-md lg:bg-black/[0.22] lg:backdrop-blur-[1px] lg:max-w-[820px] lg:px-12 lg:py-12">
      {/* En computadora el panel va a la IZQUIERDA y el texto alineado a la izquierda, como Angi. */}
      <div className="relative mx-auto max-w-3xl pb-3.5 text-center sm:pb-7 lg:mx-0 lg:text-left">
        <h1
          className="font-extrabold text-white tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
          style={{ fontSize: "clamp(1.3rem, 5.9vw, 2.6rem)", lineHeight: 1.14 }}
          data-titular-portada=""
        >
          {/* Fijo, como Angi: con las fotos pasando de fondo, una palabra que
              además cambia eran dos cosas moviéndose a la vez. */}
          {/* «|» marca los cortes: siempre tres líneas, como Angi, y cada una
              entera (la letra se ajusta al ancho para que no se parta). */}
          {/* Dos líneas («|» marca el corte) y la palabra entre *asteriscos* en
              celeste: «verificados» es lo que distingue a ContrataCR. */}
          {t("titular").split("|").map((tramo, i) => (
            <span key={i} className="block whitespace-nowrap lg:inline lg:whitespace-normal">
              {tramo.split("*").map((parte, j) => (j % 2 ? <span key={j} className="text-[#7fd3f7]">{parte}</span> : parte))}{" "}
            </span>
          ))}
        </h1>
      </div>

      {/* ── Buscador ── */}
      <div className="mx-auto max-w-3xl lg:mx-0 lg:max-w-none">
        <form
          onSubmit={handleSearch}
          className="w-full"
        >
          {/* UNA píldora con los dos campos, como Angi, en todos los tamaños.
              Sin botón: elegir una sugerencia busca, y Enter también. */}
          <div className="relative">
            {/* Caja blanca de esquinas suaves: la misma forma que usa el
                buscador del navbar, para que al bajar se sienta que es el
                mismo buscador que se quedó pegado arriba. */}
            <div ref={pildoraRef} className="flex flex-col overflow-hidden rounded-2xl border border-white bg-white px-5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] sm:h-16 sm:flex-row sm:items-center sm:rounded-full sm:pl-7 sm:pr-6 lg:h-[68px] lg:pr-2.5 transition-shadow duration-300 focus-within:ring-2 focus-within:ring-[#009FD9]/20 hover:shadow-[0_12px_60px_rgba(0,159,217,0.20)]">
              {/* Service input — its dropdown PORTALS to <body> (anchored to this wrapper),
                  so the bar's `overflow-hidden` can never clip it. */}
              {/* EL SERVICIO NUNCA SE CORTA: elegido, su campo toma el ancho de su
                  nombre y la ubicación se queda con el resto (lo que se escribe
                  ahí se desplaza dentro de su campo). */}
              <div ref={svcDesktopRef} className="flex h-[54px] min-w-0 items-center gap-3 sm:h-full" style={esTelefono ? undefined : { flex: `0 0 ${foco === "loc" ? 44 : foco === "svc" ? 68 : 60}%`, transition: "flex-basis 0.38s cubic-bezier(0.22, 1, 0.36, 1)" }}>
                <Search className="h-5 w-5 shrink-0 text-[#162543] sm:hidden" aria-hidden />
                <input
                  type="text"
                  value={service}
                  onChange={(e) => { recienElegidoRef.current = false; setService(e.target.value); setServiceSel(null); }}
                  ref={servicioInputRef}
                  enterKeyHint={service.trim() && !location.trim() ? "next" : "search"}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { setFoco("svc"); if (suggestions.length > 0) setOpenSug(true); }}
                  onBlur={() => { setFoco((f) => (f === "svc" ? null : f)); setTimeout(() => setOpenSug(false), 120); }}
                  placeholder={t("searchPlaceholderShort")}
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-[#162543] placeholder:text-[#6b7686] focus:outline-none sm:text-lg"
                  role="combobox"
                  aria-expanded={openSug}
                  aria-autocomplete="list"
                />
                <SuggestionsDropdown anchorRef={pildoraRef} open={openSug} suggestions={suggestions} activeIdx={activeIdx} onPick={(s) => selectSuggestion(s, true)} />
              </div>
              {/* Divider + location autocomplete */}
              <div className="h-px w-full shrink-0 bg-[#e3e9ef] sm:mx-4 sm:my-3 sm:h-auto sm:w-px sm:self-stretch sm:bg-[#cfd8e2]" />
              <div ref={locDesktopRef} className="flex h-[54px] min-w-0 shrink-0 items-center gap-2 sm:h-full sm:flex-1 sm:shrink">
                <MapPin className="h-5 w-5 shrink-0 text-[#162543] sm:h-6 sm:w-6" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  ref={ubicacionInputRef}
                  enterKeyHint={location.trim() && !service.trim() ? "next" : "search"}
                  onKeyDown={handleLocKeyDown}
                  onFocus={() => { setFoco("loc"); ensureMaps(); setOpenLoc(location.trim().length >= 2); }}
                  onBlur={() => { setFoco((f) => (f === "loc" ? null : f)); setTimeout(() => setOpenLoc(false), 120); }}
                  placeholder={t("location")}
                  className="w-full min-w-0 flex-1 bg-transparent text-[16px] text-[#162543] placeholder:text-[#6b7686] focus:outline-none sm:text-lg"
                  role="combobox"
                  aria-expanded={openLoc}
                  aria-autocomplete="list"
                />
                <LocationDropdown anchorRef={pildoraRef} open={openLoc && location.trim().length >= 2} suggestions={locSug} addresses={addrSug} activeIdx={locActive} onPick={(s) => selectLocation(s, true)} onPickAddress={selectAddress} onNearMe={requestNearMe} nearMeLabel={t("nearMe")} geoLoading={geoLoading} />
              </div>
              {/* En computadora, la lupa que busca (como Angi). En el teléfono no:
                  elegir una sugerencia o Enter ya buscan. */}
              <button
                type="submit"
                aria-label={t("search")}
                className="ml-2 hidden h-12 w-12 shrink-0 place-items-center rounded-full bg-[#009FD9] text-white shadow-[0_6px_16px_-6px_rgba(0,159,217,0.8)] transition hover:bg-[#0089bb] lg:grid"
              >
                <Search className="h-5 w-5" strokeWidth={2.6} />
              </button>
            </div>
          </div>

        </form>

        {/* Sentinel — IntersectionObserver in navbar watches this */}
        <div id="hero-search-sentinel" aria-hidden className="h-0" />

        {geoError && (
          <p className="mt-3 text-center text-xs font-semibold text-red-200">{geoError}</p>
        )}

      </div>

      </div>
      </div>
    </section>
  );
}
