"use client";

import { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, MapPin, Shield, ShieldAlert, ArrowLeft, ChevronLeft, ChevronRight, Lock, CalendarPlus,
  Check, Sun, Sunset, Moon, CalendarCheck,
} from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { useTranslations, useLocale } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { isValidId, detectIdType, cleanId } from "@/lib/cedula";
import { computeAge, formatAge, isMinorFromDob } from "@/lib/age";
import { anyHealthCategory, getCategoryLabel } from "@/lib/data/categories";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink, buildBookingIcs } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { isTooSoonCR } from "@/lib/time-cr";
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

// Accent/case/punctuation-insensitive name comparison — so an official padrón
// name only counts as "different" from the account name when it really is.
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b) && norm(a).length > 0;
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
  // The (service + location) context of the picked slot — recorded on the booking
  // so the request carries the correct profession + place.
  initialCategoryId?: string | null;
  initialLocationId?: string | null;
  initialLocationLabel?: string | null;
}

export function BookingModal({ professional, categoryName, open, onClose, initialDate, initialTime, initialCategoryId, initialLocationId, initialLocationLabel }: BookingModalProps) {
  const t = useTranslations("booking");
  const locale = useLocale();

  // DOB is only relevant for HEALTH/medical services (patient age). Driven by the
  // es_salud / DOB are derived from the EFFECTIVE profession being booked — NOT "any of
  // the pro's professions is health". Effective = the category context (initialCategoryId)
  // or, when the pro has a single profession, that one. When the pro has MULTIPLE
  // professions and there's no context, the client must first pick which one (so we know
  // whether it's a health service that needs a date of birth).
  const proProfessions = (professional.professions && professional.professions.length > 0)
    ? professional.professions
    : (professional.categoryId ? [professional.categoryId] : []);
  const [pickedCategory, setPickedCategory] = useState<string | null>(
    initialCategoryId ?? (proProfessions.length === 1 ? proProfessions[0] : null)
  );
  const effectiveCategory = initialCategoryId ?? pickedCategory ?? null;
  const needsProfessionPick = !effectiveCategory && proProfessions.length > 1;
  const proIsHealth = anyHealthCategory(effectiveCategory ? [effectiveCategory] : []);

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
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

  // When a day is picked, reliably bring the time-slot section into view so the
  // hours are immediately visible. Runs after layout (rAF) + a couple of retries
  // so it works even when opened pre-selected from a /buscar card (modal mounting).
  useEffect(() => {
    if (!selectedDate || step !== "calendar") return;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const doScroll = () => slotsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    raf = requestAnimationFrame(() => {
      doScroll();
      timers.push(setTimeout(doScroll, 120));
      timers.push(setTimeout(doScroll, 350));
    });
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [selectedDate, step, availabilityLoaded]);
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
  // Whether the logged-in user's profile (cédula/phone) has loaded. The cédula
  // input must NEVER render before this is known, or it flashes for registered
  // clients who already have a cédula on file.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // STABLE flag: whether the account had a cédula ON FILE when the modal opened.
  // The cédula input is gated on this — NOT on the live `profileCedula` value —
  // so typing into the field (which fills profileCedula) never makes it vanish.
  const [hasStoredCedula, setHasStoredCedula] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  // Pro hid their availability → slots are not shown; we offer WhatsApp instead.
  const [availabilityPrivate, setAvailabilityPrivate] = useState(false);
  // Client cédula is requested HERE (at booking), not at signup. Format-only for
  // the client (no TSE name confirmation); national cédulas are also checked to
  // EXIST in the padrón to reject invented numbers. Recoverable inline error.
  const [cedulaError, setCedulaError] = useState<string | null>(null);
  // True when the entered cédula is already linked to ANOTHER account — flagged the
  // moment it validates so the user sees it BEFORE the mismatch/confirm step.
  const [cedulaTaken, setCedulaTaken] = useState(false);
  const [checkingCedula, setCheckingCedula] = useState(false);
  // Booking for someone else: responsible party (the account holder) vs beneficiary.
  // The beneficiary's cédula is ALWAYS optional; a minor may be a beneficiary but
  // never an account holder. Data minimization: only the appointment-needed info.
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [benHasCedula, setBenHasCedula] = useState<boolean | null>(null);
  const [benCedula, setBenCedula] = useState("");
  const [benName, setBenName] = useState("");
  const [benDob, setBenDob] = useState("");
  const [benPhone, setBenPhone] = useState("");
  const [benLookupName, setBenLookupName] = useState<string | null>(null);
  // True while a cédula lookup is in flight — used to suppress a premature
  // "not found" flash before the lookup resolves.
  const [benCedulaLoading, setBenCedulaLoading] = useState(false);
  // Live padrón name (+ DOB when a source provides it) for the client's OWN cédula.
  const [selfCedulaName, setSelfCedulaName] = useState<string | null>(null);
  const [selfDob, setSelfDob] = useState<string | null>(null);
  const [selfCedulaLoading, setSelfCedulaLoading] = useState(false);
  // The padrón has no birth date, so for HEALTH bookings "for myself" we must ask
  // it manually. Effective self DOB = padrón DOB (future provider) ?? this input.
  const [selfDobInput, setSelfDobInput] = useState("");
  // Inline error for a submit that fails (e.g. the slot was just taken — 409).
  const [submitError, setSubmitError] = useState<string | null>(null);
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
    setForSomeoneElse(false);
    setBenHasCedula(null);
    setBenCedula(""); setBenName(""); setBenDob(""); setBenPhone(""); setBenLookupName(null);
    setSelfDobInput(""); setSubmitError(null);
    // Reset the on-file identity so the DB is the authoritative source each open —
    // a social-login account with no cédula must always be (re)prompted.
    setProfileCedula(""); setProfilePhone(""); setProfileLoaded(false); setHasStoredCedula(false);

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
        // Own cédula/phone/name via the SECURITY DEFINER RPC (sensitive columns
        // are no longer directly selectable — see migration 047).
        supabase
          .rpc("get_my_profile")
          .then(({ data }) => {
            // Authoritative check: does this account actually have a cédula on file?
            // Social-login (Google/Facebook) accounts usually don't — they must be
            // prompted (then padrón auto-fill/confirm + store), regardless of provider.
            const hasCedula = !!data?.cedula && String(data.cedula).trim() !== "";
            setHasStoredCedula(hasCedula);
            if (hasCedula) setProfileCedula(String(data!.cedula));
            if (data?.phone) {
              setProfilePhone(String(data.phone));
            } else {
              // A professional's number lives in professionals.whatsapp — prefill
              // the booking phone from it so a pro booking someone never re-enters it.
              supabase.from("professionals").select("whatsapp").eq("profile_id", user.id).maybeSingle()
                .then(({ data: pro }) => { if (pro?.whatsapp) setProfilePhone(String(pro.whatsapp)); });
            }
            if (data?.full_name) setClientName((prev) => prev || String(data.full_name));
            setNeedsProfile(isOAuth && !hasCedula);
            setProfileLoaded(true);
          });
      } else {
        setIsLoggedIn(false);
        setProfileLoaded(true);
      }
    });
  }, [open, professional.id, initialDate, initialTime]);

  // Beneficiary cédula → padrón name auto-fill (debounced). Optional; never blocks.
  useEffect(() => {
    if (!forSomeoneElse || benHasCedula !== true) { setBenLookupName(null); setBenCedulaLoading(false); return; }
    const clean = cleanId(benCedula);
    if (!isValidId(clean) || detectIdType(clean) !== "cedula") { setBenLookupName(null); setBenCedulaLoading(false); return; }
    let active = true;
    setBenCedulaLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cedula/${clean}`);
        if (!active) return;
        if (res.ok) {
          const { fullName, dob } = await res.json();
          setBenLookupName(fullName ?? null);
          if (fullName) setBenName(fullName);
          // Auto-fill DOB from the same lookup when the source provides it (the TSE
          // padrón has none; a Registro Civil source would populate this).
          if (dob) setBenDob(dob);
        } else {
          setBenLookupName(null);
        }
      } catch { if (active) setBenLookupName(null); }
      finally { if (active) setBenCedulaLoading(false); }
    }, 500);
    return () => { active = false; clearTimeout(t); };
  }, [benCedula, benHasCedula, forSomeoneElse]);

  // Live checks for the client's own ID (guest/needs-cédula flows):
  //  1) Whether it's ALREADY linked to another account — flagged immediately so the
  //     user is told up front, never after pressing confirm (any ID type).
  //  2) The padrón name (national cédulas only) for the match/mismatch confirm.
  useEffect(() => {
    const clean = cleanId(profileCedula);
    if (!isValidId(clean)) { setSelfCedulaName(null); setSelfCedulaLoading(false); setCedulaTaken(false); return; }
    const isCedula = detectIdType(clean) === "cedula";
    if (!isCedula) { setSelfCedulaName(null); setSelfCedulaLoading(false); }
    let active = true;
    if (isCedula) setSelfCedulaLoading(true);
    const t = setTimeout(async () => {
      // Already-registered check first (the message that must show up front).
      try {
        const a = await fetch(`/api/cedula-available?cedula=${clean}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!active) return;
        if (a?.taken) {
          setCedulaTaken(true);
          setCedulaError("Esa cédula ya está registrada en otra cuenta. Inicia sesión en esa cuenta o usa una cédula diferente.");
        } else {
          setCedulaTaken(false);
        }
      } catch { /* don't block over our own outage */ }
      if (!isCedula) return;
      try {
        const res = await fetch(`/api/cedula/${clean}`);
        if (!active) return;
        const j = await res.json().catch(() => ({}));
        setSelfCedulaName(res.ok ? (j.fullName ?? null) : null);
        setSelfDob(res.ok ? (j.dob ?? null) : null);
      } catch { if (active) { setSelfCedulaName(null); setSelfDob(null); } }
      finally { if (active) setSelfCedulaLoading(false); }
    }, 500);
    return () => { active = false; clearTimeout(t); };
  }, [profileCedula]);

  // Self-heal: a logged-in account whose STORED cédula's official name differs
  // from the saved name (e.g. saved fast, before the lookup applied the official
  // name) gets corrected on open — so future bookings show name + cédula
  // consistently. Runs once per modal open.
  const healedRef = useRef(false);
  useEffect(() => { if (!open) healedRef.current = false; }, [open]);
  useEffect(() => {
    if (!isLoggedIn || !profileLoaded || !hasStoredCedula || healedRef.current) return;
    const clean = cleanId(profileCedula);
    if (!isValidId(clean) || detectIdType(clean) !== "cedula") return;
    healedRef.current = true;
    let active = true;
    (async () => {
      const j = await fetch(`/api/cedula/${clean}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!active || !j?.fullName || sameName(j.fullName, clientName)) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ full_name: j.fullName }).eq("id", user.id);
        await supabase.auth.updateUser({ data: { full_name: j.fullName } });
      }
      if (active) setClientName(j.fullName);
    })();
    return () => { active = false; };
  }, [isLoggedIn, profileLoaded, hasStoredCedula, profileCedula, clientName]);

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
    // Only OFFER valid times: exclude slots already booked by other clients, and
    // any time less than the 15-minute lead ahead of the current CR time.
    return baseSlots.filter((slot) => !takenSlots.has(`${dateStr} ${slot}`) && !isTooSoonCR(dateStr, slot));
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

  async function handleSubmit(overrideCedula?: string, overridePhone?: string, overrideName?: string) {
    setSubmitting(true);
    setSubmitError(null);
    // The official padrón name (for "myself") prevails as the booking name.
    const submitName = (overrideName ?? (selfOfficialName || clientName)) || "Cliente";
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: professional.id,
          clientName: submitName,
          clientEmail: clientEmail || null,
          clientCedula: (overrideCedula ?? profileCedula) || null,
          clientPhone: (overridePhone ?? profilePhone) || null,
          serviceDescription: description,
          scheduledDate: selectedDate || null,
          scheduledTime: selectedTime || null,
          // (service + location) context of the picked slot.
          categoryId: effectiveCategory ?? professional.categoryId ?? null,
          slotLocationId: initialLocationId ?? null,
          slotLocationLabel: initialLocationLabel ?? null,
          preferredDateText: selectedDate
            ? `${formatDateDisplay(selectedDate)}${selectedTime ? ` a las ${selectedTime}` : ""}`
            : null,
          // Booking for someone else (responsible adult vs beneficiary).
          forSomeoneElse,
          beneficiaryName: forSomeoneElse ? (benName.trim() || null) : null,
          beneficiaryCedula: forSomeoneElse && benHasCedula ? (cleanId(benCedula) || null) : null,
          // DOB only for HEALTH services (data minimization). Omitted for non-health.
          clientDob: proIsHealth && !forSomeoneElse ? (effectiveSelfDob || null) : null,
          beneficiaryDob: proIsHealth && forSomeoneElse && benDob ? benDob : null,
          beneficiaryPhone: forSomeoneElse ? (benPhone.trim() || null) : null,
          beneficiaryIsMinor: proIsHealth && forSomeoneElse && benDob ? isMinorFromDob(benDob) : false,
        }),
      });
      // Slot taken in the meantime (or another failure) → surface, don't "succeed".
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSubmitError(j?.error || "No se pudo enviar la solicitud. Intenta de nuevo.");
        return;
      }

      const firstName = professional.fullName.split(" ")[0];
      const senderName = submitName.trim() || "un cliente";
      const dateStr = selectedDate
        ? `${formatDateDisplay(selectedDate)}${selectedTime ? ` a las ${selectedTime}` : ""}`
        : null;

      const message = [
        `Hola ${firstName}, soy ${senderName}.`,
        `Te contacto por medio de ContrataCR.`,
        ``,
        description ? `Servicio: ${description}` : null,
        dateStr ? `Fecha y hora: ${dateStr}` : null,
        initialLocationLabel ? `Lugar: ${initialLocationLabel}` : null,
        ``,
        `¿Me puedes confirmar disponibilidad?`,
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
    if (cleanPhone.length < 8) { setProfileError("Ingresa un teléfono válido (8 dígitos)."); return; }
    if (needsProfile && !clientName.trim()) { setProfileError("Ingresa tu nombre completo."); return; }
    // Validate the cédula (format + padrón existence) — recoverable inline error.
    // Capture the official name from the SAME call (avoids the debounce race).
    let validatedOfficialName: string | null = null;
    if (needsCedula) {
      const v = await validateClientCedula();
      if (!v.ok) return;
      validatedOfficialName = v.officialName;
    }

    setSavingProfile(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // "For myself" + national cédula found → the OFFICIAL name prevails and the
    // account adopts it. "For another person" never changes the account name.
    // Prefer the freshly-validated name; fall back to the debounced state.
    const officialName = (validatedOfficialName ?? selfOfficialName) || null; // null when booking for someone else
    const finalName = officialName || clientName.trim();
    if (user) {
      // Only write the fields we actually collected on this step.
      const updates: Record<string, string> = { phone: cleanPhone };
      if (needsProfile) updates.full_name = clientName.trim();
      if (needsCedula) updates.cedula = cleanCedula;
      // Link my cédula → official name becomes my account name (identity prevails).
      if (officialName) updates.full_name = officialName;
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (error) {
        setSavingProfile(false);
        setProfileError(
          error.code === "23505"
            ? "Esa cédula ya está registrada en otra cuenta."
            : "No se pudo guardar. Intenta de nuevo."
        );
        return;
      }
      await supabase.auth.updateUser({ data: { full_name: finalName, profile_completed: true } });
    }
    if (officialName) setClientName(officialName);
    setProfileCedula(cleanCedula);
    setProfilePhone(cleanPhone);
    setNeedsProfile(false);
    setSavingProfile(false);
    await handleSubmit(cleanCedula, cleanPhone, officialName || undefined);
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

  // Cédula is requested at booking for EVERY client who doesn't have one on file
  // (it's no longer collected at signup). Phone is collected the same way.
  // "Needs cédula" depends on whether the account had one ON FILE (stable), NOT on
  // the live input value — otherwise typing fills profileCedula and the field
  // vanishes mid-keystroke. Gated on profileLoaded so it never flashes either.
  // Booking FOR ANOTHER PERSON: we don't require the account holder's OWN cédula
  // or WhatsApp again — the appointment contact is the beneficiary's number
  // (collected + required below). Only self-bookings require the holder's cédula.
  const needsCedula = isLoggedIn && profileLoaded && !hasStoredCedula && !forSomeoneElse;
  const needsPhone = isLoggedIn && !profilePhone && !forSomeoneElse;

  // Effective DOB for the account holder (padrón has none → manual input).
  const effectiveSelfDob = selfDob || selfDobInput || null;
  // "For myself" + a national cédula found in the padrón → the OFFICIAL name. When
  // it differs from the account name we warn, then let it prevail on confirm.
  // (Beneficiary cédulas never touch the account, so this is gated on !forSomeoneElse.)
  const selfOfficialName = !forSomeoneElse ? selfCedulaName : null;
  // When the cédula is already taken, the "already registered" message takes over —
  // don't also show the name-mismatch warning (it's moot; they can't use it).
  const nameWillChange = !cedulaTaken && !!selfOfficialName && !sameName(selfOfficialName, clientName);
  const needsCompleteStep = needsProfile || needsCedula || needsPhone;
  const totalSteps = isLoggedIn ? (needsCompleteStep ? 3 : 2) : 3;
  const stepIndex = { calendar: 0, details: 1, contact: 2, complete: 2, success: 3 };

  // Validate the client's cédula: format always; existence in the padrón for
  // national cédulas (DIMEX/NITE aren't in the TSE roll). Returns true if OK and
  // sets a recoverable inline error otherwise. Never drops the booking.
  async function validateClientCedula(): Promise<{ ok: boolean; officialName: string | null }> {
    setCedulaError(null);
    const clean = cleanId(profileCedula);
    if (!isValidId(clean)) {
      setCedulaError("El número de identificación no es válido (CR: 9 dígitos · DIMEX: 11-12 · NITE: 10). Revísalo e intenta de nuevo.");
      return { ok: false, officialName: null };
    }
    // Block early if it's already linked to another account (safety net for a fast
    // submit before the live check resolves).
    try {
      const a = await fetch(`/api/cedula-available?cedula=${clean}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (a?.taken) {
        setCedulaTaken(true);
        setCedulaError("Esa cédula ya está registrada en otra cuenta. Inicia sesión en esa cuenta o usa una cédula diferente.");
        return { ok: false, officialName: null };
      }
    } catch { /* don't block over our own outage */ }
    // Only national cédulas exist in the TSE padrón — verify to reject fakes AND
    // capture the official name synchronously here, so a fast submit (before the
    // debounced lookup resolves) still applies the official name to the booking
    // + account. For a beneficiary booking we never adopt the cédula's name.
    if (detectIdType(clean) === "cedula") {
      setCheckingCedula(true);
      try {
        const res = await fetch(`/api/cedula/${clean}`);
        if (!res.ok) {
          setCedulaError("No encontramos esa cédula. Revisa el número e intenta de nuevo.");
          return { ok: false, officialName: null };
        }
        const j = await res.json().catch(() => ({}));
        return { ok: true, officialName: forSomeoneElse ? null : (j.fullName ?? null) };
      } catch {
        // Network/lookup down — don't block the client over our own outage.
      } finally {
        setCheckingCedula(false);
      }
    }
    return { ok: true, officialName: null };
  }

  // Self DOB field (HEALTH services, "para mí"). When the cédula lookup supplied a
  // birth date (padrón, migration 053) we CONFIRM it read-only — never re-ask. When
  // it didn't (DIMEX/NITE or a roll with no DOB) we ask once. Co-located with the
  // cédula step so typing the cédula auto-fills name + DOB together.
  function renderSelfDobField() {
    if (selfDob) {
      return (
        <div className="rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-2">
          <p className="text-xs text-[#15803d] break-words">
            Fecha de nacimiento: <strong>{selfDob}</strong>{computeAge(selfDob) ? ` · ${formatAge(computeAge(selfDob))}` : ""}
          </p>
        </div>
      );
    }
    return (
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          Fecha de nacimiento <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={selfDobInput}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setSelfDobInput(e.target.value)}
          className="h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
        />
        {effectiveSelfDob && computeAge(effectiveSelfDob) && (
          <p className="text-xs mt-1 text-[#6b7280]">{formatAge(computeAge(effectiveSelfDob))}</p>
        )}
        <p className="text-[11px] text-[#9ca3af] mt-1">La pedimos solo para servicios de salud.</p>
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[95vw] max-w-4xl rounded-3xl overflow-hidden shadow-2xl",
            "flex flex-col md:flex-row",
            "max-h-[95vh] md:max-h-[720px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2"
          )}
        >
          {/* LEFT PANEL */}
          <div className="bg-gradient-to-br from-[#1a2744] via-[#13294a] to-[#009FD9] md:w-[320px] shrink-0 flex flex-col p-6 text-white">
            <div className="flex items-center gap-3 md:flex-col md:items-center md:gap-0">
              <Avatar className="h-14 w-14 md:h-20 md:w-20 shrink-0">
                <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
                  {getInitials(professional.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="md:mt-4 md:text-center md:w-full">
                <div className="flex items-center gap-1.5 md:justify-center flex-wrap">
                  <span className="font-bold text-base md:text-lg leading-tight">{professional.fullName}</span>
                </div>
                {professional.isVerified && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-[#34d399] md:justify-center">
                    <Check className="h-3.5 w-3.5" /> Verificado
                  </span>
                )}
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

            {/* What happens next — genuinely useful to the client at booking time
                (replaces the generic "sin comisiones" trust chips). */}
            <div className="hidden md:flex flex-col gap-2.5 mt-auto pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Qué sigue</p>
              {[
                "Eliges fecha y hora y envías tu solicitud.",
                "Se abre WhatsApp con el profesional para confirmar.",
                "Coordinan precio y detalles directamente, sin intermediarios.",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-2 text-white/70 text-xs">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold text-white">{i + 1}</span>
                  <span className="leading-snug">{text}</span>
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
                  {/* Multi-profession pro + no category context → pick the service FIRST
                      (so we know whether it's health → date of birth). */}
                  {needsProfessionPick && (
                    <div className="flex flex-col gap-2.5">
                      <h3 className="text-lg font-semibold text-[#111827] mb-0.5">¿Qué servicio necesitas?</h3>
                      <p className="text-sm text-[#6b7280] mb-1.5">Elige el servicio que buscas para continuar.</p>
                      {proProfessions.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPickedCategory(cat)}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] px-4 py-3 text-left text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-colors"
                        >
                          <span className="min-w-0 break-words">{getCategoryLabel(cat, locale)}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                        </button>
                      ))}
                    </div>
                  )}
                  {!needsProfessionPick && (<>
                  <h3 className="text-lg font-semibold text-[#111827] mb-1">Elige fecha y hora</h3>
                  <p className="text-sm text-[#6b7280] mb-4">
                    {initialLocationLabel ? <>En <span className="font-semibold text-[#374151]">{initialLocationLabel}</span>. </> : null}
                    Los días con punto azul tienen citas.
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
                          Este profesional coordina sus horarios directamente. Escríbele por WhatsApp para agendar.
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
                    <div className="flex flex-col items-center text-center gap-3 py-8 rounded-2xl bg-[#f9fafb] border border-[#e5e7eb]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB]">
                        <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">Este profesional coordina por WhatsApp</p>
                        <p className="text-xs text-[#9ca3af] mt-1 max-w-xs">Aún no publica horarios en línea. Escríbele para coordinar tu servicio.</p>
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
                  ) : (
                    // Two sub-columns on desktop: CALENDAR (left) and that day's SLOTS (right).
                    <div className="grid gap-5 md:grid-cols-2">
                      {/* CALENDAR */}
                      <div>
                        {/* Month navigation */}
                        <div className="flex items-center justify-between mb-3">
                          <button
                            onClick={prevMonth}
                            disabled={!canGoPrev}
                            className="p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-semibold text-[#111827] capitalize">
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

                        {/* Calendar grid — available days carry a blue dot; today is marked HOY. */}
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
                                onClick={() => { setSelectedDate(dateStr); setSelectedTime(""); }}
                                className={cn(
                                  "relative aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-all",
                                  isSelected && "bg-[#009FD9] text-white shadow-sm",
                                  !isSelected && available && "hover:bg-[#EBF5FB] text-[#111827] cursor-pointer",
                                  !isSelected && available && isToday && "text-[#009FD9]",
                                  !isSelected && !available && "text-[#d1d5db] cursor-not-allowed"
                                )}
                              >
                                {isToday && !isSelected && (
                                  <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wide leading-none text-[#009FD9]">Hoy</span>
                                )}
                                <span className={cn(isBlocked && "line-through opacity-50")}>{date.getDate()}</span>
                                {available && !isSelected && (
                                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#009FD9]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* SLOTS for the selected day, grouped by franja (Mañana / Tarde / Noche). */}
                      <div ref={slotsRef} className="md:border-l md:border-[#f3f4f6] md:pl-5 scroll-mt-4">
                        {!selectedDate ? (
                          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-center">
                            <CalendarCheck className="h-7 w-7 text-[#cbd5e1]" />
                            <p className="mt-2 text-sm text-[#9ca3af]">Elige un día disponible para ver las horas.</p>
                          </div>
                        ) : slots.length === 0 ? (
                          <p className="text-sm text-[#9ca3af] text-center py-6">Sin horarios disponibles para este día.</p>
                        ) : (
                          <>
                            <p className="mb-3 text-sm font-semibold text-[#111827] capitalize">{formatDateDisplay(selectedDate)}</p>
                            {[
                              { key: "manana", label: "Mañana", Icon: Sun, items: slots.filter((s) => parseInt(s, 10) < 12) },
                              { key: "tarde", label: "Tarde", Icon: Sunset, items: slots.filter((s) => { const h = parseInt(s, 10); return h >= 12 && h < 18; }) },
                              { key: "noche", label: "Noche", Icon: Moon, items: slots.filter((s) => parseInt(s, 10) >= 18) },
                            ].filter((f) => f.items.length > 0).map((f) => (
                              <div key={f.key} className="mb-4 last:mb-0">
                                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#374151]">
                                  <f.Icon className="h-4 w-4 text-[#9ca3af]" /> {f.label}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  {f.items.map((slot) => (
                                    <button
                                      key={slot}
                                      onClick={() => setSelectedTime(slot)}
                                      className={cn(
                                        "w-full rounded-xl border px-2 py-2 text-sm font-medium tabular-nums text-center transition-all",
                                        selectedTime === slot
                                          ? "bg-[#009FD9] text-white border-[#009FD9]"
                                          : "bg-white text-[#374151] border-[#e5e7eb] hover:border-[#009FD9] hover:text-[#009FD9]"
                                      )}
                                    >
                                      {slot}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  </>)}
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
                        Hola, <span className="font-medium text-[#374151]">{clientName.split(" ")[0]}</span>. Describe lo que necesitas.
                      </p>
                    )}
                    {/* Stored identity (logged-in + already has cédula) — shown, not re-asked.
                        Name + cédula always; DOB + age when a source provides the DOB
                        (the TSE padrón has none). */}
                    {isLoggedIn && profileCedula && (
                      <div className="text-xs text-[#15803d] mt-1 leading-relaxed">
                        <span>Reservas como <strong>{clientName || "tú"}</strong> · cédula {profileCedula}</span>
                        {proIsHealth && selfDob && computeAge(selfDob) && (
                          <span className="block">Nacimiento: {selfDob} · {formatAge(computeAge(selfDob))}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ¿Para quién es la cita? — responsible adult vs beneficiary */}
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">¿Para quién es la cita? <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { v: false, label: "Para mí" },
                        { v: true, label: "Para otra persona" },
                      ] as const).map((opt) => (
                        <button
                          key={String(opt.v)}
                          type="button"
                          onClick={() => setForSomeoneElse(opt.v)}
                          className={cn(
                            "p-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                            forSomeoneElse === opt.v ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] text-[#374151] hover:border-[#009FD9]/40"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DOB for HEALTH services, "para mí" — ONLY when the cédula is already
                      on file (auto-filled from it, or asked once if the roll has no DOB).
                      When there's no cédula yet, the DOB is collected WITH the cédula at the
                      next step (so typing it auto-fills name + DOB together). */}
                  {proIsHealth && !forSomeoneElse && hasStoredCedula && !selfDob && renderSelfDobField()}

                  {forSomeoneElse && (
                    <div className="rounded-xl border border-[#e5e7eb] p-3 flex flex-col gap-3 bg-[#f9fafb]">
                      <p className="text-xs font-medium text-[#374151]">
                        ¿Para quién es la cita?
                      </p>
                      <div>
                        <label className="text-xs font-medium text-[#374151] block mb-1.5">¿La persona tiene cédula? <span className="text-red-500">*</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          {([{ v: true, label: "Sí" }, { v: false, label: "No" }] as const).map((opt) => (
                            <button
                              key={String(opt.v)}
                              type="button"
                              onClick={() => setBenHasCedula(opt.v)}
                              className={cn(
                                "p-2 rounded-lg border-2 text-sm font-medium transition-all",
                                benHasCedula === opt.v ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] text-[#374151] hover:border-[#009FD9]/40"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* YES → cédula AUTO-FILLS the person's info. When found we show
                          it confirmed (no manual typing); only if NOT found do we fall
                          back to a manual name field. Cédula stays optional. */}
                      {benHasCedula === true && (
                        <>
                          <CedulaInput
                            value={benCedula}
                            onChange={setBenCedula}
                          />
                          {benLookupName && (
                            <div className="rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-2 -mt-1">
                              <p className="text-xs text-[#15803d]">Persona: <strong>{benLookupName}</strong></p>
                            </div>
                          )}
                          {/* Only show "not found" AFTER the lookup finishes — never while
                              it's still in flight (otherwise it flashes for valid cédulas). */}
                          {benCedula && isValidId(cleanId(benCedula)) && detectIdType(cleanId(benCedula)) === "cedula" && benCedulaLoading && (
                            <p className="text-xs text-[#9ca3af] -mt-1">Buscando…</p>
                          )}
                          {benCedula && isValidId(cleanId(benCedula)) && detectIdType(cleanId(benCedula)) === "cedula" && !benCedulaLoading && !benLookupName && (
                            <p className="text-xs text-[#b45309] -mt-1">No encontramos esa cédula. Escribe el nombre abajo.</p>
                          )}
                        </>
                      )}

                      {/* Manual name — only when there is no auto-filled padrón name
                          (NO branch always; YES branch only when not found). */}
                      {benHasCedula !== null && (
                        <>
                          {!(benHasCedula === true && benLookupName) && (
                          <div>
                            <label className="text-xs font-medium text-[#374151] block mb-1.5">Nombre completo de la persona <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={benName}
                              onChange={(e) => setBenName(e.target.value)}
                              placeholder="Nombre de la persona que recibe el servicio"
                              className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
                            />
                          </div>
                          )}
                          {/* DOB REQUIRED for HEALTH-category services (patient age). */}
                          {proIsHealth && (
                          <div>
                            <label className="text-xs font-medium text-[#374151] block mb-1.5">
                              Fecha de nacimiento <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={benDob}
                              max={new Date().toISOString().slice(0, 10)}
                              onChange={(e) => setBenDob(e.target.value)}
                              className="h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
                            />
                            {benDob && computeAge(benDob) && (
                              <p className={cn("text-xs mt-1", isMinorFromDob(benDob) ? "text-[#b45309]" : "text-[#6b7280]")}>
                                {formatAge(computeAge(benDob))}{isMinorFromDob(benDob) ? " · menor de edad (la cita queda marcada como 'para un menor')" : ""}
                              </p>
                            )}
                          </div>
                          )}
                          <PhoneInput
                            label="Teléfono de contacto para la cita"
                            required
                            value={benPhone}
                            onChange={setBenPhone}
                          />
                        </>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.description")} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[110px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder={t("step4.descPlaceholder")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* STEP: contact (guests) */}
              {step === "contact" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">Tu información de contacto</h3>
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Nombre completo <span className="text-red-500">*</span></label>
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
                        Este correo ya tiene una cuenta. Inicia sesión para continuar.
                      </p>
                    )}
                  </div>
                  <PhoneInput
                    label="Teléfono de contacto"
                    value={profilePhone}
                    onChange={setProfilePhone}
                  />
                  <p className="text-xs text-[#9ca3af] -mt-2">
                    Para coordinar tu cita necesitamos tu número de WhatsApp.
                  </p>
                  <CedulaInput
                    required
                    value={profileCedula}
                    onChange={(c) => { setProfileCedula(c); setCedulaError(null); setCedulaTaken(false); }}
                    error={cedulaError ?? undefined}
                    hint="Solo para tu solicitud — no es una verificación de identidad."
                  />
                  {selfCedulaLoading && <p className="text-xs text-[#9ca3af] -mt-1">Buscando…</p>}
                  {!selfCedulaLoading && selfCedulaName && !nameWillChange && (
                    <p className="text-xs text-[#15803d] -mt-1 break-words">Encontramos: <strong>{selfCedulaName}</strong></p>
                  )}
                  {nameWillChange && (
                    <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 -mt-1 flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#b45309]" />
                      <p className="text-xs text-[#92400e] leading-snug break-words">
                        La cédula ingresada pertenece a <strong>{selfCedulaName}</strong>. Al confirmar, tu solicitud usará este nombre oficial. Usa únicamente tu propia cédula.
                      </p>
                    </div>
                  )}
                  {/* HEALTH service for myself → DOB, auto-filled from the cédula above. */}
                  {proIsHealth && !forSomeoneElse && renderSelfDobField()}
                </div>
              )}

              {/* STEP: complete profile — phone (always) + cédula/name when missing */}
              {step === "complete" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#111827]">
                      {needsProfile ? "Completa tu perfil" : "Tu número de WhatsApp"}
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
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">Nombre completo <span className="text-red-500">*</span></label>
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
                    label="Teléfono de contacto"
                    required
                    value={profilePhone}
                    onChange={setProfilePhone}
                  />
                  {needsCedula && (
                    <div>
                      <CedulaInput
                        required
                        value={profileCedula}
                        onChange={(c) => { setProfileCedula(c); setCedulaError(null); setCedulaTaken(false); }}
                        error={cedulaError ?? undefined}
                        hint="Solo para tu solicitud — no es una verificación de identidad."
                      />
                      {/* Padrón lookup: name MATCHES the account → silent green confirm.
                          Name DIFFERS → amber warning; the official name will prevail. */}
                      {selfCedulaName && !nameWillChange && (
                        <div className="rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-2 mt-1.5">
                          <p className="text-xs text-[#15803d] break-words">Confirma: <strong>{selfCedulaName}</strong></p>
                          {proIsHealth && selfDob && computeAge(selfDob) && (
                            <p className="text-[11px] text-[#16a34a]">Nacimiento: {selfDob} · {formatAge(computeAge(selfDob))}</p>
                          )}
                        </div>
                      )}
                      {nameWillChange && (
                        <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 mt-1.5 flex items-start gap-2">
                          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#b45309]" />
                          <p className="text-xs text-[#92400e] leading-snug break-words">
                            La cédula ingresada pertenece a <strong>{selfCedulaName}</strong>. Al confirmar, tu cuenta usará este nombre oficial. Usa únicamente tu propia cédula.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {/* HEALTH service for myself → DOB, auto-filled from the cédula above
                      (or asked once when the roll has no birth date). */}
                  {proIsHealth && !forSomeoneElse && needsCedula && renderSelfDobField()}
                </div>
              )}

              {/* SUCCESS */}
              {step === "success" && (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <SuccessIcon size={80} />
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

            {/* Submit error (e.g. slot just taken) — shown above the footer actions */}
            {submitError && step !== "success" && (
              <div className="px-6 pb-1 shrink-0">
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{submitError}</span>
                </div>
              </div>
            )}

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

                {step === "calendar" && !needsProfessionPick && (
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-[#6b7280]">
                      {selectedDate && selectedTime ? (
                        <span className="capitalize">{formatDateDisplay(selectedDate)} · <span className="font-semibold text-[#111827]">{selectedTime}</span></span>
                      ) : (
                        "Selecciona fecha y hora"
                      )}
                    </span>
                    <Button
                      size="md"
                      className="shrink-0"
                      disabled={!selectedDate || slots.length === 0 || !selectedTime}
                      onClick={() => setStep("details")}
                    >
                      {t("continue")}
                    </Button>
                  </div>
                )}

                {step === "details" && (
                  <Button
                    size="md"
                    className="flex-1"
                    disabled={
                      !description.trim()
                      || (forSomeoneElse && (benHasCedula === null || !benName.trim() || benPhone.replace(/\D/g, "").length < 8))
                      || (proIsHealth && !forSomeoneElse && hasStoredCedula && !effectiveSelfDob)
                      || (proIsHealth && forSomeoneElse && !benDob)
                    }
                    loading={submitting}
                    onClick={async () => {
                      if (!description.trim()) return;
                      // Booking for someone else needs the beneficiary's name + a contact
                      // number for the cita (cédula stays optional).
                      if (forSomeoneElse && (benHasCedula === null || !benName.trim() || benPhone.replace(/\D/g, "").length < 8)) return;
                      // Health services require the patient's DOB. For "para mí" we only
                      // gate HERE when the cédula is already on file; otherwise the DOB is
                      // collected with the cédula at the contact/complete step.
                      if (proIsHealth && !forSomeoneElse && hasStoredCedula && !effectiveSelfDob) return;
                      if (proIsHealth && forSomeoneElse && !benDob) return;
                      if (isLoggedIn) {
                        if (needsCompleteStep) setStep("complete");
                        else await handleSubmit();
                      } else {
                        setStep("contact");
                      }
                    }}
                  >
                    {submitting
                      ? "Enviando…"
                      : isLoggedIn && !needsCompleteStep
                        ? t("step4.submit")
                        : t("continue")}
                  </Button>
                )}

                {step === "contact" && (
                  <Button
                    size="md"
                    className="flex-1"
                    loading={submitting || checkingCedula}
                    disabled={profilePhone.replace(/\D/g, "").length < 8 || guestEmailCheck.taken || !profileCedula || (proIsHealth && !forSomeoneElse && !effectiveSelfDob)}
                    onClick={async () => { const v = await validateClientCedula(); if (v.ok) await handleSubmit(undefined, undefined, v.officialName || undefined); }}
                  >
                    {submitting || checkingCedula ? "Enviando…" : t("step4.submit")}
                  </Button>
                )}

                {step === "complete" && (
                  <Button
                    size="md"
                    className="flex-1"
                    loading={savingProfile || submitting}
                    disabled={savingProfile || submitting || (proIsHealth && !forSomeoneElse && needsCedula && !effectiveSelfDob)}
                    onClick={saveProfileAndSubmit}
                  >
                    {savingProfile || submitting ? "Enviando…" : t("step4.submit")}
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
