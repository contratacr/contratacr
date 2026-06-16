"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, MapPin, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { BookingModal } from "@/components/booking/booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { useAuth } from "@/hooks/use-auth";
import { getWhatsAppLink } from "@/lib/utils";
import { isTooSoonCR } from "@/lib/time-cr";
import { SelfActionModal, SELF_MSG } from "./self-action-modal";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

export type ScheduleSlot = { date: string; time: string; locationId?: string | null; categoryId?: string | null };

interface ProfessionalScheduleProps {
  professional: ProfessionalCardData;
  categoryName: string;
  availabilityPublic: boolean;
  contactPreference?: "solo_whatsapp" | "solo_citas" | "ambas";
  slots: ScheduleSlot[];
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
  /** Travel coverage line ("se desplaza…") shown under the tabs when the selected
   *  place has no street address (mobile pros / coverage zones). */
  coverageText?: string;
  /** Business/brand name — bolded as the venue prefix on a real workplace address. */
  businessName?: string;
}

// How many day-columns are shown at once, and how far ahead the arrows page.
const COLS = 3;
const WINDOW_DAYS = 21;

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Full, CONSISTENT date label for every day column: day number + short month
// (e.g. "15 mar" / "Mar 15"), never a weekday-only "lun 15". The label row is
// CSS-uppercased, so casing/period differences don't matter.
function dateLabel(d: Date, locale: string): string {
  const loc = locale === "en" ? "en-US" : "es-CR";
  const day = d.getDate();
  const month = d.toLocaleDateString(loc, { month: "short" }).replace(".", "");
  return locale === "en" ? `${month} ${day}` : `${day} ${month}`;
}

/**
 * Right-hand availability panel for search cards (HuliHealth-style).
 *  - Public: a 3-day column carousel with tappable time chips that open the
 *    booking flow pre-selected, plus arrows to page further out and a
 *    "Ver horario completo" link to the full profile.
 *  - Private: lock state with "Contáctanos por Whatsapp" + "por llamada".
 */
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, contactPreference = "ambas", slots: allSlots, activeCategory, isOwn = false, info, placeFallback = "", placeAddress = "", coverageText = "", businessName = "" }: ProfessionalScheduleProps) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  // When a specific profession was searched, only show that profession's hours
  // (item 1). Slots with no category (legacy/pre-migration) always show.
  const slots = useMemo(
    () => (activeCategory ? allSlots.filter((s) => !s.categoryId || s.categoryId === activeCategory) : allSlots),
    [allSlots, activeCategory]
  );
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [preset, setPreset] = useState<ScheduleSlot | null>(null);
  const [offset, setOffset] = useState(0);
  // When the pro acts on their OWN card we block the action with a friendly modal
  // instead of hiding the buttons (the card looks identical to a client's view).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);

  // What the professional accepts. Booking needs public availability AND a
  // preference that isn't WhatsApp-only; WhatsApp shows unless they chose
  // appointments-only.
  const canBook = availabilityPublic && contactPreference !== "solo_whatsapp";

  // Distinct locations present in the published slots. Chips let the client choose
  // WHICH place a slot is for before booking (item 3) — a traveling pro's coverage
  // zones (cov_*) and videoconsulta are labeled too, never a bare "Ubicación".
  function locLabel(id: string | null): string {
    if (!id || id === "general") return "General";
    if (id === "videoconsulta") return t("videoconsulta");
    if (id.startsWith("cov_")) return t("atHome");
    return professional.workplaces?.find((w) => w.id === id)?.name ?? t("location");
  }
  // Street address for the detail line shown UNDER the location tabs. Only physical
  // workplaces have one — coverage zones (cov_*) / videoconsulta / general don't.
  function locAddress(id: string | null): string {
    if (!id || id === "general" || id === "videoconsulta" || id.startsWith("cov_")) return "";
    return professional.workplaces?.find((w) => w.id === id)?.address?.trim() ?? "";
  }
  // ── SERVICE LOCATIONS (the durable list the selector is built from) ──
  // DURABLE source = the pro's named WORKPLACES, UNION any extra distinct locations
  // their slots carry (a-domicilio `cov_*`, videoconsulta). Keyed by id.
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
      if (id && id !== "general" && !map.has(id)) map.set(id, locLabel(id));
    }
    return Array.from(map, ([id, label]) => ({ id, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professional.workplaces, slots]);

  const hasLocationSelector = locationOptions.length > 1;
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  // Default to the first location that ACTUALLY has slots (so the card doesn't open on
  // an empty location), else the first option.
  const defaultLoc = hasLocationSelector
    ? (locationOptions.find((o) => slots.some((s) => (s.locationId ?? "general") === o.id))?.id ?? locationOptions[0].id)
    : null;
  const effectiveId = selectedLoc ?? defaultLoc;
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
  const hasRealLoc = locationOptions.length > 0;
  const locTabs = hasRealLoc
    ? locationOptions
    : (placeFallback ? [{ id: "__fallback", label: placeFallback }] : []);
  // Address under the tabs: the selected workplace's street address, else the pro's
  // travel coverage ("se desplaza…"), else the province/cantón fallback. Only a real
  // workplace gets its business name bolded as the venue prefix.
  const workplaceAddr = hasRealLoc && effectiveId ? locAddress(effectiveId) : "";
  const addressLine = workplaceAddr || coverageText || placeAddress || "";
  const venueName = workplaceAddr ? businessName.trim() : "";
  const locationControl = locTabs.length > 0 ? (
    <div className="relative z-10 min-w-0">
      {/* TABS (Doctoralia-style): pin + name; the selected tab is brand-blue with an
          underline, the rest muted. The row SCROLLS sideways and NEVER wraps
          (`shrink-0` + `whitespace-nowrap`). `.hide-scrollbar` hides the chrome. */}
      <div className="-mx-1 flex gap-3 overflow-x-auto hide-scrollbar border-b border-[#e5e7eb] px-1" role="tablist" aria-label={t("location")}>
        {locTabs.map((o) => {
          const active = hasRealLoc ? o.id === effectiveId : true;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={hasRealLoc
                ? (e) => { e.stopPropagation(); setSelectedLoc(o.id); setOffset(0); }
                : (e) => e.stopPropagation()}
              className={`shrink-0 -mb-px inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-0.5 pb-1.5 text-[12px] font-semibold transition-colors ${
                active
                  ? "border-[#009FD9] text-[#009FD9]"
                  : "border-transparent text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              <MapPin className="h-3 w-3 shrink-0" />
              {o.label}
            </button>
          );
        })}
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
    return Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toKey(d);
      // Hide any slot within the 15-minute lead time (today only) — it's no longer
      // bookable, so it must stop showing in search.
      const items = (byDate.get(key) ?? []).filter((s) => !isTooSoonCR(key, s.time)).sort((a, b) => a.time.localeCompare(b.time));
      // Always the full date (no "Hoy"/"Mañana"/weekday-only) so columns are consistent.
      const label = dateLabel(d, locale);
      return { key, label, soon: i <= 1, items };
    });
  }, [filteredSlots, t, locale]);

  function pick(slot: ScheduleSlot) {
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    setPreset(slot);
    if (user) setShowBooking(true);
    else setShowRegistration(true);
  }

  function openBooking() {
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
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
        initialCategoryId={preset?.categoryId ?? activeCategory ?? professional.categoryId ?? null}
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
  const showWa = !!professional.whatsapp;
  const showCall = !!professional.allowPhoneCall && !!(professional.callPhone || professional.whatsapp);
  const waHref = getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`);
  const telHref = `tel:+${((professional.callPhone || professional.whatsapp) || "").replace(/\D/g, "")}`;

  // ── Schedule body (the RIGHT column on desktop) ───────────────────────────
  // Consecutive upcoming day-columns starting from the FIRST day that has any
  // availability; days within the shown window that have none render "No disponible"
  // (Doctoralia-style), paged COLS at a time. No bookable schedule → a short note.
  // The slot DATA is unchanged — this only changes how the already-fetched days display.
  const firstIdx = days.findIndex((d) => d.items.length > 0);
  const hasUpcoming = firstIdx >= 0;
  const consecutive = hasUpcoming ? days.slice(firstIdx) : [];
  const maxOffset = Math.max(0, consecutive.length - COLS);
  const effOffset = Math.min(offset, maxOffset);
  const windowDays = consecutive.slice(effOffset, effOffset + COLS);
  const canPrev = effOffset > 0;
  const canNext = effOffset + COLS < consecutive.length;

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
  const contactButtons = (
    <>
      {showWa && (
        <a
          href={isOwn ? undefined : waHref}
          target={isOwn ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.whatsapp); } : (e) => e.stopPropagation()}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] py-2.5 text-[13px] font-semibold text-white hover:bg-[#1ebe5d] transition-colors"
        >
          <WhatsAppIcon className="h-4 w-4" /> {t("whatsapp")}
        </a>
      )}
      {showCall && (
        <a
          href={isOwn ? undefined : telHref}
          onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.call); } : (e) => e.stopPropagation()}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#009FD9] py-2.5 text-[13px] font-semibold text-white hover:bg-[#0089bb] transition-colors"
        >
          <Phone className="h-4 w-4" /> {t("call")}
        </a>
      )}
    </>
  );

  const scheduleNote = (text: string) => (
    <div className="rounded-lg bg-[#f9fafb] border border-[#f3f4f6] px-2.5 py-2">
      <p className="text-[11px] text-[#6b7280] leading-snug">{text}</p>
    </div>
  );

  let scheduleBody: ReactNode;
  if (!canBook) {
    // No public booking (private availability OR WhatsApp-only preference).
    scheduleBody = scheduleNote(!availabilityPublic ? t("availabilityHiddenNote") : t("noScheduleNote"));
  } else if (!hasUpcoming) {
    // Booking enabled but no published slots → coordinate via WhatsApp instead.
    scheduleBody = scheduleNote(t("noScheduleNote"));
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

        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {windowDays.map((day) => {
            const extra = day.items.length - 2;
            return (
              <div key={day.key} className="flex flex-col gap-1 min-w-0">
                <p className={`text-center text-[10px] font-bold uppercase tracking-wide leading-tight truncate ${day.soon ? "text-[#009FD9]" : "text-[#9ca3af]"}`}>{day.label}</p>
                {day.items.length === 0 ? (
                  <p className="text-center text-[10px] leading-tight text-[#cbd5e1] py-1">{t("dayUnavailable")}</p>
                ) : (
                  <>
                    {day.items.slice(0, 2).map((slot) => (
                      <button
                        key={`${slot.time}-${slot.locationId ?? ""}`}
                        onClick={(e) => { e.stopPropagation(); pick(slot); }}
                        className="w-full rounded-md py-0.5 text-[11px] font-semibold text-[#0089bb] bg-[#EBF5FB] hover:bg-[#009FD9] hover:text-white transition-colors leading-none"
                      >
                        {slot.time}
                      </button>
                    ))}
                    {extra > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); pick(day.items[2]); }}
                        title={t("viewFullSchedule")}
                        className="w-full rounded-md py-0.5 text-[10px] font-bold leading-none text-[#0089bb] border border-dashed border-[#bfdbfe] hover:bg-[#EBF5FB] transition-colors"
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

  return (
    <>
      {/* MOBILE (<lg) = SINGLE column: [info + location tabs/address] then
          [schedule-or-message + buttons], split by a top divider. DESKTOP (lg+) = a COMPACT
          HORIZONTAL card: the LEFT column (info + location, ~68%) and the RIGHT rail
          (schedule + buttons, 300px) separated by a VERTICAL divider, so more fit per screen.
          The grid (no `items-start`) lets the columns stretch to equal height so the divider
          runs full-height and the schedule centers against the taller left column. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
        {/* LEFT — professional info + location tabs/address (under the rating). */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {info}
          {locationControl}
        </div>
        {/* RIGHT — schedule-or-message on top, action buttons below; a divider (top on
            mobile, left on desktop) separates it from the info. */}
        <div className="relative z-10 flex min-w-0 flex-col gap-3 border-t border-[#e5e7eb] pt-3 lg:justify-center lg:border-t-0 lg:border-l lg:border-[#e5e7eb] lg:pt-0 lg:pl-4">
          {scheduleBody}
          {hasSchedule ? verHorarioButton : contactButtons}
        </div>
      </div>

      {bookingModals}
      {selfModal}
    </>
  );
}
