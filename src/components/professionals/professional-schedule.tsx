"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight, Mail, MapPin, Phone } from "lucide-react";
import { BookingModal } from "@/components/booking/booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { useAuth } from "@/hooks/use-auth";
import { isTooSoonCR } from "@/lib/time-cr";
import { SelfActionModal, SELF_MSG } from "./self-action-modal";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";
import { Skeleton } from "@/components/ui/content-loading";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";

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
  /** True when the viewer owns this profile — no self-service actions. */
  isOwn?: boolean;
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
  /** STACKED single-column layout for the professional-profile contact card (no two-column
   *  grid, no `info` slot): location tabs → 3-day strip → buttons. In stacked mode the
   *  contact buttons (WhatsApp + Llamar) ALWAYS show, plus "Ver horario completo" when
   *  bookable (Llamar renders outlined). Default false = the /buscar card layout (unchanged). */
  stacked?: boolean;
  /** Explicit video-consultation search result: clients coordinate by contact, no schedule strip. */
  forceContactOnly?: boolean;
  /** Preferred tab when search context should open a specific location/modality. */
  preferredLocationId?: string;
  /** Restrict the selector to the preferred location when the current search matched only that modality. */
  restrictToPreferredLocation?: boolean;
  /** Search page: keep the schedule skeleton visible until the first map/filter shell is ready. */
  syncWithSearchLoading?: boolean;
}

// How many day-columns are shown at once, and how far ahead the arrows page.
const COLS = 3;
const BOOKING_MAX_FUTURE_DAYS = 90;
const locationNavButtonClass =
  "relative z-20 -my-1 flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f3f8fc] hover:text-[#009FD9] active:bg-[#EBF5FB] active:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/30";

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
  const loc = locale === "en" ? "en-US" : "es-CR";
  const month = d.toLocaleDateString(loc, { month: "short" }).replace(".", "");
  if (locale === "en") return `${month} ${d.getDate()}`;
  return `${d.getDate()} ${month}`;
}

/**
 * Right-hand availability panel for search cards (HuliHealth-style).
 *  - Public: a 3-day column carousel with tappable time chips that open the
 *    booking flow pre-selected, plus arrows to page further out and a
 *    "Ver horario completo" link to the full profile.
 *  - Private: lock state with "Contáctanos por Whatsapp" + "por llamada".
 */
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, contactPreference = "ambas", slots: allSlots, slotsInitiallyLoaded = true, activeCategory, isOwn = false, info, placeFallback = "", placeAddress = "", businessName = "", stacked = false, forceContactOnly = false, preferredLocationId, restrictToPreferredLocation = false, syncWithSearchLoading = false }: ProfessionalScheduleProps) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  const scheduleRootRef = useRef<HTMLDivElement>(null);
  const [shouldAutoRefresh, setShouldAutoRefresh] = useState(stacked || !slotsInitiallyLoaded);
  const [liveData, setLiveData] = useState<{
    professionalId: string;
    availabilityPublic: boolean;
    slots: ScheduleSlot[];
  } | null>(null);
  const liveSlots = liveData?.professionalId === professional.id ? liveData.slots : allSlots;
  const liveAvailabilityPublic = liveData?.professionalId === professional.id ? liveData.availabilityPublic : availabilityPublic;
  // Schedules are per-LOCATION, not per-profession: a pro at a location is reachable
  // at those hours regardless of which service was searched. So we show ALL of the
  // pro's slots (no profession filter). `activeCategory` is still used purely as the
  // booking context (which service the request is about), not to hide hours.
  const slots = liveSlots.filter((s) => !s.locationId?.startsWith("cov_"));
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [preset, setPreset] = useState<ScheduleSlot | null>(null);
  const [offset, setOffset] = useState(0);
  // Scroll container for the location tabs — chevron buttons scroll it when the tabs OVERFLOW.
  const locScrollRef = useRef<HTMLDivElement>(null);
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
  // appointments-only.
  const canBook = !forceContactOnly && liveAvailabilityPublic && contactPreference !== "solo_whatsapp";
  const scheduleLoading = canBook && !slotsInitiallyLoaded && liveData?.professionalId !== professional.id;
  const visualScheduleLoading = syncWithSearchLoading
    ? searchShellLoading || scheduleLoading
    : scheduleLoading;

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
        const res = await fetch(`/api/public-availability?professionalId=${professional.id}`, { cache: "no-store" });
        if (!res.ok || !active) {
          if (active) setLiveData({ professionalId: professional.id, availabilityPublic, slots: allSlots });
          return;
        }
        const json = await res.json();
        if (!active) return;
        setLiveData({
          professionalId: professional.id,
          availabilityPublic: typeof json.availabilityPublic === "boolean" ? json.availabilityPublic : availabilityPublic,
          slots: Array.isArray(json.slots) ? (json.slots as ScheduleSlot[]) : allSlots,
        });
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
    const interval = window.setInterval(refreshPublicAvailability, 15000);
    window.addEventListener("focus", refreshSoon);
    window.addEventListener("notificationsChanged", refreshSoon);
    window.addEventListener("ccr:availability-changed", refreshSoon);
    return () => {
      active = false;
      if (debounce) window.clearTimeout(debounce);
      window.clearInterval(interval);
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
    return professional.workplaces?.find((w) => w.id === id)?.name ?? t("location");
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
    for (const w of professional.workplaces ?? []) {
      if (w.id && w.name?.trim()) map.set(w.id, w.name.trim());
    }
    for (const s of slots) {
      const id = s.locationId;
      if (id?.startsWith("cov_")) continue;
      if (id && id !== "general" && !map.has(id)) map.set(id, locLabel(id));
    }
    if ((professional.videoconsulta || professional.coverage?.country) && !map.has("videoconsulta")) {
      map.set("videoconsulta", t("videoconsulta"));
    }
    return Array.from(map, ([id, label]) => ({ id, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professional.coverage?.country, professional.workplaces, professional.videoconsulta, slots, t]);

  const visibleLocationOptions = useMemo(() => {
    if ((forceContactOnly || restrictToPreferredLocation) && preferredLocationId) {
      const preferred = locationOptions.find((o) => o.id === preferredLocationId);
      if (preferred) return [preferred];
    }
    return locationOptions;
  }, [forceContactOnly, locationOptions, preferredLocationId, restrictToPreferredLocation]);

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
    return slots.filter((s) => {
      const loc = s.locationId ?? "general";
      return loc === effectiveId || loc === "general";
    });
  }, [slots, effectiveId]);

  // ── LOCATION control (LEFT column, under the rating) — a HORIZONTAL TAB ROW on a
  // hairline divider, then the selected place's ADDRESS. Built ONCE and ALWAYS shown
  // (independent of whether there are upcoming slots) so a pro with no published
  // schedule still says WHERE they work. When the pro has no named workplaces we fall
  // back to a single static province/cantón tab. (Supersedes §50's right-rail placement.)
  const hasRealLoc = visibleLocationOptions.length > 0;
  const locTabs = hasRealLoc
    ? visibleLocationOptions
    : (placeFallback ? [{ id: "__fallback", label: placeFallback }] : []);
  // Address under the tabs: the selected workplace's street address, else the
  // province/cantón fallback. Home service is shown as a separate card chip, never
  // as an address.
  const isVideoLocation = effectiveId === "videoconsulta";
  const workplaceAddr = hasRealLoc && effectiveId && !isVideoLocation ? locAddress(effectiveId) : "";
  const addressLine = isVideoLocation ? "" : (workplaceAddr || placeAddress || "");
  const venueName = workplaceAddr ? businessName.trim() : "";
  // Show the chevron nav whenever the tab row actually OVERFLOWS its container (FIT-based, not a
  // fixed count) — so on a NARROW card (e.g. the profile contact rail) where the 3rd location is
  // cut off, the arrows already appear; on a wide card they only appear once a tab won't fit. This
  // makes /buscar and the profile consistent (the old `locTabs.length > 3` showed them too late on
  // the narrower profile card). Measured on mount, on resize (ResizeObserver), and when the tabs
  // change. Monotonic (adding the chevrons only narrows the row further), so it never oscillates.
  const [locScrollState, setLocScrollState] = useState({ overflow: false, left: false, right: false });
  useEffect(() => {
    const el = locScrollRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
        const next = {
          overflow: maxScroll > 1,
          left: el.scrollLeft > 2,
          right: el.scrollLeft < maxScroll - 2,
        };
        setLocScrollState((prev) => (
          prev.overflow === next.overflow && prev.left === next.left && prev.right === next.right ? prev : next
        ));
      });
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(el); }
    el.addEventListener("scroll", measure, { passive: true });
    if (typeof window !== "undefined") window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      ro?.disconnect();
      el.removeEventListener("scroll", measure);
      if (typeof window !== "undefined") window.removeEventListener("resize", measure);
    };
  }, [locTabs.length, effectiveId]);
  useEffect(() => {
    const el = locScrollRef.current;
    if (!el) return;
    if (locTabs.length <= 1) el.scrollTo({ left: 0 });
  }, [locTabs.length, effectiveId]);
  const showLocNav = locTabs.length > 1 && locScrollState.overflow;
  const reserveLocNav = locTabs.length > 1;
  const scrollLocs = (dir: number) => {
    const el = locScrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = Math.min(maxScroll, Math.max(0, el.scrollLeft + dir * Math.min(180, Math.max(96, el.clientWidth * 0.65))));
    el.scrollTo({ left: next, behavior: "smooth" });
  };
  const locationControl = locTabs.length > 0 ? (
    <div
      className="relative z-10 min-w-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* TABS (Doctoralia-style): pin + name; the selected tab is brand-blue with an
          underline, the rest muted. The row SCROLLS sideways and NEVER wraps
          (`shrink-0` + `whitespace-nowrap`). `.hide-scrollbar` hides the chrome; when
          there are >3 tabs the chevrons below scroll it. */}
      <div className="flex items-center gap-0.5">
        {reserveLocNav && (
          <button
            type="button"
            aria-label={t("prevLocations")}
            disabled={!showLocNav || !locScrollState.left}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollLocs(-1); }}
            className={`${locationNavButtonClass} ${!showLocNav || !locScrollState.left ? "invisible pointer-events-none" : ""}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {/* `overflow-y-hidden` is REQUIRED: `overflow-x-auto` alone leaves overflow-y as
            `visible`, which CSS then COMPUTES to `auto` — so the row became vertically
            scrollable (it could be dragged up/down even with ONE location). Pinning overflow-y
            to hidden makes it strictly a HORIZONTAL tab scroll; vertical touch-drags then bubble
            to the page/sheet scroll (default touch-action). */}
        <div ref={locScrollRef} className={`-mx-1 flex min-w-0 flex-1 gap-3 ${reserveLocNav ? "overflow-x-auto" : "overflow-x-hidden"} overflow-y-hidden hide-scrollbar border-b border-[#e5e7eb] px-1`} role="tablist" aria-label={t("location")}>
          {locTabs.map((o) => {
            const active = hasRealLoc ? o.id === effectiveId : true;
            return (
              <button
                key={o.id}
                data-location-tab=""
                type="button"
                role="tab"
                aria-selected={active}
                onClick={hasRealLoc
                  ? (e) => { e.stopPropagation(); setSelectedLoc(o.id); setOffset(0); }
                  : (e) => e.stopPropagation()}
                className={`shrink-0 -mb-px inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-0.5 pb-1.5 text-[12px] font-semibold transition-colors ${
                  active
                    ? "border-[#009FD9] text-[#009FD9]"
                    : "border-transparent text-[#6b7280] hover:border-[#ccecf8] hover:text-[#009FD9]"
                }`}
              >
                <MapPin className="h-3 w-3 shrink-0" />
                {locTabLabel(o.label)}
              </button>
            );
          })}
        </div>
        {reserveLocNav && (
          <button
            type="button"
            aria-label={t("nextLocations")}
            disabled={!showLocNav || !locScrollState.right}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollLocs(1); }}
            className={`${locationNavButtonClass} ${!showLocNav || !locScrollState.right ? "invisible pointer-events-none" : ""}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {addressLine && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[#6b7280]">
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

  function pick(slot: ScheduleSlot) {
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    trackMetaEvent("InitiateCheckout", {
      content_type: "professional_service",
      source: stacked ? "profile_schedule_slot" : "search_schedule_slot",
      has_selected_time: true,
    });
    setPreset(slot);
    if (user) setShowBooking(true);
    else setShowRegistration(true);
  }

  function openBooking() {
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    trackMetaEvent("InitiateCheckout", {
      content_type: "professional_service",
      source: stacked ? "profile_schedule" : "search_schedule",
      has_selected_time: false,
    });
    setPreset(null);
    if (user) setShowBooking(true);
    else setShowRegistration(true);
  }

  // Shared booking modals — rendered in every branch that can book.
  const bookingModals = (
    <>
      <ClientRegistrationModal
        open={showRegistration}
        onClose={() => setShowRegistration(false)}
        onSuccess={() => { setShowRegistration(false); setShowBooking(true); }}
        professionalName={professional.fullName}
      />
      <BookingModal
        professional={professional}
        categoryName={categoryName}
        open={showBooking}
        onClose={() => setShowBooking(false)}
        initialDate={preset?.date}
        initialTime={preset?.time}
        // Effective booking category — the picked slot's, else the searched profession,
        // else NOTHING. We deliberately do NOT fall back to `professional.categoryId`
        // (the pro's PRIMARY profession): for a multi-specialty pro whose primary is
        // medical, that fallback wrongly forced a health context (asked DOB) even when
        // the client wanted a non-medical service. With null, the modal asks the client
        // which service when the pro has several and there's no context (needsProfessionPick).
        initialCategoryId={preset?.categoryId ?? activeCategory ?? null}
        initialLocationId={preset?.locationId ?? (effectiveId && effectiveId !== "general" ? effectiveId : null)}
        initialLocationLabel={preset?.locationId ? locLabel(preset.locationId) : (effectiveId ? locLabel(effectiveId) : null)}
      />
    </>
  );

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
  const showCall = !!professional.allowPhoneCall && !!(professional.callPhone || professional.whatsapp);
  const showEmail = stacked && !!professional.contactEmail;
  const telHref = `tel:+${((professional.callPhone || professional.whatsapp) || "").replace(/\D/g, "")}`;
  const emailHref = `mailto:${professional.contactEmail}?subject=${encodeURIComponent("Consulta desde ContrataCR")}&body=${encodeURIComponent(`Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaria coordinar un servicio.`)}`;

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

  // Action buttons live IN the right column (HuliHealth style), full-width PILLS of that
  // column — NOT a separate bottom strip. CONDITIONAL on availability (logic unchanged):
  //  • HAS available schedules (the day strip is showing → canBook && hasUpcoming): a SINGLE
  //    FILLED "Ver horario completo" (opens the booking flow). The old separate "Solicitar
  //    servicio" button was removed — booking happens inside "Ver horario completo".
  //  • NO schedules (contact-to-coordinate state): FILLED WhatsApp (green), plus FILLED
  //    "Llamar" (blue) ONLY when phone calls are enabled (showCall). No "Solicitar servicio".
  // All actions are blocked on the pro's OWN card.
  const hasSchedule = canBook && hasUpcoming;

  const verHorarioButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openBooking(); }}
      className="w-full rounded-full bg-[#009FD9] py-2.5 text-sm font-semibold text-white hover:bg-[#0089bb] transition-colors"
    >
      {t("viewFullSchedule")}
    </button>
  );
  // "Llamar" link — FILLED (a primary contact action, e.g. in the no-schedule state) or
  // OUTLINED/secondary (when it sits BELOW "Ver horario completo"). Calls are blocked on
  // the pro's OWN card (shows a self note instead). Rendered only when showCall is true.
  function trackContact(method: "whatsapp" | "phone" | "email") {
    trackMetaEvent("Contact", {
      content_type: "professional_service",
      method,
      source: stacked ? "profile" : "search",
    });
  }

  const renderCall = (secondary: boolean) => (
    <a
      href={isOwn ? undefined : telHref}
      onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.call); } : (e) => { e.stopPropagation(); trackContact("phone"); }}
      className={`w-full inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-semibold transition-colors ${
        secondary
          ? "border border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]"
          : "bg-[#009FD9] text-white hover:bg-[#0089bb]"
      }`}
    >
      {/* Profile page uses the short label "Llamar"; /buscar keeps "Contáctanos por llamada". */}
      <Phone className="h-4 w-4" /> {stacked ? t("callShort") : t("call")}
    </a>
  );
  const messageButtonClass = "w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#009FD9] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0089bb] disabled:opacity-60";
  const contactButtons = (
    <>
      <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} isOwn={isOwn} onSelfAction={() => setSelfMsg(SELF_MSG.whatsapp)} className={messageButtonClass} />
      {/* No-schedule state: filled on /buscar, outlined on the profile contact card. */}
      {showCall && renderCall(true)}
      {showEmail && (
        <a
          href={isOwn ? undefined : emailHref}
          onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.email); } : (e) => { e.stopPropagation(); trackContact("email"); }}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white py-2.5 text-[13px] font-semibold text-[#374151] transition-colors hover:bg-[#f9fafb]"
        >
          <Mail className="h-4 w-4" /> {t("email")}
        </a>
      )}
    </>
  );

  const profileContactButtons = (
    <>
      <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} isOwn={isOwn} onSelfAction={() => setSelfMsg(SELF_MSG.whatsapp)} className={messageButtonClass} />
      {(showCall || showEmail) && (
        <div className={`grid gap-2 ${showCall && showEmail ? "grid-cols-2" : "grid-cols-1"}`}>
          {showCall && renderCall(true)}
          {showEmail && (
            <a
              href={isOwn ? undefined : emailHref}
              onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.email); } : (e) => { e.stopPropagation(); trackContact("email"); }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-2.5 text-[13px] font-semibold text-[#374151] transition-colors hover:bg-[#f9fafb]"
            >
              <Mail className="h-4 w-4 shrink-0" /> <span className="min-w-0 truncate">{t("email")}</span>
            </a>
          )}
        </div>
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

  const scheduleLoadingBody = (
    <div className="flex w-full flex-col gap-3" aria-label={locale === "en" ? "Loading availability" : "Cargando horarios"} aria-busy="true">
      <div className="flex w-full items-start gap-1">
        <span className="flex w-4 shrink-0 self-center" aria-hidden />
        <div className="grid flex-1 grid-cols-3 gap-2">
          {days.slice(0, COLS).map((day) => (
            <div key={day.key} className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-center text-[11px] font-semibold leading-tight text-[#6b7280]">{day.label}</p>
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
  if (visualScheduleLoading) {
    scheduleBody = scheduleLoadingBody;
  } else if (!canBook) {
    // No public booking at all (private availability OR WhatsApp-only preference).
    scheduleBody = scheduleNote(forceContactOnly ? t("videoContactNote") : t("availabilityHiddenNote"));
  } else if (!hasUpcoming) {
    // Booking is enabled but the SELECTED location has no upcoming times. If the pro DOES
    // publish times at ANOTHER of their locations, say so SPECIFICALLY (it's not that their
    // availability is private — it's just this place); otherwise it's the general note.
    const otherLocationHasTimes = hasUpcomingAnywhere && locTabs.length > 1;
    scheduleBody = scheduleNote(otherLocationHasTimes ? t("noTimesAtLocation") : t("availabilityHiddenNote"));
  } else {
    scheduleBody = (
      <div className="flex w-full items-start gap-1">
        <button
          type="button"
          disabled={!canPrev}
          onClick={(e) => { e.stopPropagation(); setOffset(() => Math.max(0, effOffset - COLS)); }}
          aria-label={t("prevDays")}
          className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#9ca3af] enabled:hover:text-[#009FD9] disabled:opacity-25"
        >
          <ChevronLeft className="h-[15px] w-[15px]" />
        </button>

        <div className={`grid flex-1 gap-2 ${dayColsClass}`}>
          {windowDays.map((day) => {
            const extra = day.items.length - 3;
            return (
              <div key={day.key} className="flex flex-col gap-1.5 min-w-0">
                <p className="text-center text-[11px] font-semibold leading-tight truncate text-[#6b7280]">{day.label}</p>
                {day.items.length === 0 ? (
                  <p className="text-center text-[10px] leading-tight text-[#cbd5e1] py-1.5">{t("dayUnavailable")}</p>
                ) : (
                  <>
                    {day.items.slice(0, 3).map((slot) => (
                      <button
                        key={`${slot.time}-${slot.locationId ?? ""}`}
                        onClick={(e) => { e.stopPropagation(); pick(slot); }}
                        className="w-full rounded-md py-1 text-[11px] font-semibold text-[#0089bb] bg-[#EBF5FB] hover:bg-[#009FD9] hover:text-white transition-colors leading-none"
                      >
                        {slot.time}
                      </button>
                    ))}
                    {extra > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); pick(day.items[3]); }}
                        title={t("viewFullSchedule")}
                        className="w-full rounded-md py-1 text-[10px] font-bold leading-none text-[#0089bb] border border-dashed border-[#bfdbfe] hover:bg-[#EBF5FB] transition-colors"
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
          className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#9ca3af] enabled:hover:text-[#009FD9] disabled:opacity-25"
        >
          <ChevronRight className="h-[15px] w-[15px]" />
        </button>
      </div>
    );
  }

  // STACKED layout (professional-profile contact card): a single vertical column —
  // location tabs/address → 3-day strip (or note) → mutually-exclusive buttons. No `info`
  // slot, no two-column grid. Bookable → "Ver horario completo" (+ "Solicitar servicio"
  // when showSolicitar); not bookable → "Contáctanos por WhatsApp" + "Contáctanos por llamada".
  if (stacked) {
    // Profile contact card: location tabs → 3-day strip (or coral note) → buttons.
    // Bookable → "Ver horario completo" (filled) + WhatsApp (green) + Llamar (outlined).
    // Not bookable → just WhatsApp + Llamar (the coral note explains why). NO "Solicitar
    // servicio" here (the WhatsApp/Llamar contact buttons replace it).
    return (
      <>
        <div ref={scheduleRootRef} className="flex flex-col gap-3">
          {locationControl}
          {scheduleBody}
          {!visualScheduleLoading && (
            <div className="flex flex-col gap-2">
              {hasSchedule && verHorarioButton}
              {profileContactButtons}
            </div>
          )}
        </div>
        {bookingModals}
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
      <div ref={scheduleRootRef} className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:gap-5 lg:min-h-[184px]">
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
        <div className="relative z-10 flex min-w-0 flex-col gap-3 border-t border-[#e5e7eb] pt-3 lg:justify-center lg:border-t-0 lg:border-l lg:border-[#e5e7eb] lg:pt-6 lg:pl-4">
          {scheduleBody}
          {/* A pro who enabled "Permitir contacto por llamada" should ALWAYS surface a
              "Llamar" option on their /buscar card — even when a bookable schedule funnels
              into "Ver horario completo" (which otherwise replaced the contact buttons).
              The call sits as an outlined secondary action below the primary schedule CTA. */}
          {!visualScheduleLoading && (hasSchedule ? (
            verHorarioButton
          ) : contactButtons)}
        </div>
      </div>

      {bookingModals}
      {selfModal}
    </>
  );
}
