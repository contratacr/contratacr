"use client";

import { useMemo, useState } from "react";
import { Lock, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { BookingModal } from "@/components/booking/booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getWhatsAppLink } from "@/lib/utils";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

export type ScheduleSlot = { date: string; time: string };

interface ProfessionalScheduleProps {
  professional: ProfessionalCardData;
  categoryName: string;
  availabilityPublic: boolean;
  slots: ScheduleSlot[];
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
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, slots }: ProfessionalScheduleProps) {
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [preset, setPreset] = useState<ScheduleSlot | null>(null);
  const [offset, setOffset] = useState(0);

  // Rolling window of upcoming days, with each day's published time slots.
  const days = useMemo(() => {
    const byDate = new Map<string, string[]>();
    for (const s of slots) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date)!.push(s.time);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toKey(d);
      const times = (byDate.get(key) ?? []).sort();
      return { key, label: headerLabel(d), times };
    });
  }, [slots]);

  function pick(slot: ScheduleSlot) {
    setPreset(slot);
    if (user) setShowBooking(true);
    else setShowRegistration(true);
  }

  // ── Private availability ──────────────────────────────────────────────
  if (!availabilityPublic) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2 text-[#6b7280]">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#fee2e2] shrink-0 mt-0.5">
            <Lock className="h-3 w-3 text-[#dc2626]" />
          </span>
          <p className="text-xs leading-snug">
            La disponibilidad de este profesional no es pública. Contáctanos y conoce sus horarios.
          </p>
        </div>
        <a
          href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Contáctanos por Whatsapp
        </a>
        <a
          href={telHref(professional.whatsapp)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center gap-2 border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Phone className="h-4 w-4" />
          Contáctanos por llamada
        </a>
      </div>
    );
  }

  // ── Public availability — date-column carousel ────────────────────────
  const windowDays = days.slice(offset, offset + COLS);
  const canPrev = offset > 0;
  const canNext = offset + COLS < days.length;

  return (
    <div className="flex flex-col gap-3">
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
              {day.times.length === 0 ? (
                <p className="text-center text-[11px] text-[#9ca3af] py-1">No disponible</p>
              ) : (
                day.times.slice(0, 4).map((time) => (
                  <button
                    key={time}
                    onClick={(e) => { e.stopPropagation(); pick({ date: day.key, time }); }}
                    className="w-full px-1 py-1.5 rounded-md text-[11px] font-medium text-[#009FD9] bg-[#EBF5FB] hover:bg-[#009FD9] hover:text-white transition-colors"
                  >
                    {time}
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
        className="block text-center text-sm font-semibold text-[#009FD9] bg-[#EBF5FB] hover:bg-[#d6ecf7] rounded-lg py-2.5 transition-colors"
      >
        Ver horario completo
      </Link>

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
      />
    </div>
  );
}
