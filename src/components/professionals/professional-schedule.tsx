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
  /** The LEFT-column professional info (photo, name, price, tags, rating, location),
   *  server-rendered by the card and slotted in so the schedule can own the desktop
   *  two-column layout while keeping ALL schedule state in this one component. */
  info?: ReactNode;
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
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, contactPreference = "ambas", slots: allSlots, activeCategory, isOwn = false, info }: ProfessionalScheduleProps) {
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

  // The location control (a SELECTOR for >1 location, else a single-location label),
  // built ONCE and reused in EVERY schedule branch — including the "no upcoming at this
  // location" state — so switching locations is always possible and the selector never
  // vanishes just because the chosen location currently has no slots. Shown whenever
  // the pro has any published slots. (Durable: independent of the per-branch returns.)
  const showLocationControl = locationOptions.length >= 1 && slots.length > 0;
  // Address line shown UNDER the tabs for the currently-selected location.
  const selectedAddress = effectiveId ? locAddress(effectiveId) : "";
  const locationControl = showLocationControl ? (
    <div className="relative z-10 min-w-0">
      {hasLocationSelector ? (
        <>
          {/* Horizontal TABS (Doctoralia-style): pin + name; the selected tab is
              brand-blue with an underline, the rest muted. The row SCROLLS sideways
              when the tabs exceed the card width — `shrink-0` + `whitespace-nowrap`
              guarantee it never wraps (which would shift the buttons / break the
              equal-height layout). `.hide-scrollbar` hides the scrollbar chrome. */}
          <div className="-mx-1 flex gap-1 overflow-x-auto hide-scrollbar px-1" role="tablist" aria-label={t("location")}>
            {locationOptions.map((o) => {
              const active = o.id === effectiveId;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={(e) => { e.stopPropagation(); setSelectedLoc(o.id); setOffset(0); }}
                  className={`shrink-0 inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-1 pb-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-[#009FD9] text-[#009FD9]"
                      : "border-transparent text-[#9ca3af] hover:text-[#374151]"
                  }`}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  {o.label}
                </button>
              );
            })}
          </div>
          {/* Selected location's address, directly below the tabs (when it has one). */}
          {selectedAddress && (
            <p className="mt-1 truncate text-[11px] text-[#6b7280]">{selectedAddress}</p>
          )}
        </>
      ) : (
        // Single location → name (+ address) shown directly, no tab row.
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] leading-tight">
            <MapPin className="h-3 w-3 text-[#009FD9] shrink-0" />
            <span className="truncate font-semibold text-[#374151]">{locationOptions[0].label}</span>
          </p>
          {locAddress(locationOptions[0].id) && (
            <p className="mt-0.5 truncate pl-4 text-[11px] text-[#6b7280]">{locAddress(locationOptions[0].id)}</p>
          )}
        </div>
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

  // Action buttons live IN the right column (HuliHealth style), full width of that column —
  // NOT a separate bottom strip. CONDITIONAL on availability (logic unchanged):
  //  • HAS available schedules (the day strip is showing → canBook && hasUpcoming): the
  //    OUTLINED "Ver horario completo" then the filled "Solicitar servicio" (no WhatsApp/Llamar).
  //  • NO schedules (contact-to-coordinate state): WhatsApp, plus "Llamar" ONLY when phone
  //    calls are enabled (showCall). No "Solicitar servicio".
  // All actions are blocked on the pro's OWN card.
  const hasSchedule = canBook && hasUpcoming;

  const verHorarioButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openBooking(); }}
      className="w-full rounded-lg border border-[#009FD9] py-2 text-sm font-semibold text-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
    >
      {t("viewFullSchedule")}
    </button>
  );
  const solicitarButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openBooking(); }}
      className="w-full rounded-lg bg-[#009FD9] py-2 text-sm font-semibold text-white hover:bg-[#0089bb] transition-colors"
    >
      {t("requestService")}
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
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2 text-[13px] font-semibold text-white hover:bg-[#1ebe5d] transition-colors"
        >
          <WhatsAppIcon className="h-4 w-4" /> {t("whatsapp")}
        </a>
      )}
      {showCall && (
        <a
          href={isOwn ? undefined : telHref}
          onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.call); } : (e) => e.stopPropagation()}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] py-2 text-[13px] font-semibold text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
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
      {/* MOBILE (<lg) = SINGLE column, UNCHANGED: [info + tabs] then [schedule + buttons]
          stacked (`flex flex-col gap-3`, blocks `gap-2`). DESKTOP (lg+) = a COMPACT HORIZONTAL
          card: info+tabs on the LEFT, schedule+buttons on the RIGHT (fixed `300px`), so the
          card is much SHORTER and more fit per screen. The LEFT info column is the larger one;
          the schedule rail is a fixed 260px. All `lg:` here is ADDITIVE on the mobile base, so
          mobile renders byte-identically. `lg:items-start` keeps both columns their natural
          (compact) height; desktop gaps are tighter (`lg:gap-1.5`). */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-4 lg:items-start">
        {/* LEFT — professional info (slotted from the card) + the location tabs/address. */}
        <div className="flex min-w-0 flex-col gap-2 lg:gap-1.5">
          {info}
          {locationControl}
        </div>
        {/* RIGHT — schedule (or contact message) on top, action buttons below. */}
        <div className="relative z-10 flex min-w-0 flex-col gap-2 lg:gap-1.5">
          {scheduleBody}
          {hasSchedule ? (
            <>
              {verHorarioButton}
              {solicitarButton}
            </>
          ) : (
            contactButtons
          )}
        </div>
      </div>

      {bookingModals}
      {selfModal}
    </>
  );
}
