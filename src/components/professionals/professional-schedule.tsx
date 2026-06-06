"use client";

import { useState } from "react";
import { Lock, CalendarClock } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { BookingModal } from "@/components/booking/booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
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

const DAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (dt.getTime() === today.getTime()) return "Hoy";
  if (dt.getTime() === tomorrow.getTime()) return "Mañana";
  return `${DAY_SHORT[dt.getDay()]} ${d} ${MONTH_SHORT[m - 1]}`;
}

/**
 * Inline availability strip for search results (Hulihealth-style): the next
 * available days, each with tappable time chips that open the booking flow
 * pre-selected. Private availability shows a clear, on-brand "private" state.
 */
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, slots }: ProfessionalScheduleProps) {
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [preset, setPreset] = useState<ScheduleSlot | null>(null);

  function pick(slot: ScheduleSlot) {
    setPreset(slot);
    if (user) setShowBooking(true);
    else setShowRegistration(true);
  }

  // ── Private availability ──────────────────────────────────────────────
  if (!availabilityPublic) {
    return (
      <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f9fafb] border border-[#e5e7eb] px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EBF5FB] shrink-0">
              <Lock className="h-3.5 w-3.5 text-[#009FD9]" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#374151]">Disponibilidad privada</p>
              <p className="text-[11px] text-[#9ca3af] truncate">Coordiná tu cita por WhatsApp.</p>
            </div>
          </div>
          <a
            href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        </div>
      </div>
    );
  }

  // ── Public but nothing published yet ──────────────────────────────────
  if (slots.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
        <p className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
          <CalendarClock className="h-3.5 w-3.5" />
          Sin horarios publicados — pedí tu cita y coordinará una fecha.
        </p>
      </div>
    );
  }

  // ── Group slots by date, show the next 2 days ─────────────────────────
  const byDay = new Map<string, string[]>();
  for (const s of slots) {
    if (!byDay.has(s.date)) byDay.set(s.date, []);
    byDay.get(s.date)!.push(s.time);
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(0, 2);

  return (
    <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
      <p className="text-xs font-semibold text-[#374151] mb-2 flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-[#009FD9]" />
        Próximos horarios disponibles
      </p>
      <div className="flex flex-col gap-2">
        {days.map(([date, times]) => (
          <div key={date} className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[#6b7280] w-16 shrink-0 capitalize">{dayLabel(date)}</span>
            <div className="flex flex-wrap gap-1.5">
              {times.slice(0, 4).map((time) => (
                <button
                  key={time}
                  onClick={(e) => { e.stopPropagation(); pick({ date, time }); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[#e5e7eb] text-[#374151] bg-white hover:border-[#009FD9] hover:text-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
                >
                  {time}
                </button>
              ))}
              {times.length > 4 && (
                <span className="px-2 py-1 text-xs text-[#9ca3af]">+{times.length - 4}</span>
              )}
            </div>
          </div>
        ))}
      </div>

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
