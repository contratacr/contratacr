"use client";

import { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, CheckCircle2, MapPin, Shield, ArrowLeft, ChevronLeft, ChevronRight, Lock, CalendarPlus,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink, buildBookingIcs } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { isPastDateTimeCR } from "@/lib/time-cr";
import { createClient } from "@/lib/supabase/client";
import { useAvailabilityCheck } from "@/hooks/use-availability-check";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

type BookingStep = "calendar" | "details" | "contact" | "complete" | "success";

type DaySchedule = { enabled: boolean; ranges: { start: string; end: string }[] };
type WeeklyAvailability = Record<string, DaySchedule>;

const DAY_KEYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function generateSlots(ranges: { start: string; end: string }[]): string[] {
  const slots: string[] = [];
  for (const range of ranges ?? []) {
    const [sh, sm] = range.start.split(":").map(Number);
    const [eh, em] = range.end.split(":").map(Number);
    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    while (cur + 60 <= end) {
      slots.push(`${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`);
      cur += 60;
    }
  }
  return slots;
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const days: (Date | null)[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

interface BookingModalProps {
  professional: ProfessionalCardData;
  categoryName: string;
  open: boolean;
  onClose: () => void;
  // Optional preselection when opened from a slot chip in search results.
  initialDate?: string;
  initialTime?: string;
}

export function BookingModal({ professional, categoryName, open, onClose, initialDate, initialTime }: BookingModalProps) {
  const t = useTranslations("booking");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [step, setStep] = useState<BookingStep>("calendar");
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const slotsRef = useRef<HTMLDivElement>(null);
  const [availability, setAvailability] = useState<WeeklyAvailability>({});
  const [dateSlots, setDateSlots] = useState<Record<string, string[]>>({});
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());

  // When a day is picked, bring the time slots into view so they aren't missed.
  useEffect(() => {
    if (selectedDate) {
      const id = setTimeout(() => slotsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
      return () => clearTimeout(id);
    }
  }, [selectedDate]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waLink, setWaLink] = useState("");
  // OAuth users with no cédula on file must complete their profile before booking.
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileCedula, setProfileCedula] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  // Pro hid their availability → slots are not shown; we offer WhatsApp instead.
  const [availabilityPrivate, setAvailabilityPrivate] = useState(false);
  // Guest email duplicate detection (inline, real-time).
  const guestEmailCheck = useAvailabilityCheck(clientEmail, "email", !isLoggedIn);

  useEffect(() => {
    if (!open) return;
    setStep("calendar");
    setSelectedDate(initialDate ?? "");
    setSelectedTime(initialTime ?? "");
    if (initialDate) {
      const [iy, im] = initialDate.split("-").map(Number);
      setCurrentYear(iy);
      setCurrentMonth(im - 1);
    }
    setDescription("");
    setWaLink("");
    setNeedsProfile(false);
    setProfileError(null);
    setAvailabilityPrivate(false);

    const supabase = createClient();
    Promise.all([
      supabase.from("professionals").select("availability, availability_public").eq("id", professional.id).single(),
      supabase.from("blocked_dates").select("blocked_date").eq("professional_id", professional.id),
      supabase.from("availability_slots").select("slot_date, slot_time").eq("professional_id", professional.id).gte("slot_date", formatDateISO(today)),
      supabase.auth.getUser(),
      fetch(`/api/bookings?takenFor=${professional.id}`).then((r) => r.json()).catch(() => ({ taken: [] })),
    ]).then(([{ data: proData }, { data: bdData }, { data: slotData }, { data: { user } }, takenRes]) => {
      // When availability is private, do NOT surface any slots — hidden immediately.
      const isPrivate = proData?.availability_public === false;
      setAvailabilityPrivate(isPrivate);

      if (!isPrivate && proData?.availability) setAvailability(proData.availability as WeeklyAvailability);
      // Build explicit date → times map (new scheduling model)
      const map: Record<string, string[]> = {};
      if (!isPrivate) {
        for (const s of slotData ?? []) {
          const time = String(s.slot_time).slice(0, 5);
          (map[s.slot_date] ??= []).push(time);
        }
        for (const k of Object.keys(map)) map[k].sort();
      }
      setDateSlots(map);
      setBlockedDates((bdData ?? []).map((r) => r.blocked_date));
      setTakenSlots(new Set<string>((takenRes?.taken as string[]) ?? []));
      setAvailabilityLoaded(true);

      if (user) {
        setIsLoggedIn(true);
        setClientName((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "");
        setClientEmail(user.email ?? "");

        // Determine whether this OAuth user still needs to supply a cédula.
        const provider = user.app_metadata?.provider;
        const isOAuth = !!provider && provider !== "email";
        supabase
          .from("profiles")
          .select("cedula, phone, full_name")
          .eq("id", user.id)
          .single()
          .then(({ data }) => {
            const hasCedula = !!data?.cedula && String(data.cedula).trim() !== "";
            if (data?.cedula) setProfileCedula(String(data.cedula));
            if (data?.phone) setProfilePhone(String(data.phone));
            if (data?.full_name) setClientName((prev) => prev || String(data.full_name));
            setNeedsProfile(isOAuth && !hasCedula);
          });
      } else {
        setIsLoggedIn(false);
      }
    });
  }, [open, professional.id, initialDate, initialTime]);

  // Professionals using the new date-based model have explicit slots.
  const usesExplicitSlots = Object.keys(dateSlots).length > 0;

  function isDayAvailable(date: Date): boolean {
    if (date < today) return false;
    const dateStr = formatDateISO(date);
    if (blockedDates.includes(dateStr)) return false;
    if (usesExplicitSlots) {
      return getSlotsForDate(dateStr).length > 0;
    }
    const dayKey = DAY_KEYS[date.getDay()];
    return !!availability[dayKey]?.enabled;
  }

  function getSlotsForDate(dateStr: string): string[] {
    let baseSlots: string[];
    if (usesExplicitSlots) {
      baseSlots = dateSlots[dateStr] ?? [];
    } else {
      const [y, m, d] = dateStr.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const daySchedule = availability[DAY_KEYS[date.getDay()]];
      if (!daySchedule?.enabled) return [];
      baseSlots = generateSlots(daySchedule.ranges ?? []);
    }
    // Exclude slots already booked by other clients, and any time that already
    // passed today (Costa Rica time).
    return baseSlots.filter((slot) => !takenSlots.has(`${dateStr} ${slot}`) && !isPastDateTimeCR(dateStr, slot));
  }

  function prevMonth() {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); }
    else setCurrentMonth((m) => m - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); }
    else setCurrentMonth((m) => m + 1);
  }

  const canGoPrev = !(currentYear === today.getFullYear() && currentMonth === today.getMonth());
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const canGoNext = new Date(currentYear, currentMonth + 1, 1) < maxMonth;

  function resetAndClose() {
    setStep("calendar");
    setSelectedDate("");
    setSelectedTime("");
    setDescription("");
    setWaLink("");
    onClose();
  }

  async function handleSubmit(overrideCedula?: string, overridePhone?: string) {
    setSubmitting(true);
    try {
      await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: professional.id,
          clientName: clientName || "Cliente",
          clientEmail: clientEmail || null,
          clientCedula: (overrideCedula ?? profileCedula) || null,
          clientPhone: (overridePhone ?? profilePhone) || null,
          serviceDescription: description,
          scheduledDate: selectedDate || null,
          scheduledTime: selectedTime || null,
          preferredDateText: selectedDate
            ? `${formatDateDisplay(selectedDate)}${selectedTime ? ` a las ${selectedTime}` : ""}`
            : null,
        }),
      });

      const firstName = professional.fullName.split(" ")[0];
      const senderName = clientName.trim() || "un cliente";
      const dateStr = selectedDate
        ? `${formatDateDisplay(selectedDate)}${selectedTime ? ` a las ${selectedTime}` : ""}`
        : null;

      const message = [
        `Hola ${firstName}, soy ${senderName}.`,
        `Te contacto por medio de ContrataCR.`,
        ``,
        description ? `Servicio: ${description}` : null,
        dateStr ? `Fecha y hora: ${dateStr}` : null,
        ``,
        `¿Me podés confirmar disponibilidad?`,
      ]
        .filter((l) => l !== null)
        .join("\n");

      setWaLink(getWhatsAppLink(professional.whatsapp, message));
      setStep("success");
    } finally {
      setSubmitting(false);
    }
  }

  // Save the cédula/phone an OAuth user is missing, then continue to the booking.
  async function saveProfileAndSubmit() {
    setProfileError(null);
    const cleanCedula = profileCedula.replace(/\D/g, "");
    const cleanPhone = profilePhone.replace(/\D/g, "");
    if (cleanPhone.length < 8) { setProfileError("Ingresá un teléfono válido (8 dígitos)."); return; }
    if (needsProfile && !clientName.trim()) { setProfileError("Ingresá tu nombre completo."); return; }
    if (needsProfile && cleanCedula.length < 9) { setProfileError("Ingresá una cédula válida (9 dígitos)."); return; }

    setSavingProfile(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Only write the fields we actually collected on this step.
      const updates: Record<string, string> = { phone: cleanPhone };
      if (needsProfile) { updates.full_name = clientName.trim(); updates.cedula = cleanCedula; }
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (error) {
        setSavingProfile(false);
        setProfileError(
          error.code === "23505"
            ? "Esa cédula ya está registrada en otra cuenta."
            : "No se pudo guardar. Intentá de nuevo."
        );
        return;
      }
      await supabase.auth.updateUser({ data: { full_name: clientName.trim(), profile_completed: true } });
    }
    setProfileCedula(cleanCedula);
    setProfilePhone(cleanPhone);
    setNeedsProfile(false);
    setSavingProfile(false);
    await handleSubmit(cleanCedula, cleanPhone);
  }

  // Universal calendar export (.ics) — works with Google/Apple/Outlook.
  function downloadCalendar() {
    if (!selectedDate || !selectedTime) return;
    const ics = buildBookingIcs({
      proName: professional.fullName,
      service: description,
      date: selectedDate,
      time: selectedTime,
      whatsappLink: getWhatsAppLink(professional.whatsapp),
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contratacr-${selectedDate}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const calendarDays = getCalendarDays(currentYear, currentMonth);
  const slots = selectedDate ? getSlotsForDate(selectedDate) : [];
  const hasAnyAvailability = usesExplicitSlots || Object.values(availability).some((d) => d.enabled);

  // Logged-in clients who have a cédula but no phone on file still need to give
  // us a WhatsApp number once — we collect it on the "complete" step (phone-only).
  const needsPhone = isLoggedIn && !needsProfile && !profilePhone;
  const totalSteps = isLoggedIn ? (needsProfile || needsPhone ? 3 : 2) : 3;
  const stepIndex = { calendar: 0, details: 1, contact: 2, complete: 2, success: 3 };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[95vw] max-w-3xl rounded-3xl overflow-hidden shadow-2xl",
            "flex flex-col md:flex-row",
            "max-h-[95vh] md:max-h-[650px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2"
          )}
        >
          {/* LEFT PANEL */}
          <div className="bg-gradient-to-br from-[#1a2744] via-[#13294a] to-[#009FD9] md:w-[260px] shrink-0 flex flex-col p-6 text-white">
            <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
              <Avatar className="h-14 w-14 md:h-20 md:w-20 md:self-center shrink-0">
                <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
                  {getInitials(professional.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="md:mt-4 md:text-center md:w-full">
                <div className="flex items-center gap-1.5 md:justify-center flex-wrap">
                  <span className="font-bold text-base md:text-lg leading-tight">{professional.fullName}</span>
                  {professional.isVerified && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                </div>
                <p className="text-sm text-white/70 mt-1 md:text-center">{categoryName}</p>
              </div>
            </div>

            <div className="hidden md:block mt-5 space-y-2">
              <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" className="justify-center [&_span]:text-white [&_.text-\[\#9ca3af\]]:text-white/60" />
              {professional.cantonName && (
                <div className="flex items-center gap-1.5 justify-center text-white/70 text-sm">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{professional.cantonName}, {professional.provinceName}</span>
                </div>
              )}
              {professional.hourlyRate && (
                <div className="text-center">
                  <span className="text-xs text-white/60">Desde</span>
                  <p className="font-bold text-white text-lg">
                    ₡{professional.hourlyRate.toLocaleString("es-CR")}
                    <span className="text-xs font-normal text-white/60">/hora</span>
                  </p>
                </div>
              )}
            </div>

            <div className="hidden md:flex flex-col gap-2 mt-auto pt-5">
              {[
                { icon: <Shield className="h-3 w-3" />, text: "Sin comisiones" },
                { icon: <CheckCircle2 className="h-3 w-3" />, text: "Contacto directo" },
                { icon: <WhatsAppIcon className="h-3 w-3" />, text: "Respuesta por WhatsApp" },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-white/60 text-xs">
                  {icon} {text}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 bg-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6] shrink-0">
              <div>
                <h2 className="font-bold text-[#111827]">{t("title")}</h2>
                {step !== "success" && (
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: totalSteps }).map((_, n) => (
                      <span
                        key={n}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-300",
                          stepIndex[step] > n ? "bg-[#009FD9] w-4"
                            : stepIndex[step] === n ? "bg-[#009FD9] w-6"
                            : "bg-[#e5e7eb] w-3"
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
              <Dialog.Close asChild>
                <button className="p-2 rounded-xl text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors" aria-label="Cerrar">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* STEP: calendar */}
              {step === "calendar" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#111827] mb-1">Elegí fecha y hora</h3>
                  <p className="text-sm text-[#6b7280] mb-4">
                    Seleccioná una fecha disponible para tu servicio.
                  </p>

                  {!availabilityLoaded ? (
                    <div className="flex justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
                    </div>
                  ) : availabilityPrivate ? (
                    <div className="flex flex-col items-center text-center gap-3 py-8 rounded-2xl bg-[#f9fafb] border border-[#e5e7eb]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB]">
                        <Lock className="h-5 w-5 text-[#009FD9]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">Disponibilidad privada</p>
                        <p className="text-xs text-[#9ca3af] mt-1 max-w-xs">
                          Este profesional coordina sus horarios directamente. Escribile por WhatsApp para agendar.
                        </p>
                      </div>
                      <a
                        href={getWhatsAppLink(professional.whatsapp, `Hola ${professional.fullName.split(" ")[0]}, me gustaría coordinar un servicio por ContrataCR.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                        Coordinar por WhatsApp
                      </a>
                    </div>
                  ) : !hasAnyAvailability ? (
                    <div className="text-center py-8 rounded-2xl bg-[#f9fafb] border border-[#e5e7eb]">
                      <p className="text-sm text-[#6b7280]">Este profesional no ha configurado su disponibilidad todavía.</p>
                      <p className="text-xs text-[#9ca3af] mt-1">Podés contactarlo directamente por WhatsApp.</p>
                    </div>
                  ) : (
                    <>
                      {/* Month navigation */}
                      <div className="flex items-center justify-between mb-3">
                        <button
                          onClick={prevMonth}
                          disabled={!canGoPrev}
                          className="p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-semibold text-[#111827]">
                          {MONTH_NAMES[currentMonth]} {currentYear}
                        </span>
                        <button
                          onClick={nextMonth}
                          disabled={!canGoNext}
                          className="p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Day headers */}
                      <div className="grid grid-cols-7 mb-1">
                        {DAY_NAMES_SHORT.map((d) => (
                          <div key={d} className="text-center text-xs font-medium text-[#9ca3af] py-1">{d}</div>
                        ))}
                      </div>

                      {/* Calendar grid */}
                      <div className="grid grid-cols-7 gap-0.5">
                        {calendarDays.map((date, i) => {
                          if (!date) return <div key={`empty-${i}`} />;
                          const dateStr = formatDateISO(date);
                          const available = isDayAvailable(date);
                          const isSelected = selectedDate === dateStr;
                          const isBlocked = blockedDates.includes(dateStr);
                          const isToday = formatDateISO(date) === formatDateISO(today);

                          return (
                            <button
                              key={dateStr}
                              disabled={!available}
                              onClick={() => {
                                setSelectedDate(dateStr);
                                setSelectedTime("");
                              }}
                              className={cn(
                                "relative aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-all",
                                isSelected && "bg-[#009FD9] text-white shadow-sm",
                                !isSelected && available && "hover:bg-[#EBF5FB] text-[#111827] cursor-pointer",
                                !isSelected && available && isToday && "text-[#009FD9] font-bold",
                                !isSelected && !available && "text-[#d1d5db] cursor-not-allowed"
                              )}
                            >
                              {isBlocked ? (
                                <span className="line-through opacity-50">{date.getDate()}</span>
                              ) : (
                                date.getDate()
                              )}
                              {isToday && !isSelected && (
                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#009FD9]" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Time slots */}
                      {selectedDate && (
                        <div ref={slotsRef} className="mt-4 pt-4 border-t border-[#f3f4f6] scroll-mt-4">
                          {slots.length === 0 ? (
                            <p className="text-sm text-[#9ca3af] text-center py-2">
                              Sin horarios disponibles para este día.
                            </p>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-[#374151] mb-2">Elegí una hora:</p>
                              <div className="flex flex-wrap gap-2">
                                {slots.map((slot) => (
                                  <button
                                    key={slot}
                                    onClick={() => setSelectedTime(slot)}
                                    className={cn(
                                      "px-3 py-1.5 rounded-xl text-sm font-medium transition-all border",
                                      selectedTime === slot
                                        ? "bg-[#009FD9] text-white border-[#009FD9]"
                                        : "bg-white text-[#374151] border-[#e5e7eb] hover:border-[#009FD9] hover:text-[#009FD9]"
                                    )}
                                  >
                                    {slot}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* STEP: details */}
              {step === "details" && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h3 className="text-lg font-semibold text-[#111827]">{t("step4.title")}</h3>
                    {selectedDate && (
                      <p className="text-sm text-[#009FD9] font-medium mt-1">
                        📅 {formatDateDisplay(selectedDate)}{selectedTime ? ` · ${selectedTime}` : ""}
                      </p>
                    )}
                    {isLoggedIn && clientName && (
                      <p className="text-sm text-[#6b7280] mt-1">
                        Hola, <span className="font-medium text-[#374151]">{clientName.split(" ")[0]}</span>. Describí lo que necesitás.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.description")} <span className="text-[#9ca3af] font-normal">(requerido)</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[110px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder={t("step4.descPlaceholder")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* STEP: contact (guests) */}
              {step === "contact" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">Tu información de contacto</h3>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Nombre completo</label>
                    <input
                      type="text"
                      className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder="Tu nombre"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.email")} <span className="text-[#9ca3af] font-normal">(opcional)</span>
                    </label>
                    <input
                      type="email"
                      className={cn(
                        "w-full h-10 rounded-xl border bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all",
                        guestEmailCheck.taken ? "border-red-400" : "border-[#e5e7eb]"
                      )}
                      placeholder="tu@email.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                    />
                    {guestEmailCheck.taken && (
                      <p className="text-xs text-red-500 mt-1">
                        Este correo ya tiene una cuenta. Iniciá sesión para continuar.
                      </p>
                    )}
                  </div>
                  <PhoneInput
                    label="Teléfono (WhatsApp)"
                    value={profilePhone}
                    onChange={setProfilePhone}
                  />
                  <p className="text-xs text-[#9ca3af] -mt-2">
                    Para coordinar tu cita necesitamos tu número de WhatsApp.
                  </p>
                </div>
              )}

              {/* STEP: complete profile — phone (always) + cédula/name when missing */}
              {step === "complete" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#111827]">
                      {needsProfile ? "Completá tu perfil" : "Tu número de WhatsApp"}
                    </h3>
                    <p className="text-sm text-[#6b7280] mt-1">
                      {needsProfile
                        ? "Necesitamos estos datos para confirmar tu reserva."
                        : "Para coordinar tu cita necesitamos tu número de WhatsApp. Lo guardamos en tu perfil para no volver a pedirlo."}
                    </p>
                  </div>

                  {profileError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                      <Shield className="h-3.5 w-3.5 shrink-0" />
                      {profileError}
                    </div>
                  )}

                  {needsProfile && (
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">Nombre completo</label>
                      <input
                        type="text"
                        className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                        placeholder="Tu nombre como aparece en tu cédula"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>
                  )}
                  <PhoneInput
                    label="Teléfono (WhatsApp)"
                    value={profilePhone}
                    onChange={setProfilePhone}
                  />
                  {needsProfile && (
                    <CedulaInput
                      required
                      value={profileCedula}
                      onChange={setProfileCedula}
                    />
                  )}
                </div>
              )}

              {/* SUCCESS */}
              {step === "success" && (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EBF5FB]">
                    <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#111827] mb-2">{t("success.title")}</h3>
                    <p className="text-sm text-[#6b7280] max-w-xs mx-auto">{t("success.desc")}</p>
                  </div>
                  <Button variant="whatsapp" size="lg" asChild className="w-full max-w-xs">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      <WhatsAppIcon className="h-5 w-5" />
                      {t("success.whatsapp")}
                    </a>
                  </Button>
                  {selectedDate && selectedTime && (
                    <button
                      onClick={downloadCalendar}
                      className="inline-flex items-center justify-center gap-2 w-full max-w-xs border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] font-semibold py-2.5 rounded-xl transition-colors text-sm"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      Agregar a mi calendario
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            {step !== "success" && (
              <div className="px-6 py-4 border-t border-[#f3f4f6] shrink-0 flex gap-3">
                {(step === "contact" || step === "details" || step === "complete") && (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setStep(step === "details" ? "calendar" : "details")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("back")}
                  </Button>
                )}

                {step === "calendar" && (
                  <Button
                    size="md"
                    className="flex-1"
                    disabled={!selectedDate || slots.length === 0 || !selectedTime}
                    onClick={() => setStep("details")}
                  >
                    {!selectedDate
                      ? "Elegí una fecha"
                      : !selectedTime
                        ? "Elegí una hora"
                        : t("continue")}
                  </Button>
                )}

                {step === "details" && (
                  <Button
                    size="md"
                    className="flex-1"
                    disabled={!description.trim()}
                    loading={submitting}
                    onClick={async () => {
                      if (!description.trim()) return;
                      if (isLoggedIn) {
                        if (needsProfile || needsPhone) setStep("complete");
                        else await handleSubmit();
                      } else {
                        setStep("contact");
                      }
                    }}
                  >
                    {submitting
                      ? "Enviando…"
                      : isLoggedIn && !needsProfile
                        ? <><WhatsAppIcon className="h-4 w-4" /> {t("step4.submit")}</>
                        : t("continue")}
                  </Button>
                )}

                {step === "contact" && (
                  <Button
                    size="md"
                    className="flex-1"
                    loading={submitting}
                    disabled={profilePhone.replace(/\D/g, "").length < 8 || guestEmailCheck.taken}
                    onClick={() => handleSubmit()}
                  >
                    {submitting ? "Enviando…" : <><WhatsAppIcon className="h-4 w-4" /> {t("step4.submit")}</>}
                  </Button>
                )}

                {step === "complete" && (
                  <Button
                    size="md"
                    className="flex-1"
                    loading={savingProfile || submitting}
                    onClick={saveProfileAndSubmit}
                  >
                    {savingProfile || submitting ? "Enviando…" : <><WhatsAppIcon className="h-4 w-4" /> {t("step4.submit")}</>}
                  </Button>
                )}
              </div>
            )}

            {step === "success" && (
              <div className="px-6 py-4 border-t border-[#f3f4f6] shrink-0">
                <Button variant="outline" size="md" className="w-full" onClick={resetAndClose}>
                  {t("success.close")}
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
