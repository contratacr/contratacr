"use client";

import { useMemo, useState } from "react";
import { Lock, ChevronLeft, ChevronRight, Phone } from "lucide-react";
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

function headerLabel(d: Date): string {
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
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
  const locationIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) set.add(s.locationId ?? "general");
    return Array.from(set);
  }, [slots]);
  // Default to the FIRST specific location when there's more than one, so hours are
  // never shown as an undifferentiated mix; the chips switch between them.
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const effectiveLoc = selectedLoc ?? (locationIds.length > 1 ? locationIds[0] : null);
  const filteredSlots = useMemo(
    () => (effectiveLoc === null ? slots : slots.filter((s) => (s.locationId ?? "general") === effectiveLoc)),
    [slots, effectiveLoc]
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
      return { key, label: headerLabel(d), items };
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
        initialLocationId={preset?.locationId ?? (effectiveLoc !== "general" ? effectiveLoc : null)}
        initialLocationLabel={preset?.locationId ? locLabel(preset.locationId) : (effectiveLoc && effectiveLoc !== "general" ? locLabel(effectiveLoc) : null)}
      />
    </>
  );

  // ── Contact-only (private availability OR WhatsApp-only preference) ────
  if (!canBook) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2 text-[#6b7280]">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#fee2e2] shrink-0 mt-0.5">
            <Lock className="h-3 w-3 text-[#dc2626]" />
          </span>
          <p className="text-xs leading-snug">
            {availabilityPublic
              ? "Este profesional atiende directamente por WhatsApp. Contáctalo para coordinar."
              : "La disponibilidad de este profesional no es pública. Contáctanos y conoce sus horarios."}
          </p>
        </div>
        <a
          href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Contactar por WhatsApp
        </a>
        {professional.allowPhoneCall && (
          <a
            href={telHref(professional.whatsapp)}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center gap-2 border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Phone className="h-4 w-4" />
            Contáctanos por llamada
          </a>
        )}
      </div>
    );
  }

  // ── Public availability — date-column carousel ────────────────────────
  const windowDays = days.slice(offset, offset + COLS);
  const canPrev = offset > 0;
  const canNext = offset + COLS < days.length;

  return (
    <div className="flex flex-col gap-2">
      {/* Location chips/tabs — the client picks WHICH place before booking, so hours
          are never an undifferentiated mix (item 3). Defaults to the first place. */}
      {locationIds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {locationIds.map((id) => (
            <button
              key={id}
              onClick={(e) => { e.stopPropagation(); setSelectedLoc(id); }}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${effectiveLoc === id ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#EBF5FB]"}`}
            >
              {locLabel(id)}
            </button>
          ))}
        </div>
      )}
      {/* Service + location caption so it's always clear what these hours are for. */}
      <p className="text-[11px] text-[#6b7280] leading-tight">
        Horarios de <span className="font-semibold text-[#374151]">{categoryName}</span>
        {effectiveLoc && effectiveLoc !== "general" && <> · <span className="font-semibold text-[#374151]">{locLabel(effectiveLoc)}</span></>}
      </p>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          disabled={!canPrev}
          onClick={(e) => { e.stopPropagation(); setOffset((o) => Math.max(0, o - COLS)); }}
          aria-label="Días anteriores"
          className="flex w-6 shrink-0 items-center justify-center rounded-md text-[#9ca3af] hover:text-[#009FD9] disabled:opacity-30 disabled:hover:text-[#9ca3af]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {windowDays.map((day) => (
            <div key={day.key} className="flex flex-col gap-1.5">
              <p className="text-center text-[11px] font-semibold text-[#374151] leading-tight">{day.label}</p>
              {day.items.length === 0 ? (
                <p className="text-center text-[11px] text-[#9ca3af] py-1">No disponible</p>
              ) : (
                day.items.slice(0, 3).map((slot) => (
                  <button
                    key={`${slot.time}-${slot.locationId ?? ""}`}
                    onClick={(e) => { e.stopPropagation(); pick(slot); }}
                    className="w-full px-1 py-1.5 rounded-md text-[11px] font-medium text-[#009FD9] bg-[#EBF5FB] hover:bg-[#009FD9] hover:text-white transition-colors"
                  >
                    {slot.time}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!canNext}
          onClick={(e) => { e.stopPropagation(); setOffset((o) => Math.min(days.length - COLS, o + COLS)); }}
          aria-label="Días siguientes"
          className="flex w-6 shrink-0 items-center justify-center rounded-md text-[#9ca3af] hover:text-[#009FD9] disabled:opacity-30 disabled:hover:text-[#9ca3af]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Link
        href={`/profesionales/${professional.slug}`}
        onClick={(e) => e.stopPropagation()}
        className="block text-center text-xs font-medium text-[#009FD9] hover:underline"
      >
        Ver horario completo
      </Link>

      {/* Always-visible primary CTA */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openBooking(); }}
        className="w-full bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-semibold py-2 rounded-lg transition-colors"
      >
        Solicitar servicio
      </button>

      {/* Secondary contact channels — compact, side by side to stay dense. Only
          those the professional enabled are shown. */}
      {(canWhatsApp || (professional.whatsapp && professional.allowPhoneCall)) && (
        <div className="flex gap-2">
          {canWhatsApp && (
            <a
              href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 border border-[#25D366] text-[#1ebe5d] hover:bg-[#25D366]/10 text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              <WhatsAppIcon className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          {professional.whatsapp && professional.allowPhoneCall && (
            <a
              href={telHref(professional.whatsapp)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              <Phone className="h-4 w-4" />
              Llamar
            </a>
          )}
        </div>
      )}

      {bookingModals}
    </div>
  );
}
