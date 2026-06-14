"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Phone } from "lucide-react";
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
}

// How far ahead we look for "next available" slots.
const WINDOW_DAYS = 21;
// How many soonest slots to show as quick-book chips on the card (a GLIMPSE — the
// full calendar lives in the booking modal). Capped so every card stays uniform.
const GLIMPSE = 3;

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Short month-day label (e.g. "15 mar" / "Mar 15"); today/tomorrow get words.
function dateLabel(d: Date, locale: string): string {
  const loc = locale === "en" ? "en-US" : "es-CR";
  const day = d.getDate();
  const month = d.toLocaleDateString(loc, { month: "short" }).replace(".", "");
  return locale === "en" ? `${month} ${day}` : `${day} ${month}`;
}

/**
 * Card availability + actions — a COMPACT SUMMARY (the card is a glimpse; the full
 * scheduler lives on the profile / in the booking modal).
 *  - Public + slots: the SOONEST few times as quick-book chips ("Hoy 15:00", "Mié
 *    9:00") + "Solicitar servicio" (opens the full calendar) + WhatsApp.
 *  - Private / no upcoming slots: a short note + contact buttons.
 * No inline multi-day grid, no location selector, no paging arrows on the card —
 * those crowded it, collided with the bookmark, and only fit ~2–3 slots.
 */
export function ProfessionalSchedule({ professional, categoryName, availabilityPublic, contactPreference = "ambas", slots: allSlots, activeCategory, isOwn = false }: ProfessionalScheduleProps) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  // When a specific profession was searched, only show that profession's hours
  // (slots with no category — legacy/pre-migration — always show).
  const slots = useMemo(
    () => (activeCategory ? allSlots.filter((s) => !s.categoryId || s.categoryId === activeCategory) : allSlots),
    [allSlots, activeCategory]
  );
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [preset, setPreset] = useState<ScheduleSlot | null>(null);
  // When the pro acts on their OWN card we block with a friendly modal instead of
  // hiding the buttons (the card looks identical to a client's view).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);

  // Booking needs public availability AND a preference that isn't WhatsApp-only.
  const canBook = availabilityPublic && contactPreference !== "solo_whatsapp";

  // Friendly label for a slot's location (used only to pre-fill the booking modal).
  function locLabel(id: string | null | undefined): string {
    if (!id || id === "general") return "General";
    if (id === "videoconsulta") return t("videoconsulta");
    if (id.startsWith("cov_")) return t("atHome");
    return professional.workplaces?.find((w) => w.id === id)?.name ?? t("location");
  }

  // Soonest-first list of bookable slots across the whole window (all locations).
  // Past/too-soon slots are dropped; the card shows the first few, the modal the rest.
  const upcoming = useMemo(() => {
    const byDate = new Map<string, ScheduleSlot[]>();
    for (const s of slots) {
      const arr = byDate.get(s.date);
      if (arr) arr.push(s); else byDate.set(s.date, [s]);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: { slot: ScheduleSlot; label: string }[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toKey(d);
      const items = (byDate.get(key) ?? [])
        .filter((s) => !isTooSoonCR(key, s.time))
        .sort((a, b) => a.time.localeCompare(b.time));
      const day = i === 0 ? t("today") : i === 1 ? t("tomorrow") : dateLabel(d, locale);
      for (const s of items) out.push({ slot: s, label: `${day} ${s.time}` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, locale]);

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
        initialLocationId={preset?.locationId ?? null}
        initialLocationLabel={preset?.locationId ? locLabel(preset.locationId) : null}
      />
    </>
  );

  const selfModal = (
    <SelfActionModal open={!!selfMsg} onClose={() => setSelfMsg(null)} message={selfMsg ?? ""} />
  );

  // Direct-contact actions. WhatsApp shows whenever a number exists; "Llamar" only
  // when the pro enabled phone contact. Both blocked on the pro's OWN card.
  const showWa = !!professional.whatsapp;
  const showCall = !!professional.allowPhoneCall && !!(professional.callPhone || professional.whatsapp);
  const waHref = getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría coordinar un servicio.`);
  const telHref = `tel:+${((professional.callPhone || professional.whatsapp) || "").replace(/\D/g, "")}`;
  const btnWidth = (stacked: boolean) => (stacked ? "w-full" : "flex-1");
  const contactButtons = (stacked = false) =>
    (showWa || showCall) ? (
      <div className={stacked ? "flex flex-col gap-1.5" : "flex gap-1.5"}>
        {showWa && (
          <a
            href={isOwn ? undefined : waHref}
            target={isOwn ? undefined : "_blank"}
            rel="noopener noreferrer"
            onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.whatsapp); } : (e) => e.stopPropagation()}
            className={`${btnWidth(stacked)} inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-[13px] font-semibold py-1.5 rounded-lg transition-colors`}
          >
            <WhatsAppIcon className="h-4 w-4" /> {t("whatsapp")}
          </a>
        )}
        {showCall && (
          <a
            href={isOwn ? undefined : telHref}
            onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setSelfMsg(SELF_MSG.call); } : (e) => e.stopPropagation()}
            className={`${btnWidth(stacked)} inline-flex items-center justify-center gap-1.5 border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] text-[13px] font-semibold py-1.5 rounded-lg transition-colors`}
          >
            <Phone className="h-4 w-4" /> {t("call")}
          </a>
        )}
      </div>
    ) : null;

  // ── Contact-only (private availability OR WhatsApp-only preference) ────
  if (!canBook) {
    return (
      <div className="flex h-full flex-col justify-end gap-1.5">
        {!availabilityPublic && (
          <div className="rounded-lg bg-[#f9fafb] border border-[#f3f4f6] px-2.5 py-2">
            <p className="text-[11px] text-[#6b7280] leading-snug">{t("availabilityHiddenNote")}</p>
          </div>
        )}
        {contactButtons(true)}
        {selfModal}
      </div>
    );
  }

  // ── Public but no upcoming slots → coordinate via WhatsApp ──────────────────
  if (upcoming.length === 0) {
    return (
      <div className="flex h-full flex-col justify-end gap-1.5">
        <div className="rounded-lg bg-[#f9fafb] border border-[#f3f4f6] px-2.5 py-2">
          <p className="text-[11px] text-[#6b7280] leading-snug">{t("noScheduleNote")}</p>
        </div>
        {contactButtons(true)}
        {selfModal}
      </div>
    );
  }

  // ── Public + has slots — compact glimpse + actions ──────────────────────────
  const glimpse = upcoming.slice(0, GLIMPSE);
  const moreCount = upcoming.length - glimpse.length;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Soonest times as quick-book chips. `md:pr-9` keeps the first row clear of
          the card's top-right bookmark on desktop. */}
      <div className="flex-1 min-h-0 md:pr-9">
        <p className="text-[11px] font-semibold text-[#374151] mb-1.5">{t("upcomingTimes")}</p>
        <div className="flex flex-wrap gap-1.5">
          {glimpse.map(({ slot, label }) => (
            <button
              key={`${slot.date}-${slot.time}-${slot.locationId ?? ""}`}
              type="button"
              onClick={(e) => { e.stopPropagation(); pick(slot); }}
              className="rounded-lg bg-[#EBF5FB] px-2 py-1 text-[11px] font-semibold leading-none text-[#0089bb] hover:bg-[#009FD9] hover:text-white transition-colors"
            >
              {label}
            </button>
          ))}
          {moreCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openBooking(); }}
              title={t("viewFullSchedule")}
              className="rounded-lg border border-dashed border-[#bfdbfe] px-2 py-1 text-[11px] font-semibold leading-none text-[#0089bb] hover:bg-[#EBF5FB] transition-colors"
            >
              +{moreCount}
            </button>
          )}
        </div>
      </div>

      {/* Actions — bottom-pinned so every card aligns. */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openBooking(); }}
          className="w-full rounded-lg bg-[#009FD9] py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]"
        >
          {t("requestService")}
        </button>
        {contactButtons(false)}
      </div>

      {bookingModals}
      {selfModal}
    </div>
  );
}
