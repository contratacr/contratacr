"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, MapPin, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { BookingModal } from "@/components/booking/booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getWhatsAppLink } from "@/lib/utils";
import { isTooSoonCR } from "@/lib/time-cr";
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
}

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// How many day-columns are shown at once, and how far ahead the arrows page.
const COLS = 3;
const WINDOW_DAYS = 21;

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(d: Date, offset: number, today: Date): string {
  if (offset === 0) return "Hoy";
  if (offset === 1) return "Mañana";
  if (d.getMonth() !== today.getMonth()) return `${d.getDate()} ${MONTH_SHORT[d.getMonth()].toLowerCase()}`;
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

function telHref(whatsapp: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  return `tel:+${digits}`;
}

/**
 * Right-hand availability panel for search cards (HuliHealth-style).
 *  - Public: a 3-day column carousel with tappable time chips that open the
 *    booking flow pre-selected, plus arrows to page further out and a
 *    "Ver horario completo" link to the full profile.
 *  - Private: lock state with "Contáctanos por Whatsapp" + "por llamada".
 */
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, contactPreference = "ambas", slots: allSlots, activeCategory }: ProfessionalScheduleProps) {
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

  // What the professional accepts. Booking needs public availability AND a
  // preference that isn't WhatsApp-only; WhatsApp shows unless they chose
  // appointments-only.
  const canBook = availabilityPublic && contactPreference !== "solo_whatsapp";
  const canWhatsApp = contactPreference !== "solo_citas";

  // Distinct locations present in the published slots. Chips let the client choose
  // WHICH place a slot is for before booking (item 3) — a traveling pro's coverage
  // zones (cov_*) and videoconsulta are labeled too, never a bare "Ubicación".
  function locLabel(id: string | null): string {
    if (!id || id === "general") return "General";
    if (id === "videoconsulta") return "Videoconsulta";
    if (id.startsWith("cov_")) return "A domicilio";
    return professional.workplaces?.find((w) => w.id === id)?.name ?? "Ubicación";
  }
  // Group by LABEL so two coverage zones that both read "A domicilio" collapse to
  // a single chip (no confusing duplicates); each group keeps its underlying ids.
  const locationGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const id = s.locationId ?? "general";
      const label = locLabel(id);
      const ids = map.get(label) ?? [];
      if (!ids.includes(id)) ids.push(id);
      map.set(label, ids);
    }
    return Array.from(map.entries()).map(([label, ids]) => ({ label, ids }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);
  // Default to the FIRST location group when there's more than one, so hours are
  // never shown as an undifferentiated mix; the chips switch between them.
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const effectiveLabel = selectedLoc ?? (locationGroups.length > 1 ? locationGroups[0].label : null);
  const effectiveIds = locationGroups.find((g) => g.label === effectiveLabel)?.ids ?? null;
  const filteredSlots = useMemo(
    () => (effectiveLabel === null ? slots : slots.filter((s) => locLabel(s.locationId ?? "general") === effectiveLabel)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, effectiveLabel]
  );

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
      return { key, label: dayLabel(d, i, today), soon: i <= 1, items };
    });
  }, [filteredSlots]);

  function pick(slot: ScheduleSlot) {
    setPreset(slot);
    if (user) setShowBooking(true);
    else setShowRegistration(true);
  }

  function openBooking() {
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
        initialLocationId={preset?.locationId ?? (effectiveIds && effectiveIds[0] !== "general" ? effectiveIds[0] : null)}
        initialLocationLabel={preset?.locationId ? locLabel(preset.locationId) : (effectiveLabel && effectiveLabel !== "General" ? effectiveLabel : null)}
      />
    </>
  );

  // ── Contact-only (private availability OR WhatsApp-only preference) ────
  // The reason is shown as a flush top band on the card; here we only render the
  // compact contact actions so every card stays the same tidy height.
  if (!canBook) {
    return (
      <div className="flex h-full flex-col justify-end">
      <div className="flex items-stretch gap-1.5">
        <a
          href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          <WhatsAppIcon className="h-4 w-4" />
          WhatsApp
        </a>
        {professional.allowPhoneCall && (
          <a
            href={telHref(professional.whatsapp)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Llamar"
            className="flex w-9 shrink-0 items-center justify-center border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] rounded-lg transition-colors"
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>
      </div>
    );
  }

  // ── Public availability — packed date columns (skip empty days) ───────
  // Show only the upcoming days that actually have bookable slots (no "—"
  // filler columns), paged 3 at a time — matches the redesign.
  const daysWithSlots = days.filter((d) => d.items.length > 0);
  const hasUpcoming = daysWithSlots.length > 0;
  const maxOffset = Math.max(0, daysWithSlots.length - COLS);
  const effOffset = Math.min(offset, maxOffset);
  const windowDays = daysWithSlots.slice(effOffset, effOffset + COLS);
  const canPrev = effOffset > 0;
  const canNext = effOffset + COLS < daysWithSlots.length;

  return (
    <div className="flex flex-col gap-1.5 h-full">
      {/* Location — a selector when the pro publishes hours at more than one place
          (item 3), else a single label. Defaults to the first place. */}
      {locationGroups.length > 1 ? (
        <div className="relative">
          <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#009FD9] pointer-events-none" />
          <select
            value={effectiveLabel ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); setSelectedLoc(e.target.value); setOffset(0); }}
            aria-label="Ubicación"
            className="w-full appearance-none rounded-lg border border-[#bfdbfe] bg-[#EBF5FB] pl-6 pr-6 py-1 text-[11px] font-semibold text-[#0089bb] focus:outline-none focus:ring-2 focus:ring-[#009FD9] cursor-pointer truncate"
          >
            {locationGroups.map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#0089bb] pointer-events-none" />
        </div>
      ) : (
        <p className="flex items-center gap-1 text-[11px] leading-tight truncate">
          {effectiveLabel && effectiveLabel !== "General" ? (
            <>
              <MapPin className="h-3 w-3 text-[#009FD9] shrink-0" />
              <span className="truncate font-medium text-[#374151]">{effectiveLabel}</span>
            </>
          ) : (
            <span className="text-[#6b7280]">Próximos horarios</span>
          )}
        </p>
      )}

      <div className="flex-1 min-h-0 flex items-center">
        {!hasUpcoming ? (
          <div className="w-full rounded-lg bg-[#f9fafb] border border-[#f3f4f6] px-2.5 py-2">
            <p className="text-[11px] text-[#9ca3af] leading-snug">Sin horarios próximos. Solicita el servicio para coordinar.</p>
          </div>
        ) : (
          <div className="flex w-full items-start gap-1">
            <button
              type="button"
              disabled={!canPrev}
              onClick={(e) => { e.stopPropagation(); setOffset(() => Math.max(0, effOffset - COLS)); }}
              aria-label="Días anteriores"
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
                        title="Ver horario completo"
                        className="w-full rounded-md py-0.5 text-[10px] font-bold leading-none text-[#0089bb] border border-dashed border-[#bfdbfe] hover:bg-[#EBF5FB] transition-colors"
                      >
                        +{extra}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!canNext}
              onClick={(e) => { e.stopPropagation(); setOffset(() => Math.min(maxOffset, effOffset + COLS)); }}
              aria-label="Días siguientes"
              className="flex w-4 shrink-0 self-center items-center justify-center rounded text-[#9ca3af] enabled:hover:text-[#009FD9] disabled:opacity-25"
            >
              <ChevronRight className="h-[15px] w-[15px]" />
            </button>
          </div>
        )}
      </div>

      <Link
        href={`/profesionales/${professional.slug}`}
        onClick={(e) => e.stopPropagation()}
        className="block text-center text-[10px] font-medium text-[#009FD9] hover:underline"
      >
        Ver horario completo
      </Link>

      {/* One compact action row: primary CTA + small secondary icon-buttons for the
          direct-contact channels the professional enabled (one-tap, never hidden). */}
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openBooking(); }}
          className="flex-1 bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Solicitar servicio
        </button>
        {canWhatsApp && (
          <a
            href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Contactar por WhatsApp"
            className="flex w-9 shrink-0 items-center justify-center border border-[#25D366] text-[#1ebe5d] hover:bg-[#25D366]/10 rounded-lg transition-colors"
          >
            <WhatsAppIcon className="h-4 w-4" />
          </a>
        )}
        {professional.whatsapp && professional.allowPhoneCall && (
          <a
            href={telHref(professional.whatsapp)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Llamar"
            className="flex w-9 shrink-0 items-center justify-center border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] rounded-lg transition-colors"
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>

      {bookingModals}
    </div>
  );
}
