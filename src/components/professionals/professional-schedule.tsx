"use client";

/**
 * Reservar por el calendario está APAGADO.
 *
 * Las citas salieron del producto: no están en el menú del panel, «Mi agenda»
 * tampoco, y por lo tanto un profesional ya no puede agregar ni quitar horas.
 * Lo que quedaba era medio camino: 44 fichas seguían mostrando un calendario
 * —9.473 horas, casi todas puestas en julio y agosto y nunca revisadas— y un
 * cliente podía reservar una hora que el profesional ya ni recordaba. En toda
 * la historia de producción hubo CERO citas.
 *
 * No se borró nada: ni las horas, ni el código de reservar, ni la pantalla
 * /reservar. Con poner esto en `true` vuelve entero.
 */
const RESERVAR_POR_CALENDARIO = false;

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeText } from "@/lib/data/categories";
import { PROVINCES } from "@/lib/data/cr-geography";
import { fetchAvailabilityBatched } from "@/lib/availability-batch";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, Video } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { isTooSoonCR } from "@/lib/time-cr";
import { SelfActionModal, SELF_MSG } from "./self-action-modal";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";
import { Skeleton } from "@/components/ui/content-loading";

// Per-session memory of each professional's public agenda (5 minutes).
const AVAILABILITY_CACHE_TTL_MS = 5 * 60_000;
const availabilityCache = new Map<string, { availabilityPublic: boolean; slots: ScheduleSlot[]; at: number }>();
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { ContactButton } from "@/components/professionals/contact-button";
import { useNativeApp } from "@/hooks/use-native-app";

export type ScheduleSlot = { date: string; time: string; locationId?: string | null; categoryId?: string | null };

interface ProfessionalScheduleProps {
  professional: ProfessionalCardData;
  categoryName: string;
  availabilityPublic: boolean;
  contactPreference?: "solo_whatsapp" | "solo_citas" | "ambas";
  slots: ScheduleSlot[];
  /** Whether the initial slot list was already resolved on the server. Search
   *  cards set this false so profile data can render before availability. */
  slotsInitiallyLoaded?: boolean;
  /** When the client searched a specific profession, only show that one's slots. */
  activeCategory?: string;
  /** False when the searched service does not support video consultations: the
   *  card then hides the Videoconsulta place even if the profile has it on. */
  videoConsultApplies?: boolean;
  /** True when the viewer owns this profile — no self-service actions. */
  isOwn?: boolean;
  /** El visitante todavía no se sabe quién es (la ficha se pinta desde el
   *  servidor y la sesión llega un instante después). Mientras tanto, pulsar
   *  «Ver disponibilidad» en la ficha de uno mismo abría la reserva contra uno
   *  mismo: la acción se guarda y se ejecuta cuando ya se sabe. */
  viewerPendiente?: boolean;
  /** The LEFT-column professional info (photo, name, price, tags, rating),
   *  server-rendered by the card and slotted in so the schedule can own the desktop
   *  two-column layout while keeping ALL schedule state in this one component. */
  info?: ReactNode;
  /** Fallback location TAB label (province/cantón) shown only when the pro has no
   *  named workplaces, so the card always says WHERE they work. */
  placeFallback?: string;
  /** Fallback address line ("cantón, provincia") for the no-workplace case. */
  placeAddress?: string;
  /** Business/brand name — bolded as the venue prefix on a real workplace address. */
  businessName?: string;
  /** Abre la lista completa de zonas (la pestaña Información de la ficha). */
  onVerZonas?: () => void;
  /**
   * Debajo de esta tarjeta viene algo más —las redes del profesional, que las
   * pinta la ficha—. Sin eso, la raya que cierra la ubicación no separa nada:
   * queda una línea suelta contra el borde de la tarjeta.
   */
  hayContenidoDespues?: boolean;
  /** STACKED single-column layout for the professional-profile contact card (no two-column
   *  grid, no `info` slot): location tabs → 3-day strip → buttons. In stacked mode the
   *  contact buttons (WhatsApp + Llamar) ALWAYS show, plus "Ver disponibilidad" when
   *  bookable (Llamar renders outlined). Default false = the /buscar card layout (unchanged). */
  stacked?: boolean;
  /** Compartir el perfil: se dibuja con los demás botones de contacto. */
  /** Explicit video-consultation search result: clients coordinate by contact, no schedule strip. */
  forceContactOnly?: boolean;
  /** Preferred tab when search context should open a specific location/modality. */
  preferredLocationId?: string;
  /** Lo que la persona buscó (cantón o provincia): un lugar de trabajo de toda la
   *  provincia o de todo el país se muestra como «Atiende en Atenas», no como
   *  «Provincia de Alajuela», y va primero. */
  searchedPlace?: SearchedPlace;
  /** Restrict the selector to the preferred location when the current search matched only that modality. */
  restrictToPreferredLocation?: boolean;
  /** Search page: keep the schedule skeleton visible until the first map/filter shell is ready. */
  syncWithSearchLoading?: boolean;
}

// How many day-columns are shown at once, and how far ahead the arrows page.
const COLS = 3;
const BOOKING_MAX_FUTURE_DAYS = 90;

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Prototype-matching column label (relative): today → "Hoy"/"Today", tomorrow →
// "Mañana"/"Tomorrow", any other day → day number + short month.
// Example: "7 jul" / "Jul 7". `i` is the day's offset (in days) from today.
function dayColumnLabel(d: Date, i: number, locale: string): string {
  if (i === 0) return locale === "en" ? "Today" : "Hoy";
  if (i === 1) return locale === "en" ? "Tomorrow" : "Mañana";
  const month = monthShort(locale, d.getMonth());
  if (locale === "en") return `${month} ${d.getDate()}`;
  return `${d.getDate()} ${month}`;
}

// `toLocaleDateString` builds an Intl formatter on every call; with a screen of
// cards each showing several days it was the single hottest function of the
// page. Twelve names per language, computed once, is all the label needs.
const MONTH_SHORT: Record<string, string[]> = {};
function monthShort(locale: string, monthIndex: number) {
  const key = locale === "en" ? "en-US" : "es-CR";
  if (!MONTH_SHORT[key]) {
    MONTH_SHORT[key] = Array.from({ length: 12 }, (_, month) =>
      new Date(2024, month, 1).toLocaleDateString(key, { month: "short" }).replace(".", ""));
  }
  return MONTH_SHORT[key][monthIndex];
}

/**
 * Right-hand availability panel for search cards (HuliHealth-style).
 *  - Public: a 3-day column carousel with tappable time chips that open the
 *    booking flow pre-selected, plus arrows to page further out and a
 *    "Ver disponibilidad" link to the full profile.
 *  - Private: lock state with "Contáctanos por Whatsapp" + "por llamada".
 */
export type SearchedPlace = { cantonId?: string; cantonName?: string; provinceId?: string; provinceName?: string };

// Un lugar de trabajo que cubre una provincia entera o el país entero. Los viejos
// no traen `level`: se reconocen por el nombre con el que se guardaron.
function cubreProvinciaEntera(w: { level?: string; cantonId?: string; provinciaId?: string; name?: string }, nombre: string) {
  return w.level === "provincia" || (!w.cantonId && !!w.provinciaId) || /^Toda la provincia de\s/i.test(nombre) || /^All of .+ province$/i.test(nombre);
}
function cubrePaisEntero(w: { level?: string; id?: string }, nombre: string) {
  return w.level === "country" || w.id === "wp_todo_costa_rica" || /^Todo Costa Rica$/i.test(nombre) || /^All of Costa Rica$/i.test(nombre);
}

export function ProfessionalSchedule({ professional, categoryName, searchedPlace, availabilityPublic, contactPreference = "ambas", videoConsultApplies = true, slots: allSlots, slotsInitiallyLoaded = true, activeCategory, isOwn = false, viewerPendiente = false, info, placeFallback = "", placeAddress = "", businessName = "", onVerZonas, stacked = false, forceContactOnly = false, preferredLocationId, restrictToPreferredLocation = false, syncWithSearchLoading = false, hayContenidoDespues = false}: ProfessionalScheduleProps) {
  // ¿Se buscó una zona? Con una zona en la búsqueda, todo lo que sale la cubre.
  const zonaBuscada = Boolean(searchedPlace?.cantonName?.trim() || searchedPlace?.provinceName?.trim());
  const t = useTranslations("schedule");
  const tLoading = useTranslations("loading");
  const locale = useLocale();
  // Qué ubicación se está buscando, para poner delante los lugares que sirven.
  const searchParams = useSearchParams();
  const nativeApp = useNativeApp();
  const scheduleRootRef = useRef<HTMLDivElement>(null);
  const [shouldAutoRefresh, setShouldAutoRefresh] = useState(stacked || !slotsInitiallyLoaded);
  const [liveData, setLiveData] = useState<{
    professionalId: string;
    availabilityPublic: boolean;
    slots: ScheduleSlot[];
  } | null>(() => {
    // Seen this professional's agenda recently? Paint it now and refresh quietly,
    // instead of a skeleton on every visit to the same results.
    const cached = availabilityCache.get(professional.id);
    return cached && Date.now() - cached.at < AVAILABILITY_CACHE_TTL_MS ? { professionalId: professional.id, availabilityPublic: cached.availabilityPublic, slots: cached.slots } : null;
  });
  const liveSlots = liveData?.professionalId === professional.id ? liveData.slots : allSlots;
  const liveAvailabilityPublic = liveData?.professionalId === professional.id ? liveData.availabilityPublic : availabilityPublic;
  // Schedules are per-LOCATION, not per-profession: a pro at a location is reachable
  // at those hours regardless of which service was searched. So we show ALL of the
  // pro's slots (no profession filter). `activeCategory` is still used purely as the
  // booking context (which service the request is about), not to hide hours.
  const slots = liveSlots.filter((s) => !s.locationId?.startsWith("cov_"));
  const hasInitialDisplayableSlots = allSlots.some((s) => !s.locationId?.startsWith("cov_"));
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  // When the pro acts on their OWN card we block the action with a friendly modal
  // instead of hiding the buttons (the card looks identical to a client's view).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);
  const [searchShellLoading, setSearchShellLoading] = useState(false);

  useEffect(() => {
    if (!slotsInitiallyLoaded) {
      queueMicrotask(() => setShouldAutoRefresh(true));
      return;
    }
    if (stacked) {
      return;
    }
    const el = scheduleRootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setShouldAutoRefresh(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShouldAutoRefresh(entry.isIntersecting),
      { rootMargin: "360px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [slotsInitiallyLoaded, stacked]);

  // What the professional accepts. Booking needs public availability AND a
  // preference that isn't WhatsApp-only; WhatsApp shows unless they chose
  // appointments-only. Hoy, además, el calendario está apagado de raíz: ver
  // RESERVAR_POR_CALENDARIO arriba del archivo.
  const canBook = RESERVAR_POR_CALENDARIO && !forceContactOnly && liveAvailabilityPublic && contactPreference !== "solo_whatsapp";
  const awaitingProfileAvailability =
    stacked &&
    !slotsInitiallyLoaded &&
    shouldAutoRefresh &&
    !forceContactOnly &&
    liveAvailabilityPublic &&
    contactPreference !== "solo_whatsapp" &&
    liveData?.professionalId !== professional.id &&
    !hasInitialDisplayableSlots;
  const scheduleLoading =
    awaitingProfileAvailability ||
    (canBook && !slotsInitiallyLoaded && liveData?.professionalId !== professional.id);
  // Map hydration must not invent an availability grid for professionals who
  // have no known slots. Only synchronize a real, already-known schedule with
  // the search shell; an actual availability request keeps its own loader.
  const visualScheduleLoading = scheduleLoading
    || (syncWithSearchLoading && searchShellLoading && hasInitialDisplayableSlots);

  useEffect(() => {
    if (!syncWithSearchLoading) {
      queueMicrotask(() => setSearchShellLoading(false));
      return;
    }
    const mapState = window as typeof window & {
      __ccrSearchMapLoading?: boolean;
      __ccrSearchMapReady?: boolean;
    };
    let active = true;
    queueMicrotask(() => {
      if (active) setSearchShellLoading(true);
    });
    let mapReady = mapState.__ccrSearchMapReady === true && mapState.__ccrSearchMapLoading !== true;
    let minimumPaintDone = false;
    let minimumTimer: number | null = null;
    let fallbackTimer: number | null = null;
    const clearTimers = () => {
      if (minimumTimer) window.clearTimeout(minimumTimer);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      minimumTimer = null;
      fallbackTimer = null;
    };
    const tryFinish = () => {
      if (!active || !mapReady || !minimumPaintDone) return;
      setSearchShellLoading(false);
    };
    const beginCycle = () => {
      clearTimers();
      mapReady = false;
      minimumPaintDone = false;
      setSearchShellLoading(true);
      minimumTimer = window.setTimeout(() => {
        minimumPaintDone = true;
        tryFinish();
      }, 900);
      fallbackTimer = window.setTimeout(() => {
        mapReady = true;
        minimumPaintDone = true;
        tryFinish();
      }, 3000);
    };
    const start = () => {
      if (!active) return;
      beginCycle();
    };
    const finish = () => {
      if (!active) return;
      mapReady = true;
      tryFinish();
    };
    const markReady = () => finish();
    beginCycle();
    window.addEventListener("ccr:search-map-loading", start);
    window.addEventListener("ccr:search-map-ready", markReady);
    if (mapState.__ccrSearchMapReady) {
      queueMicrotask(finish);
    }
    return () => {
      active = false;
      window.removeEventListener("ccr:search-map-loading", start);
      window.removeEventListener("ccr:search-map-ready", markReady);
      clearTimers();
    };
  }, [syncWithSearchLoading, professional.id]);

  useEffect(() => {
    if (!shouldAutoRefresh) return;
    let active = true;
    let debounce: number | null = null;

    async function refreshPublicAvailability() {
      if (document.visibilityState !== "visible") return;
      try {
        // Cards on the same screen share one request (see availability-batch).
        const json = await fetchAvailabilityBatched(professional.id);
        if (!active) return;
        if (!json) {
          setLiveData({ professionalId: professional.id, availabilityPublic, slots: allSlots });
          return;
        }
        const next = {
          professionalId: professional.id,
          availabilityPublic: typeof json.availabilityPublic === "boolean" ? json.availabilityPublic : availabilityPublic,
          slots: Array.isArray(json.slots) ? (json.slots as ScheduleSlot[]) : allSlots,
        };
        availabilityCache.set(professional.id, { availabilityPublic: next.availabilityPublic, slots: next.slots, at: Date.now() });
        setLiveData(next);
      } catch {
        // Resolve the loading state with the server fallback if live refresh fails.
        if (active) setLiveData({ professionalId: professional.id, availabilityPublic, slots: allSlots });
      }
    }

    function refreshSoon() {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(refreshPublicAvailability, 450);
    }

    refreshSoon();
    window.addEventListener("focus", refreshSoon);
    window.addEventListener("notificationsChanged", refreshSoon);
    window.addEventListener("ccr:availability-changed", refreshSoon);
    return () => {
      active = false;
      if (debounce) window.clearTimeout(debounce);
      window.removeEventListener("focus", refreshSoon);
      window.removeEventListener("notificationsChanged", refreshSoon);
      window.removeEventListener("ccr:availability-changed", refreshSoon);
    };
  }, [allSlots, availabilityPublic, professional.id, shouldAutoRefresh]);

  // Distinct fixed/base locations present in the published slots. Chips let the
  // client choose WHICH physical place a slot is for before booking.
  function locLabel(id: string | null): string {
    if (!id || id === "general") return "General";
    if (id === "videoconsulta") return t("videoconsulta");
    if (id.startsWith("cov_")) return t("atHome");
    const workplace = professional.workplaces?.find((w) => w.id === id);
    const workplaceLabel = typeof (workplace as { label?: unknown } | undefined)?.label === "string"
      ? ((workplace as { label?: string }).label ?? "").trim()
      : "";
    return workplace?.name?.trim() || workplaceLabel || t("location");
  }
  function locTabLabel(label: string): string {
    return label
      .replace(/^Toda la provincia de\s+/i, "Provincia de ")
      .replace(/^All of (.+) province$/i, "$1 province");
  }
  // Street address for the detail line shown UNDER the location tabs. Only physical
  // workplaces have one — coverage zones (cov_*) / videoconsulta / general don't.
  function locAddress(id: string | null): string {
    if (!id || id === "general" || id === "videoconsulta" || id.startsWith("cov_")) return "";
    return professional.workplaces?.find((w) => w.id === id)?.address?.trim() ?? "";
  }
  // ── SERVICE LOCATIONS (the durable list the selector is built from) ──
  // DURABLE source = the pro's named WORKPLACES, UNION any extra distinct fixed
  // locations their slots carry. Keyed by id. `cov_*` is travel coverage, not a
  // schedule place, so legacy slots with those ids are ignored for the tab row.
  //
  // WHY THIS (the recurring regression): the selector kept disappearing whenever it
  // was derived from the SLOTS alone — a multi-location pro who only published hours at
  // ONE of their locations (or whose upcoming slots happened to be at one place)
  // produced a single slot-group, so the selector vanished. Basing it on the pro's
  // actual locations makes it appear RELIABLY for every multi-location pro, regardless
  // of which locations currently have upcoming slots. DO NOT revert this to a
  // slots-only derivation.
  const locationOptions = useMemo(() => {
    const map = new Map<string, string>(); // id -> label, insertion-ordered
    const videoLabel = t("videoconsulta");
    const normalizedVideoLabel = videoLabel.trim().toLocaleLowerCase();
    // Quien buscó «Atenas» y encuentra a alguien que cubre toda Alajuela debe
    // leer el lugar EXACTAMENTE como lo lee en quien tiene Atenas fijo —«Atenas,
    // Alajuela»—, no «Provincia de Alajuela» ni un rótulo aparte: la cobertura
    // es real y el lugar buscado es el que confirma que sí le sirve. Va primero
    // en la fila. Sin cantón buscado no se re-rotula nada: quien cubre el país
    // sigue diciendo «Todo Costa Rica».
    // Buscar UNA PROVINCIA entera es igual de concreto que buscar un cantón: quien
    // cubre Alajuela debe leerse «Alajuela», no «Toda la provincia de Alajuela».
    // El rótulo largo suena a promesa vaga al lado de quien dice «Atenas», y la
    // cobertura es exactamente la que se pidió: decirla con el nombre del lugar
    // buscado la pone en igualdad, sin exagerar nada.
    const lugarBuscado = searchedPlace?.cantonName
      ? [searchedPlace.cantonName, searchedPlace.provinceName].filter(Boolean).join(", ")
      : searchedPlace?.provinceName?.trim() || "";
    // Si el profesional YA tiene ese cantón entre sus lugares, la cobertura
    // amplia se queda con su propio nombre: si no, la fila mostraba dos veces
    // «Atenas, Alajuela» —el lugar de verdad y la provincia re-rotulada— y
    // parecía un error.
    const yaAtiendeElCanton = !!lugarBuscado && (professional.workplaces ?? []).some((w) => {
      const lugar = w as { cantonId?: string; name?: string };
      return (!!searchedPlace?.cantonId && lugar.cantonId === searchedPlace.cantonId)
        || (lugar.name?.trim() ?? "") === lugarBuscado;
    });
    const primero = new Map<string, string>();
    for (const w of professional.workplaces ?? []) {
      const rawLabel = (w as { label?: unknown }).label;
      const label = w.name?.trim() || (typeof rawLabel === "string" ? rawLabel.trim() : "");
      const isVideoWorkplace = label.trim().toLocaleLowerCase() === normalizedVideoLabel || (w as { type?: unknown }).type === "video";
      if (isVideoWorkplace && !videoConsultApplies) continue;
      const id = isVideoWorkplace ? "videoconsulta" : (w.id || (professional.workplaces?.length === 1 ? "general" : ""));
      if (!id || !label) continue;
      const lugar = w as { level?: string; cantonId?: string; provinciaId?: string; name?: string; id?: string };
      const cubreLaProvinciaBuscada = !!lugarBuscado && cubreProvinciaEntera(lugar, label)
        && ((!!searchedPlace?.provinceId && lugar.provinciaId === searchedPlace.provinceId) || (!!searchedPlace?.provinceName && label.includes(searchedPlace.provinceName)));
      const cubreElPaisYBuscaronLugar = !!lugarBuscado && cubrePaisEntero(lugar, label);
      if (!isVideoWorkplace && !yaAtiendeElCanton && (cubreLaProvinciaBuscada || cubreElPaisYBuscaronLugar)) {
        const repetido = Array.from(primero.values()).includes(lugarBuscado)
          || Array.from(map.values()).includes(lugarBuscado);
        if (!primero.size && !repetido) primero.set(id, lugarBuscado);
        continue;
      }
      map.set(id, label);
    }
    for (const [id, label] of Array.from(map)) { if (!primero.has(id)) primero.set(id, label); }
    map.clear();
    for (const [id, label] of primero) map.set(id, label);
    for (const s of slots) {
      const id = s.locationId;
      if (id?.startsWith("cov_")) continue;
      const label = id && id !== "general" ? locLabel(id) : "";
      if (id && id !== "general" && label && label !== t("location") && !map.has(id)) map.set(id, label);
    }
    const hasVideoOption = map.has("videoconsulta") || Array.from(map.values()).some((label) => label.trim().toLocaleLowerCase() === normalizedVideoLabel);
    if (videoConsultApplies && (professional.videoconsulta || professional.coverage?.country) && !hasVideoOption) {
      map.set("videoconsulta", videoLabel);
    }
    return Array.from(map, ([id, label]) => ({ id, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professional.coverage?.country, professional.workplaces, professional.videoconsulta, searchedPlace, slots, t, videoConsultApplies]);

  const visibleLocationOptions = useMemo(() => {
    if ((forceContactOnly || restrictToPreferredLocation) && preferredLocationId) {
      const preferred = locationOptions.find((o) => o.id === preferredLocationId);
      if (preferred) return [preferred];
    }
    if (locationOptions.length <= 1) return locationOptions;

    const hasSpecificAvailability = (id: string) => slots.some((slot) => {
      const loc = slot.locationId ?? "general";
      if (loc === id) return true;
      // A single-location pro may store legacy/public availability as "general";
      // in a multi-location selector, keep "general" from making every tab look
      // equally available because that would hide the truly useful ordering.
      return locationOptions.length === 1 && loc === "general";
    });

    // El lugar buscado se queda primero aunque otra sede tenga horarios
    // publicados: es la razón por la que este perfil apareció.
    const rotuloBuscado = searchedPlace?.cantonName
      ? [searchedPlace.cantonName, searchedPlace.provinceName].filter(Boolean).join(", ")
      : null;
    return locationOptions
      .map((option, index) => ({ option, index, hasAvailability: hasSpecificAvailability(option.id), buscado: !!rotuloBuscado && option.label === rotuloBuscado }))
      .sort((a, b) => Number(b.buscado) - Number(a.buscado) || Number(b.hasAvailability) - Number(a.hasAvailability) || a.index - b.index)
      .map(({ option }) => option);
  }, [forceContactOnly, locationOptions, preferredLocationId, restrictToPreferredLocation, searchedPlace, slots]);

  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  // Default to the first location that ACTUALLY has slots (so the card doesn't open on an
  // empty location), else the first option. Resolved even when there's only ONE location —
  // so a single location renders in the SELECTED (active, brand-blue + underline) state,
  // identical to a chosen tab in the multi-location case (and shows its address). When the
  // pro has no named workplaces at all, there's nothing to select (handled by the fallback).
  const defaultLoc = visibleLocationOptions.length > 0
    ? (visibleLocationOptions.find((o) => preferredLocationId && o.id === preferredLocationId)?.id
      ?? visibleLocationOptions[0].id)
    : null;
  const effectiveId = selectedLoc && visibleLocationOptions.some((o) => o.id === selectedLoc) ? selectedLoc : defaultLoc;
  // STRICT per-location: a selected location shows ONLY its OWN slots — plus any
  // location-agnostic "general" slots (available anywhere) — so a slot available only
  // at B can NEVER appear under A. A selected location with no slots shows the
  // honest "no upcoming times" state (it doesn't borrow another location's hours).
  const filteredSlots = useMemo(() => {
    if (!effectiveId) return slots;
    const knownLocationIds = new Set(visibleLocationOptions.map((o) => o.id));
    const defaultPhysicalLocationId = visibleLocationOptions.find((o) => o.id !== "videoconsulta")?.id ?? visibleLocationOptions[0]?.id ?? null;
    return slots.filter((s) => {
      const loc = s.locationId ?? "general";
      const unknownFixedLocation = loc !== "general" && !loc.startsWith("cov_") && !knownLocationIds.has(loc);
      if (unknownFixedLocation && effectiveId === defaultPhysicalLocationId) return true;
      if (visibleLocationOptions.length === 1 && !visibleLocationOptions.some((o) => o.id === loc) && !loc.startsWith("cov_")) return true;
      return loc === effectiveId || loc === "general";
    });
  }, [slots, effectiveId, visibleLocationOptions]);

  // ── LOCATION control (LEFT column, under the rating) — a HORIZONTAL TAB ROW on a
  // hairline divider, then the selected place's ADDRESS. Built ONCE and ALWAYS shown
  // (independent of whether there are upcoming slots) so a pro with no published
  // schedule still says WHERE they work. When the pro has no named workplaces we fall
  // back to a single static province/cantón tab. (Supersedes §50's right-rail placement.)
  const hasRealLoc = visibleLocationOptions.length > 0;
  const locTabs = hasRealLoc
    ? visibleLocationOptions
    : (placeFallback ? [{ id: "__fallback", label: placeFallback }] : []);
  // Los lugares que se muestran no pueden ser "los dos primeros de la lista":
  // si alguien busca en Cartago y el profesional atiende en San José, Heredia y
  // Cartago, la tarjeta enseñaba los dos que NO le sirven y escondía el bueno
  // detrás del "+2". Se ordenan poniendo delante los que coinciden con la
  // ubicación que se está buscando.
  const zonasBuscadas = useMemo(() => {
    const terminos: string[] = [];
    const ubicacion = searchParams?.get("ubicacion");
    if (ubicacion) terminos.push(ubicacion);
    const cantonId = searchParams?.get("canton");
    const provinciaId = searchParams?.get("provincia");
    for (const provincia of PROVINCES) {
      if (provinciaId && provincia.id === provinciaId) terminos.push(provincia.name);
      for (const canton of provincia.cantons) {
        if (cantonId && canton.id === cantonId) terminos.push(canton.name, provincia.name);
      }
    }
    return terminos.flatMap((termino) => normalizeText(termino).split(/[\s,]+/)).filter((parte) => parte.length >= 4);
  }, [searchParams]);

  const coincideConLaBusqueda = useMemo(() => {
    if (zonasBuscadas.length === 0) return () => false;
    return (option: { id: string; label: string }) => {
      const texto = normalizeText(`${option.label} ${locAddress(option.id)}`);
      return zonasBuscadas.some((parte) => texto.includes(parte));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonasBuscadas, professional.workplaces]);

  const locTabsOrdenados = useMemo(() => {
    if (locTabs.length <= 2 || zonasBuscadas.length === 0) return locTabs;
    const cerca = locTabs.filter(coincideConLaBusqueda);
    if (cerca.length === 0) return locTabs;
    return [...cerca, ...locTabs.filter((option) => !cerca.some((c) => c.id === option.id))];
  }, [locTabs, zonasBuscadas, coincideConLaBusqueda]);

  // Todos los lugares en el carril. Antes solo cabían dos y el resto vivía
  // detrás de un «+4» que había que abrir; con el calendario apagado la fila
  // dejó de ser un selector y pasó a ser información —dónde atiende—, y un dato
  // informativo no se esconde tras un menú: se desliza.
  const primaryLocationTabs = locTabsOrdenados;
  const hiddenLocationTabs: typeof locTabsOrdenados = [];
  const extraLocationCount = 0;
  // Con el calendario apagado la fila dejó de ser un selector: es una sola
  // línea informativa —la zona principal y cuántas más hay—, y la lista
  // completa vive en Información.
  const zonasRestantes = Math.max(0, primaryLocationTabs.length - 1);
  const zonaPrincipalEsVideo = primaryLocationTabs[0]?.id === "videoconsulta"
    || (!hasRealLoc && videoConsultApplies && !!(professional.videoconsulta || professional.coverage?.country));
  // Address under the tabs: follow the selected tab. If a workplace has no exact
  // address, show that tab label instead of falling back to another location from
  // the search result.
  const isVideoLocation = effectiveId === "videoconsulta";
  const workplaceAddr = hasRealLoc && effectiveId && !isVideoLocation ? locAddress(effectiveId) : "";
  const selectedLocationLabel = hasRealLoc && effectiveId && !isVideoLocation
    ? visibleLocationOptions.find((o) => o.id === effectiveId)?.label?.trim() ?? ""
    : "";
  const addressLineRaw = isVideoLocation
    ? ""
    : hasRealLoc
      ? (workplaceAddr || selectedLocationLabel)
      : (placeAddress || "");
  // The tabs row already names the place: a "whole province" note or a repeat of
  // the selected tab adds nothing, so only REAL street addresses render below.
  const addressLine = /^(toda la provincia|all of )/i.test(addressLineRaw.trim()) || (selectedLocationLabel.trim() !== "" && addressLineRaw.trim() === selectedLocationLabel.trim())
    ? ""
    : addressLineRaw;
  const venueName = workplaceAddr ? businessName.trim() : "";
  useEffect(() => {
    if (!locationMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!locationMenuRef.current?.contains(event.target as Node)) setLocationMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    // La tarjeta de /buscar aísla su pintado (content-visibility) y ese
    // recorte cortaba el menú justo al borde de la tarjeta. Mientras el menú
    // está abierto, la tarjeta suelta el aislamiento; al cerrarlo, vuelve.
    const tarjeta = locationMenuRef.current?.closest(".ccr-search-card-slot");
    tarjeta?.classList.add("ccr-menu-abierto");
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      tarjeta?.classList.remove("ccr-menu-abierto");
    };
  }, [locationMenuOpen]);
  const locationControl = locTabs.length > 0 ? (
    <div
      className="relative z-30 w-full min-w-0"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Dónde atiende. Sin calendario esto ya no es un selector, así que no se
          comporta como uno: ni carril que hay que arrastrar, ni flechas, ni un
          «+4» que abre un menú. Es texto que FLUYE y se acomoda en una o dos
          líneas, con los lugares separados por un punto — lo mismo que hace
          cualquier ficha con una lista corta de datos.
          Se probó con carril y con flechas: el carril esconde lugares detrás de
          un gesto que en computadora casi nadie hace, y las flechas metían dos
          botones dentro de una tarjeta que ya tiene los suyos. La lista completa
          vive en la ficha, a un toque.
          Con el calendario encendido vuelve a ser pestañas: ahí sí hay que
          elegir, y para eso se conserva el camino de abajo. */}
      <div className="relative" ref={locationMenuRef}>
        {/* Cuántas zonas quedan fuera de la línea, y si la primera es la
            videoconsulta (que no es un lugar pero se lee igual). */}
        {RESERVAR_POR_CALENDARIO ? (
        <ScrollRail
          className="flex min-w-0 items-center gap-3 pb-[2px]"
          role="tablist"
          aria-label={t("location")}
        >
          {primaryLocationTabs.map((o) => {
            const active = hasRealLoc ? o.id === effectiveId : true;
            const isVideoTab = o.id === "videoconsulta" || (!hasRealLoc && videoConsultApplies && (professional.videoconsulta || professional.coverage?.country));
            return (
              <button
                key={o.id}
                data-location-tab=""
                type="button"
                role="tab"
                aria-selected={active}
                onClick={hasRealLoc
                  ? (e) => {
                      e.stopPropagation();
                      setSelectedLoc(o.id);
                      setOffset(0);
                    }
                  : (e) => e.stopPropagation()}
                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap py-0 text-[12px] font-semibold transition-colors ${
                  active ? "text-[#009FD9]" : "text-[#6b7280] hover:text-[#009FD9]"
                }`}
                title={locTabLabel(o.label)}
              >
                {isVideoTab ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                <span className="whitespace-nowrap">{locTabLabel(o.label)}</span>
              </button>
            );
          })}
        </ScrollRail>
        ) : (
          // UNA zona, no la lista entera. La lista completa —con sus direcciones
          // y la videoconsulta— ya vive en Información, así que aquí estaba
          // repetida: seis zonas gastaban tres renglones del sitio más caro de
          // la ficha y empujaban los botones de contactar hacia abajo. Arriba
          // queda lo justo para saber si sirve, y «+N zonas» lleva a la lista.
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] font-semibold leading-5 text-[#6b7280]" aria-label={t("location")}>
            <span className="inline-flex min-w-0 items-center gap-1">
              {zonaPrincipalEsVideo ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
              <span className="min-w-0">{locTabLabel(primaryLocationTabs[0].label)}</span>
            </span>
            {/* «+N zonas más» cuando dice algo.
                En la FICHA es un botón que abre Información con la lista entera.
                En una TARJETA de resultados depende de si se buscó una zona:
                  · con zona buscada, sobra — que la tarjeta aparezca ya
                    significa que la cubre, y el contador contesta algo que
                    nadie preguntó;
                  · sin zona buscada, hace falta — es lo único que avisa de que
                    este profesional trabaja en más sitios que el que se lee, y
                    tocar la tarjeta lleva a la lista completa. */}
            {zonasRestantes > 0 && (onVerZonas || !zonaBuscada) && (
              onVerZonas ? (
                <button
                  type="button"
                  onClick={onVerZonas}
                  className="shrink-0 rounded-sm font-bold text-[#007fae] underline-offset-2 hover:underline"
                >
                  {t("moreZones", { count: zonasRestantes })}
                </button>
              ) : (
                <span className="shrink-0 font-bold text-[#52627a]">{t("moreZones", { count: zonasRestantes })}</span>
              )
            )}
          </p>
        )}
        {locationMenuOpen && extraLocationCount > 0 && (
          <div className="absolute right-0 top-[calc(100%+0.35rem)] z-[120] min-w-[13rem] max-w-[min(18rem,calc(100vw-3rem))] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-[0_12px_30px_rgba(15,39,71,0.18)]" role="menu">
            {hiddenLocationTabs.map((option) => {
              const active = option.id === effectiveId;
              const isVideo = option.id === "videoconsulta";
              return (
                <button
                  key={`location-menu-${option.id}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedLoc(option.id);
                    setOffset(0);
                    setLocationMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold transition-colors ${active ? "bg-[#edf8fc] text-[#009FD9]" : "text-[#162543] hover:bg-[#f4f7fa]"}`}
                >
                  {isVideo ? <Video className="h-3.5 w-3.5 shrink-0" /> : <MapPin className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{locTabLabel(option.label)}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {(addressLine || hayContenidoDespues) && <div className="mt-1 h-px w-full bg-[#e5e7eb]" aria-hidden />}
      {addressLine && (
        <p className="mt-1.5 text-[11px] leading-snug text-[#6b7280]">
          {venueName && <span className="font-semibold text-[#374151]">{venueName} · </span>}
          {addressLine}
        </p>
      )}
    </div>
  ) : null;

  // Rolling window of upcoming days, keyed to the FULL slot so picking carries the
  // (service + location) context into the booking.
  const days = useMemo(() => {
    const byDate = new Map<string, ScheduleSlot[]>();
    for (const s of filteredSlots) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date)!.push(s);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: BOOKING_MAX_FUTURE_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toKey(d);
      // Hide any slot within the 15-minute lead time (today only) — it's no longer
      // bookable, so it must stop showing in search.
      const items = (byDate.get(key) ?? []).filter((s) => !isTooSoonCR(key, s.time)).sort((a, b) => a.time.localeCompare(b.time));
      // Relative column label (Hoy / Mañana / "Jue 18"), matching the prototype.
      const label = dayColumnLabel(d, i, locale);
      return { key, label, soon: i <= 1, items, dayIndex: i };
    });
  }, [filteredSlots, locale]);

  // Does the pro publish ANY upcoming bookable time at ANY of their locations? This
  // lets us tell "this pro has no public schedule at all" apart from "this LOCATION has
  // no times" (the pro DOES book — just not at the place currently selected) — the two
  // get different notes. Built over the unfiltered `slots`, same window/lead-time rules.
  const hasUpcomingAnywhere = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < BOOKING_MAX_FUTURE_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toKey(d);
      if (slots.some((s) => s.date === key && !isTooSoonCR(key, s.time))) return true;
    }
    return false;
  }, [slots]);

  // La acción que se pulsó antes de saber quién visita, para repetirla apenas
  // se sepa.
  const accionPendienteRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (viewerPendiente) return;
    const accion = accionPendienteRef.current;
    if (!accion) return;
    accionPendienteRef.current = null;
    accion();
  }, [viewerPendiente]);

  function pick(slot: ScheduleSlot) {
    if (viewerPendiente) { accionPendienteRef.current = () => pick(slot); return; }
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    trackMetaEvent("InitiateCheckout", {
      content_type: "professional_service",
      source: stacked ? "profile_schedule_slot" : "search_schedule_slot",
      has_selected_time: true,
    });
    trackInteraction({
      type: "schedule_slot_selected",
      professionalId: professional.id,
      source: stacked ? "profile" : "search",
      locale,
      categoryId: slot.categoryId ?? activeCategory ?? null,
    });
    // Sin cuenta TAMBIÉN se reserva. Pedir registro antes de dejar hacer lo
    // único a lo que se vino es lo que tenía el embudo en cero: entre el
    // 1 de agosto y hoy, 50 personas se fueron por WhatsApp y ninguna terminó
    // una reserva; diez de las doce que la empezaron no tenían sesión. El
    // servidor siempre aceptó la reserva de un invitado —guarda nombre,
    // teléfono y correo, y manda un enlace para crear la cuenta después—: el
    // muro estaba solo aquí.
    irAReservar(slot);
  }

  // La reserva es una PÁGINA, no una capa sobre esta pantalla: se navega con el
  // contexto (servicio, fecha, hora y lugar) en la dirección.
  function irAReservar(slot?: { date: string; time: string; categoryId?: string | null; locationId?: string | null } | null) {
    const params = new URLSearchParams();
    const categoria = slot?.categoryId ?? activeCategory ?? null;
    if (categoria) params.set("servicio", categoria);
    if (slot?.date) params.set("fecha", slot.date);
    if (slot?.time) params.set("hora", slot.time);
    const lugar = slot?.locationId ?? (effectiveId && effectiveId !== "general" ? effectiveId : null);
    if (lugar) {
      params.set("lugar", lugar);
      const etiqueta = locLabel(lugar);
      if (etiqueta) params.set("lugarNombre", etiqueta);
    }
    // De dónde salió la reserva, para que la flecha devuelva ahí mismo.
    if (typeof window !== "undefined") {
      const aqui = `${window.location.pathname}${window.location.search}`.replace(/^\/(es|en)(?=\/|$)/, "");
      if (aqui) params.set("desde", aqui);
    }
    const cola = params.toString();
    router.push(`/profesionales/${professional.slug}/reservar${cola ? `?${cola}` : ""}`);
  }

  // Se conserva para cuando vuelvan las citas: las horas del calendario entran por
  // irAReservar, y este atajo era el botón "Ver disponibilidad".
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openBooking() {
    if (viewerPendiente) { accionPendienteRef.current = openBooking; return; }
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    trackMetaEvent("InitiateCheckout", {
      content_type: "professional_service",
      source: stacked ? "profile_schedule" : "search_schedule",
      has_selected_time: false,
    });
    trackInteraction({
      type: "availability_view",
      professionalId: professional.id,
      source: stacked ? "profile" : "search",
      locale,
      categoryId: activeCategory ?? null,
    });
    irAReservar(null);
  }

  // Self-action notice — rendered in every branch so the pro's own card shows the
  // same buttons as a client's but blocks the action with a friendly explanation.
  const selfModal = (
    <SelfActionModal open={!!selfMsg} onClose={() => setSelfMsg(null)} message={selfMsg ?? ""} />
  );

  // Direct-contact actions. WhatsApp shows whenever a number exists; "Llamar" only
  // when the pro enabled phone contact. Both are blocked on the pro's OWN card.
  // `stacked` = vertical (one above the other) — used for the PRIVATE case where
  // these are the only actions; otherwise they share ONE compact row so adding
  // "Llamar" above "Solicitar servicio" never adds a line.
  // Numbers are redacted for guests; the flags say whether the action exists.
  const showCall = professional.hasCallPhone ?? (!!professional.allowPhoneCall && !!(professional.callPhone || professional.whatsapp));

  // ── Schedule body (the RIGHT column on desktop) ───────────────────────────
  // ALWAYS 3 day-columns, PRIORITIZING the next days that actually HAVE availability (soonest
  // first, NOT necessarily consecutive — e.g. today / +3 days / +2 weeks). When fewer than 3
  // days have availability, PAD the remaining columns with the immediately following CONSECUTIVE
  // calendar days marked "No disponible" (e.g. availability only today → today / Mañana (No
  // disponible) / +2 (No disponible)). So real appointment days further out are never wasted on
  // "No disponible" filler. The slot DATA is unchanged — only the display. The arrows still page
  // COLS at a time through the days WITH availability.
  const availableDays = useMemo(() => days.filter((d) => d.items.length > 0), [days]);
  const hasUpcoming = availableDays.length > 0;
  const maxOffset = Math.max(0, availableDays.length - COLS);
  const effOffset = Math.min(offset, maxOffset);
  const windowDays = useMemo(() => {
    const page = availableDays.slice(effOffset, effOffset + COLS);
    if (page.length === 0 || page.length >= COLS) return page;
    // Pad with consecutive calendar days AFTER the last available day shown (all "No disponible").
    const anchorIdx = page[page.length - 1].dayIndex;
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const pad: typeof page = [];
    for (let k = 1; page.length + pad.length < COLS; k++) {
      const idx = anchorIdx + k;
      const d = new Date(base);
      d.setDate(base.getDate() + idx);
      pad.push({ key: toKey(d), label: dayColumnLabel(d, idx, locale), soon: idx <= 1, items: [] as ScheduleSlot[], dayIndex: idx });
    }
    return [...page, ...pad];
  }, [availableDays, effOffset, locale]);
  const canPrev = effOffset > 0;
  const canNext = effOffset + COLS < availableDays.length;
  const dayColsClass = "grid-cols-3"; // always 3 columns (availability days + "No disponible" padding)
  const scheduleOuterGap = "gap-1";
  const dayGridGap = "gap-2";
  const dayColumnGap = "gap-1.5";
  const dayLabelClass = "text-center text-[11px] font-semibold leading-tight truncate text-[#6b7280]";
  const timePillClass = "w-full rounded-md py-1 text-[11px] font-semibold text-[#0089bb] bg-[#EBF5FB] hover:bg-[#009FD9] hover:text-white transition-colors leading-none";
  const emptyTimePillClass = "block w-full rounded-md py-1 text-[11px] font-semibold leading-none opacity-0";
  const extraPillClass = "w-full rounded-md py-1 text-[10px] font-bold leading-none text-[#0089bb] border border-dashed border-[#bfdbfe] hover:bg-[#EBF5FB] transition-colors";

  // Action buttons live IN the right column (HuliHealth style), full-width PILLS of that
  // column — NOT a separate bottom strip. CONDITIONAL on availability (logic unchanged):
  //  • HAS available schedules (the day strip is showing → canBook && hasUpcoming): a SINGLE
  //    FILLED "Ver disponibilidad" (opens the booking flow). The old separate "Solicitar
  //    servicio" button was removed — booking happens inside "Ver disponibilidad".
  //  • NO schedules (contact-to-coordinate state): FILLED WhatsApp (green), plus FILLED
  //    "Llamar" (blue) ONLY when phone calls are enabled (showCall). No "Solicitar servicio".
  // All actions are blocked on the pro's OWN card.
  // Citas fuera del menú: ya no se ofrece "Ver disponibilidad" en la ficha ni en
  // /buscar. El código de reservas sigue intacto para cuando vuelva.
  // "Llamar" link — FILLED (a primary contact action, e.g. in the no-schedule state) or
  // OUTLINED/secondary (when it sits BELOW "Ver disponibilidad"). Calls are blocked on
  // the pro's OWN card (shows a self note instead). Rendered only when showCall is true.
  const contactSource = stacked ? "profile" : "search";
  // Secundario del app: píldora blanca con borde. Con icono, como el resto de
  // los botones de contacto: «Llamar» sin él se leía como una etiqueta.
  // Dos altos, uno por sitio: en la tarjeta de /buscar el botón mide 44 px,
  // como el resto de la tarjeta; en la franja pegada al fondo del perfil mide
  // 48, exactamente lo que mide «Publicar» en Crear proyecto. La franja es la
  // misma pantalla en todas las secciones y tiene que medir lo mismo en todas.
  const secondaryContactBase = "w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white py-0 text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60";
  const secondaryContactClass = `h-11 text-[13px] font-bold ${secondaryContactBase}`;
  // En la franja el botón es el mismo que «Publicar» en Crear proyecto: 48 px
  // de alto y el rótulo a 16 px semibold. A 13 px la acción que trajo a la
  // persona se leía como una nota al pie.
  const secondaryContactBarClass = `h-12 text-base font-semibold ${secondaryContactBase}`;
  // Profile page uses the short label "Llamar"; /buscar keeps "Contáctanos por llamada".
  const renderCall = (className = secondaryContactClass, label = t("callShort")) => (
    <ContactButton
      method="phone"
      professionalId={professional.id}
      professionalName={professional.fullName}
      contextTitle={categoryName}
      categoryId={activeCategory ?? null}
      source={contactSource}
      isOwn={isOwn}
      onSelfAction={() => setSelfMsg(SELF_MSG.call)}
      className={className}
      label={label}
    />
  );
  const messageButtonBase = "w-full rounded-full py-0";
  const messageButtonClass = `h-11 text-[13px] font-bold ${messageButtonBase}`;
  const messageButtonBarClass = `h-12 text-base font-semibold ${messageButtonBase}`;
  // El verde lo pone la variante «whatsapp» del botón, igual que en el resto
  // del app: aquí solo va la medida de la tarjeta.
  const searchMessageButtonClass = messageButtonClass;
  // El rótulo «WhatsApp» lo pone el propio lanzador y es el mismo en todo el
  // app; aquí solo se le da la medida de la tarjeta.
  const whatsappDeLaTarjeta = (
    <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} contextTitle={categoryName} isOwn={isOwn} onSelfAction={() => setSelfMsg(SELF_MSG.whatsapp)} analyticsSource={stacked ? "profile" : "search"} className={searchMessageButtonClass} buttonLabel={t("whatsappLong")} />
  );
  const contactButtons = showCall ? (
    // Uno arriba del otro, en todos los tamaños, con el rótulo que dice qué
    // pasa: «Contactar por WhatsApp» / «Contactar por llamada». Lado a lado
    // cabían solo «WhatsApp» y «Llamar», y en /buscar es la primera vez que la
    // persona ve al profesional: conviene que el botón lo diga entero.
    <div className="grid grid-cols-1 gap-2">
      {whatsappDeLaTarjeta}
      {renderCall(undefined, t("call"))}
    </div>
  ) : (
    whatsappDeLaTarjeta
  );

  // Perfil: agendar manda y ocupa su propia línea; debajo, escribir y llamar
  // comparten fila. El correo salió de aquí: repetía el mensaje y mandaba la
  // conversación fuera del app.
  const chatLauncher = (
    <DirectChatLauncher
      professionalId={professional.id}
      professionalName={professional.fullName}
      contextTitle={categoryName}
      isOwn={isOwn}
      onSelfAction={() => setSelfMsg(SELF_MSG.whatsapp)}
      analyticsSource="profile"
      tone="primary"
      className={messageButtonBarClass}
    />
  );
  const profileContactButtons = (
    <>
      {/* «Ver disponibilidad» dejó de ser la acción principal: en toda la
          historia hubo CERO reservas y solo 2 profesionales de 289 publicaron
          horarios, mientras que por WhatsApp salieron 95 contactos en dos meses.
          Lo que la ficha ofrece ahora es contactar, por donde el profesional
          dijo que lo contacten. */}
      {/* Con agenda son tres acciones y las dos de contacto comparten fila; sin
          agenda solo hay dos y cada una ocupa su propio renglón, a lo ancho:
          media píldora para la única forma de contactar se leía como algo menor. */}
      {/* Las dos formas de contactar comparten renglón: escribir a la izquierda,
          llamar a la derecha. El botón mide lo mismo que «Publicar» en Crear
          proyecto —48 px de alto y el rótulo a 16— y lo único que cambia es que
          aquí hay dos acciones y cada una se lleva media franja. */}
      {showCall ? (
        <div className="grid grid-cols-2 gap-2">
          {chatLauncher}
          {renderCall(secondaryContactBarClass)}
        </div>
      ) : (
        chatLauncher
      )}
    </>
  );

  // Contact-to-coordinate note — CORAL (calendar icon + text on a pale coral panel),
  // matching the target screenshots. The coral here is an intentional, single-purpose
  // accent for the "availability not public" state (the general "serious app, no
  // colorful icons" rule still holds everywhere else).
  const scheduleNote = (text: string) => (
    <div className="flex items-start gap-2 rounded-lg bg-[#EBF5FB] border border-[#bfdbfe] px-2.5 py-2">
      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden />
      <p className="text-[11px] leading-snug text-[#0089bb]">{text}</p>
    </div>
  );

  const contactNote = (kind: "hidden" | "video" | "location") => {
    if (!nativeApp) {
      if (kind === "video") return t("videoContactNote");
      if (kind === "location") return t("noTimesAtLocation");
      return t("availabilityHiddenNote");
    }
    if (locale === "en") {
      if (kind === "video") return "This service is coordinated by message. Write to the professional to confirm availability.";
      if (kind === "location") return "There are no published times at this location. Send a message to coordinate another option.";
      return "Schedules are coordinated by message. Write to ask about availability.";
    }
    if (kind === "video") return "Este servicio se coordina por mensaje. Escribe al profesional para confirmar disponibilidad.";
    if (kind === "location") return "No hay horarios publicados en esta ubicación. Envía un mensaje para coordinar otra opción.";
    return "Los horarios se coordinan por mensaje. Escribe para consultar disponibilidad.";
  };

  const scheduleLoadingBody = (
    <div className="flex w-full flex-col gap-3" aria-label={tLoading("availability")} aria-busy="true">
      <div className="flex w-full items-start gap-1">
        <span className="flex w-4 shrink-0 self-center" aria-hidden />
        <div className={`grid flex-1 grid-cols-3 ${dayGridGap}`}>
          {days.slice(0, COLS).map((day) => (
            <div key={day.key} className={`flex min-w-0 flex-col ${dayColumnGap}`}>
              <p className={dayLabelClass}>{day.label}</p>
              <Skeleton className="h-6 w-full rounded-md" />
              <Skeleton className="h-6 w-full rounded-md" />
              <Skeleton className="h-6 w-full rounded-md" />
            </div>
          ))}
        </div>
        <span className="flex w-4 shrink-0 self-center" aria-hidden />
      </div>
      <Skeleton className="h-10 w-full rounded-full" />
    </div>
  );

  let scheduleBody: ReactNode;
  if (!RESERVAR_POR_CALENDARIO) {
    // Con el calendario apagado, la nota «los horarios se coordinan por
    // WhatsApp» dejó de ser una excepción y pasó a salir en las 289 fichas con
    // el mismo texto: ya no informaba, ocupaba. El botón de WhatsApp dice solo
    // lo que hay que hacer.
    scheduleBody = null;
  } else if (visualScheduleLoading) {
    scheduleBody = scheduleLoadingBody;
  } else if (!canBook) {
    // No public booking at all (private availability OR WhatsApp-only preference).
    scheduleBody = scheduleNote(contactNote(forceContactOnly ? "video" : "hidden"));
  } else if (!hasUpcoming) {
    // Booking is enabled but the SELECTED location has no upcoming times. If the pro DOES
    // publish times at ANOTHER of their locations, say so SPECIFICALLY (it's not that their
    // availability is private — it's just this place); otherwise it's the general note.
    const otherLocationHasTimes = hasUpcomingAnywhere && locTabs.length > 1;
    scheduleBody = scheduleNote(contactNote(otherLocationHasTimes ? "location" : "hidden"));
  } else {
    scheduleBody = (
      <div className={`flex w-full items-start ${scheduleOuterGap}`}>
        <button
          type="button"
          disabled={!canPrev}
          onClick={(e) => { e.stopPropagation(); setOffset(() => Math.max(0, effOffset - COLS)); }}
          aria-label={t("prevDays")}
          className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#68778d] enabled:hover:text-[#009FD9] disabled:opacity-25"
        >
          <ChevronLeft className="h-[15px] w-[15px]" />
        </button>

        <div className={`grid flex-1 ${dayGridGap} ${dayColsClass}`}>
          {windowDays.map((day) => {
            const extra = day.items.length - 3;
            return (
              <div key={day.key} className={`flex min-w-0 flex-col ${dayColumnGap}`}>
                <p className={dayLabelClass}>{day.label}</p>
                {day.items.length === 0 ? (
                  <p className="text-center text-[10px] leading-tight text-[#cbd5e1] py-1.5">{t("dayUnavailable")}</p>
                ) : (
                  <>
                    {day.items.slice(0, 3).map((slot) => (
                      <button
                        key={`${slot.time}-${slot.locationId ?? ""}`}
                        onClick={(e) => { e.stopPropagation(); pick(slot); }}
                        aria-label={`${day.label}, ${slot.time}`}
                        className={timePillClass}
                      >
                        {slot.time}
                      </button>
                    ))}
                    {Array.from({ length: Math.max(0, 3 - day.items.length) }).map((_, index) => (
                      <span
                        key={`empty-${day.key}-${index}`}
                        aria-hidden="true"
                        className={emptyTimePillClass}
                      >
                        00:00
                      </span>
                    ))}
                    {extra > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); pick(day.items[3]); }}
                        title={t("viewFullSchedule")}
                        aria-label={`${t("viewFullSchedule")}: ${day.label}`}
                        className={extraPillClass}
                      >
                        +{extra}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!canNext}
          onClick={(e) => { e.stopPropagation(); setOffset(() => Math.min(maxOffset, effOffset + COLS)); }}
          aria-label={t("nextDays")}
          className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#68778d] enabled:hover:text-[#009FD9] disabled:opacity-25"
        >
          <ChevronRight className="h-[15px] w-[15px]" />
        </button>
      </div>
    );
  }

  // STACKED layout (professional-profile contact card): a single vertical column —
  // location tabs/address → 3-day strip (or note) → mutually-exclusive buttons. No `info`
  // slot, no two-column grid. Bookable → "Ver disponibilidad" (+ "Solicitar servicio"
  // when showSolicitar); not bookable → "Contáctanos por WhatsApp" + "Contáctanos por llamada".
  if (stacked) {
    // Profile contact card: location tabs → 3-day strip (or coral note) → buttons.
    // Bookable → "Ver disponibilidad" (filled) + WhatsApp (green) + Llamar (outlined).
    // Not bookable → just WhatsApp + Llamar (the coral note explains why). NO "Solicitar
    // servicio" here (the WhatsApp/Llamar contact buttons replace it).
    return (
      <>
        <div ref={scheduleRootRef} className="flex flex-col gap-3">
          {locationControl}
          {scheduleBody}
          {/* En el teléfono, contactar vive en su propia franja pegada al
              fondo, igual que en Crear proyecto: la ficha es larga —servicios,
              reseñas, casos— y el botón que trajo a la persona quedaba a mitad
              de camino, arriba, y desaparecía apenas bajaba a leer. En
              computadora se queda donde estaba: ahí la columna de contacto ya
              está siempre a la vista. */}
          {!visualScheduleLoading && (
            <AccionesAlPie className="flex flex-col gap-2">
              {profileContactButtons}
            </AccionesAlPie>
          )}
        </div>
                {selfModal}
      </>
    );
  }

  return (
    <>
      {/* MOBILE (<lg) = SINGLE column: [info + location tabs/address] then
          [schedule-or-message + buttons], split by a top divider. DESKTOP (lg+) = a COMPACT
          HORIZONTAL card: the LEFT column (info + location, ~68%) and the RIGHT rail
          (schedule + buttons, 300px) separated by a VERTICAL divider, so more fit per screen.
          The grid (no `items-start`) lets the columns stretch to equal height so the divider
          runs full-height and the schedule centers against the taller left column. */}
      <div ref={scheduleRootRef} className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:gap-5">
        {/* LEFT — professional info + location tabs/address (under the rating). */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {info}
          {locationControl}
        </div>
        {/* RIGHT — schedule-or-message on top, action buttons below; a divider (top on
            mobile, left on desktop) separates it from the info. `lg:pt-6` reserves a small
            TOP band so the favorites bookmark (top-right of the card) sits cleanly in the
            corner ABOVE the content — instead of reserving a side gutter (which left an ugly
            blank strip beside the full-width buttons). Content stays full-width. */}
        <div className="relative z-10 flex min-w-0 flex-col gap-3 lg:justify-center lg:border-l lg:border-[#e5e7eb] lg:pt-6 lg:pl-4">
          {scheduleBody}
          {/* A pro who enabled "Permitir contacto por llamada" should ALWAYS surface a
              "Llamar" option on their /buscar card — even when a bookable schedule funnels
              into "Ver disponibilidad" (which otherwise replaced the contact buttons).
              The call sits as an outlined secondary action below the primary schedule CTA. */}
          {!visualScheduleLoading && contactButtons}
        </div>
      </div>

            {selfModal}
    </>
  );
}
