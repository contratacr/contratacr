"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  MapPin,
  Shield,
  ShieldAlert,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Lock,
  CalendarPlus,
  Check,
  Sun,
  Sunset,
  Moon,
  CalendarCheck,
  MessageCircle,
  CalendarDays,
  BadgeCheck,
  UserRound,
} from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PhoneInput, hasPhoneNumber } from "@/components/ui/phone-input";
import { DateOfBirthPicker, formatDobDMY } from "@/components/ui/date-of-birth-picker";
import { CedulaInput } from "@/components/ui/cedula-input";
import { isValidId, detectIdType, cleanId } from "@/lib/cedula";
import { computeAge, formatAge, isMinorFromDob } from "@/lib/age";
import {
  anyHealthCategory,
  isCareCategory,
  getCategoryLabel,
} from "@/lib/data/categories";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, buildBookingIcs, proDisplayName } from "@/lib/utils";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { cn } from "@/lib/utils";
import { formatServicePrice, splitPricingLabel } from "@/lib/pricing";
import { isTooSoonCR } from "@/lib/time-cr";
import { createClient } from "@/lib/supabase/client";
import { useAvailabilityCheck } from "@/hooks/use-availability-check";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { useNativeApp } from "@/hooks/use-native-app";

type BookingStep = "calendar" | "details" | "contact" | "complete" | "success";
type BookingProfessional = ProfessionalCardData & {
  serviceType?: string | null;
  videoconsulta?: boolean;
  services?: Array<{ modalities?: Array<"in_person" | "at_home" | "video"> }>;
};

type DaySchedule = { enabled: boolean; ranges: { start: string; end: string }[] };
type WeeklyAvailability = Record<string, DaySchedule>;

const DAY_KEYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const phoneDigits = (value: string) => value.replace(/\D/g, "");
const PENDING_BOOKING_IDENTITY_KEY = "ccr:pending-booking-identity";
const PENDING_BOOKING_IDENTITY_MAX_AGE_MS = 30 * 60 * 1000;
const BOOKING_MAX_FUTURE_DAYS = 90;

type PendingBookingIdentity = {
  userId?: string;
  fullName?: string;
  cedula?: string;
  noCedula?: boolean;
  createdAt?: number;
};

function readPendingBookingIdentity(userId: string): PendingBookingIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_BOOKING_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBookingIdentity;
    if (parsed.userId !== userId || !parsed.createdAt || Date.now() - parsed.createdAt > PENDING_BOOKING_IDENTITY_MAX_AGE_MS) {
      window.sessionStorage.removeItem(PENDING_BOOKING_IDENTITY_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(PENDING_BOOKING_IDENTITY_KEY);
    return null;
  }
}

function clearPendingBookingIdentity() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_BOOKING_IDENTITY_KEY);
}

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

function dateLocale(locale: string): string {
  return locale === "en" ? "en-US" : "es-CR";
}

function formatDateDisplay(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const etiqueta = new Date(y, m - 1, d).toLocaleDateString(dateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

function calendarDayNames(locale: string): string[] {
  const base = new Date(2026, 5, 21);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      .toLocaleDateString(dateLocale(locale), { weekday: "short" })
      .replace(".", "")
  );
}

function calendarMonthLabel(year: number, month: number, locale: string): string {
  const label = new Date(year, month, 1).toLocaleDateString(dateLocale(locale), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  professional: BookingProfessional;
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

// Radix dismiss/focus-outside guard: keep the modal open when the interaction is with
// a body-portaled SelectMenu dropdown (its option list is marked `data-selectmenu-list`).
// Without this, clicking a DOB day/month/year option closes the whole modal.
function keepSelectMenuOpen(e: { detail?: { originalEvent?: Event }; target?: EventTarget | null; preventDefault: () => void }) {
  const node = (e.detail?.originalEvent?.target ?? e.target) as HTMLElement | null;
  if (node?.closest?.("[data-selectmenu-list]")) e.preventDefault();
}

function slotMatchesInitialLocation(slotLocationId: string | null | undefined, initialLocationId: string | null | undefined): boolean {
  if (!initialLocationId || initialLocationId === "general") return true;
  const normalized = slotLocationId ?? "general";
  return normalized === initialLocationId || normalized === "general";
}

function addDateSlot(map: Record<string, string[]>, date: string, time: string) {
  const normalizedTime = time.slice(0, 5);
  const list = map[date] ?? [];
  if (!list.includes(normalizedTime)) list.push(normalizedTime);
  map[date] = list;
}

export function BookingModal({ professional, categoryName, open, onClose, initialDate, initialTime, initialCategoryId, initialLocationId, initialLocationLabel }: BookingModalProps) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const nativeApp = useNativeApp();
  const router = useRouter();
  // A solicitud was actually created in this session → on close we REFRESH so /buscar drops
  // the now-occupied slot (the schedule strips re-read server availability).
  const bookedRef = useRef(false);

  // DOB is only relevant for HEALTH/medical services (patient age). Driven by the
  // es_salud / DOB are derived from the EFFECTIVE profession being booked — NOT "any of
  // the pro's professions is health". Effective = the category context (initialCategoryId)
  // or, when the pro has a single profession, that one. When the pro has MULTIPLE
  // professions and there's no context, the client must first pick which one (so we know
  // whether it's a health service that needs a date of birth).
  const proProfessions = useMemo(
    () => (professional.professions && professional.professions.length > 0)
      ? professional.professions
      : (professional.categoryId ? [professional.categoryId] : []),
    [professional.categoryId, professional.professions],
  );
  const [pickedCategory, setPickedCategory] = useState<string | null>(
    initialCategoryId ?? (proProfessions.length === 1 ? proProfessions[0] : null)
  );
  const effectiveCategory = initialCategoryId ?? pickedCategory ?? null;
  const needsProfessionPick = !effectiveCategory && proProfessions.length > 1;
  // Elegir servicio es un paso de verdad cuando el profesional ofrece varios y
  // el cliente no llegó filtrando por uno: cuenta en "Paso N de M" y la flecha
  // de la cabecera regresa a él.
  const hayPasoServicio = proProfessions.length > 1 && !initialCategoryId;

  // Profession shown UNDER the name: the RELEVANT one for the current context —
  //  • filtered (initialCategoryId) or selected (pickedCategory) → that profession;
  //  • no specific context + multiple professions → the main one + "+N" so the client
  //    sees the pro offers several (not just the principal);
  //  • single profession → its name (the `categoryName` the caller passed).
  const headerProfession = effectiveCategory
    ? getCategoryLabel(effectiveCategory, locale)
    : proProfessions.length > 1
      ? `${getCategoryLabel(proProfessions[0], locale)} +${proProfessions.length - 1}`
      : categoryName;
  const proIsHealth = anyHealthCategory(effectiveCategory ? [effectiveCategory] : []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayIso = formatDateISO(today);

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
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  // OAuth users with no cédula on file must complete their profile before booking.
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileCedula, setProfileCedula] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profilePhoneInitial, setProfilePhoneInitial] = useState("");
  const [profilePhoneWasPrefilled, setProfilePhoneWasPrefilled] = useState(false);
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
  // Booking for someone else — ONLY offered for HEALTH/medical services, and ONLY for a
  // DEPENDENT the requester books on behalf of (a child / an older or disabled relative
  // who can't use the app). Connector data-minimization: we collect ONLY what changes
  // what the pro does before contact — the beneficiary's NAME + DATE OF BIRTH (age =
  // clinical triage / the minor·adulto-mayor badge). No beneficiary cédula or phone:
  // the pro doesn't need the patient's ID to accept/prepare, and the REQUESTER (account
  // holder) is the coordination contact. The requester stays the booking's phone/identity.
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [benName, setBenName] = useState("");
  const [benDob, setBenDob] = useState("");
  // Live padrón NAME for the client's OWN cédula (the padrón has NO birth date).
  const [selfCedulaName, setSelfCedulaName] = useState<string | null>(null);
  // The account's SAVED date of birth (backend-only, from profiles.date_of_birth — NOT
  // a visible account field). When present, future medical requests auto-fill it.
  const [selfDob, setSelfDob] = useState<string | null>(null);
  const [selfCedulaLoading, setSelfCedulaLoading] = useState(false);
  // The padrón has no birth date, so for HEALTH bookings "for myself" we ask it ONCE
  // (manual input) then save it. `dobEditing` unlocks the saved value via "Corregir".
  const [selfDobInput, setSelfDobInput] = useState("");
  const [dobEditing, setDobEditing] = useState(false);
  // "No tengo cédula" — the client proceeds WITHOUT an identification number (types
  // their name manually); the request reaches the pro flagged as identity NOT verified,
  // so the pro decides whether to contact them. Same end result as a DIMEX/foreign ID.
  const [noCedula, setNoCedula] = useState(false);
  // Inline error for a submit that fails (e.g. the slot was just taken — 409).
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Guest email duplicate detection (inline, real-time).

  const guestEmailCheck = useAvailabilityCheck(clientEmail, "email", !isLoggedIn);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) {
      document.body.classList.remove("ccr-booking-modal-open");
      return;
    }
    document.body.classList.add("ccr-booking-modal-open");
    return () => {
      document.body.classList.remove("ccr-booking-modal-open");
    };
  }, [open]);

  // El borrado del estado solo ocurre al ABRIR el modal. Este efecto también
  // vuelve a correr cuando la página se refresca por detrás (router.refresh tras
  // un cambio de perfil o de disponibilidad) y sus dependencias llegan nuevas;
  // sin esta guarda, ese refresco tiraba al cliente al primer paso a mitad de
  // la reserva —o le borraba la pantalla de éxito— sin que hubiera hecho nada.
  const abiertoAntesRef = useRef(false);
  useEffect(() => {
    const recienAbierto = open && !abiertoAntesRef.current;
    abiertoAntesRef.current = open;
    if (!open) return;
    if (recienAbierto) queueMicrotask(() => {
      setStep("calendar");
      // Reset the picked service so a NEW booking re-asks which profession (for a
      // multi-profession pro) instead of locking onto the previous booking's choice.
      // The modal stays MOUNTED between bookings, so without this the 2nd booking skipped
      // the service-selection step until a full page refresh (re-seeds the same way the
      // initial state does: a category context wins, a single-profession pro auto-picks,
      // a multi-profession pro with no context → null → re-prompt).
      setPickedCategory(initialCategoryId ?? (proProfessions.length === 1 ? proProfessions[0] : null));
      setSelectedDate(initialDate ?? "");
      setSelectedTime(initialTime ?? "");
      if (initialDate) {
        const [iy, im] = initialDate.split("-").map(Number);
        setCurrentYear(iy);
        setCurrentMonth(im - 1);
      }
      setDescription("");
      setNeedsProfile(false);
      setProfileError(null);
      setAvailabilityPrivate(false);
      setForSomeoneElse(false);
      setBenName(""); setBenDob("");
      setSelfDobInput(""); setDobEditing(false); setSelfDob(null); setSubmitError(null); setNoCedula(false);
      // Reset the on-file identity so the DB is the authoritative source each open —
      // a social-login account with no cédula must always be (re)prompted.
      setProfileCedula(""); setProfilePhone(""); setProfilePhoneInitial(""); setProfilePhoneWasPrefilled(false); setProfileLoaded(false); setHasStoredCedula(false);
    });

    const supabase = createClient();
    Promise.all([
      supabase.from("professionals").select("availability, availability_public").eq("id", professional.id).single(),
      supabase.from("blocked_dates").select("blocked_date").eq("professional_id", professional.id),
      supabase.from("availability_slots").select("slot_date, slot_time, location_id").eq("professional_id", professional.id).gte("slot_date", todayIso),
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
          if (!slotMatchesInitialLocation(s.location_id, initialLocationId)) continue;
          addDateSlot(map, s.slot_date, String(s.slot_time));
        }
        for (const k of Object.keys(map)) map[k].sort();
      }
      setDateSlots(map);
      setBlockedDates((bdData ?? []).map((r) => r.blocked_date));
      setTakenSlots(new Set<string>((takenRes?.taken as string[]) ?? []));
      setAvailabilityLoaded(true);

      if (user) {
        setIsLoggedIn(true);
        setClientName(limitText((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "", NAME_MAX_LENGTH));
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
            if (!hasCedula) {
              const pendingIdentity = readPendingBookingIdentity(user.id);
              if (pendingIdentity) {
                if (pendingIdentity.fullName) setClientName(limitText(pendingIdentity.fullName, NAME_MAX_LENGTH));
                if (pendingIdentity.noCedula) setNoCedula(true);
                else if (pendingIdentity.cedula) setProfileCedula(cleanId(pendingIdentity.cedula));
              }
            }
            if (data?.phone && hasPhoneNumber(String(data.phone))) {
              const accountPhone = String(data.phone);
              setProfilePhone(accountPhone);
              setProfilePhoneInitial(accountPhone);
              setProfilePhoneWasPrefilled(true);
            } else {
              // Legacy/professional-first accounts may have the number only on the
              // professional profile; prefill it and sync when the user confirms.
              supabase.from("professionals").select("whatsapp").eq("profile_id", user.id).maybeSingle()
                .then(({ data: pro }) => {
                  if (pro?.whatsapp && hasPhoneNumber(String(pro.whatsapp))) {
                    setProfilePhone(String(pro.whatsapp));
                    setProfilePhoneWasPrefilled(true);
                  }
                });
            }
            if (data?.full_name) setClientName((prev) => prev || limitText(String(data.full_name), NAME_MAX_LENGTH));
            // Saved DOB (backend-only) → auto-fills future MEDICAL requests. The padrón
            // has no birth date, so this profile value is the ONLY source for "para mí".
            setSelfDob((data as { date_of_birth?: string } | null)?.date_of_birth ?? null);
            setNeedsProfile(isOAuth && !hasCedula);
            setProfileLoaded(true);
          });
      } else {
        setIsLoggedIn(false);
        setProfileLoaded(true);
      }
    });
  }, [open, professional.id, initialCategoryId, initialDate, initialTime, initialLocationId, proProfessions, todayIso]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function refreshPublicAvailability() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/public-availability?professionalId=${professional.id}`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const json = await res.json();
        if (!active) return;

        if (typeof json.availabilityPublic === "boolean") setAvailabilityPrivate(!json.availabilityPublic);

        const publishedSlots = Array.isArray(json.allSlots) ? json.allSlots : json.slots;
        if (Array.isArray(publishedSlots)) {
          const map: Record<string, string[]> = {};
          for (const slot of publishedSlots as Array<{ date: string; time: string; locationId?: string | null }>) {
            if (!slotMatchesInitialLocation(slot.locationId, initialLocationId)) continue;
            addDateSlot(map, slot.date, slot.time);
          }
          for (const key of Object.keys(map)) map[key].sort();
          setDateSlots(map);
        }

        const taken = Array.isArray(json.taken) ? (json.taken as string[]) : [];
        setTakenSlots(new Set(taken));
        if (selectedDate && selectedTime) {
          const selectedKey = `${selectedDate} ${selectedTime}`;
          const slotStillOpen = (json.slots as Array<{ date: string; time: string; locationId?: string | null }> | undefined)
            ?.some((slot) =>
              slot.date === selectedDate &&
              slot.time === selectedTime &&
              slotMatchesInitialLocation(slot.locationId, initialLocationId)
            );
          if (taken.includes(selectedKey) || slotStillOpen === false) {
            setSelectedTime("");
            setSubmitError(locale === "en"
              ? "That time was just booked. Choose another available time."
              : "Ese horario acaba de ser reservado. Elige otra hora disponible.");
          }
        }
      } catch {
        // The submit endpoint still enforces the atomic guard if this refresh misses.
      }
    }

    window.addEventListener("focus", refreshPublicAvailability);
    window.addEventListener("ccr:availability-changed", refreshPublicAvailability);
    void refreshPublicAvailability();
    return () => {
      active = false;
      window.removeEventListener("focus", refreshPublicAvailability);
      window.removeEventListener("ccr:availability-changed", refreshPublicAvailability);
    };
  }, [open, professional.id, selectedDate, selectedTime, locale, initialLocationId]);

  // "Para otra persona" only exists for HEALTH services — if the (effective) category is
  // not health, force it back to "para mí" so a multi-profession pro who switches to a
  // non-health service never carries a stale beneficiary selection.
  useEffect(() => {
    if (!proIsHealth) {
      queueMicrotask(() => { setForSomeoneElse(false); setBenName(""); setBenDob(""); });
    }
  }, [proIsHealth]);

  // Live checks for the client's own ID (guest/needs-cédula flows):
  //  1) Whether it's ALREADY linked to another account — flagged immediately so the
  //     user is told up front, never after pressing confirm (any ID type).
  //  2) The padrón name (national cédulas only) for the match/mismatch confirm.
  useEffect(() => {
    const clean = cleanId(profileCedula);
    // The cédula changed → drop the previously auto-filled official NAME so switching to
    // a different/longer ID never keeps a stale name. The saved DOB is account-bound (not
    // cédula-bound) and the padrón has no birth date, so we never touch `selfDob` here.
    queueMicrotask(() => setSelfCedulaName(null));
    if (!isValidId(clean)) { queueMicrotask(() => { setSelfCedulaLoading(false); setCedulaTaken(false); }); return; }
    const isCedula = detectIdType(clean) === "cedula";
    if (!isCedula) { queueMicrotask(() => { setSelfCedulaName(null); setSelfCedulaLoading(false); }); }
    let active = true;
    if (isCedula) queueMicrotask(() => setSelfCedulaLoading(true));
    const t = setTimeout(async () => {
      // Already-registered check first (the message that must show up front).
      let taken = false;
      try {
        const a = await fetch(`/api/cedula-available?cedula=${clean}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!active) return;
        if (a?.taken) {
          taken = true;
          setCedulaTaken(true);
          setCedulaError(locale === "en"
            ? "That ID is already registered to another account. Sign in to that account or use a different ID."
            : "Esa identificación ya está registrada en otra cuenta. Inicia sesión en esa cuenta o usa una identificación diferente.");
        } else {
          setCedulaTaken(false);
        }
      } catch { /* don't block over our own outage */ }
      if (!isCedula) return;
      try {
        const res = await fetch(`/api/cedula/${clean}`);
        if (!active) return;
        const j = await res.json().catch(() => ({}));
        // NAME only — the padrón has no birth date, so DOB never comes from here.
        setSelfCedulaName(res.ok ? (j.fullName ?? null) : null);
        // EARLY feedback: a fully-typed national cédula that isn't in the padrón is
        // flagged the moment the lookup resolves (~0.5s after the field is complete),
        // not only at submit — so the client doesn't fill the whole form first. Never
        // clobber the higher-priority "ya está registrada" message.
        if (!taken) setCedulaError(res.ok ? null : locale === "en"
          ? "We couldn't find that ID. Check the number and try again."
          : "No encontramos esa identificación. Revisa el número e intenta de nuevo.");
      } catch { if (active) setSelfCedulaName(null); }
      finally { if (active) setSelfCedulaLoading(false); }
    }, 500);
    return () => { active = false; clearTimeout(t); };
  }, [locale, profileCedula]);

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
        window.dispatchEvent(new Event("ccr:profile-updated"));
      }
      if (active) setClientName(limitText(j.fullName, NAME_MAX_LENGTH));
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
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + BOOKING_MAX_FUTURE_DAYS);
  const maxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
  const canGoNext = new Date(currentYear, currentMonth + 1, 1) < maxMonth;

  // La flecha de la cabecera hace lo que espera cualquiera: vuelve al paso
  // anterior, y en el primero cierra. Por eso el pie ya no lleva "Atrás".
  const puedeVolver = step === "details" || step === "contact" || step === "complete"
    || (step === "calendar" && hayPasoServicio && !needsProfessionPick);
  function pasoAtras() {
    if (step === "contact" || step === "complete") { setStep("details"); return; }
    if (step === "details") { setStep("calendar"); return; }
    // Desde el calendario se vuelve a la lista de servicios, que es de donde se
    // venía; solo cierra cuando ya no hay paso anterior.
    if (step === "calendar" && hayPasoServicio && !needsProfessionPick) {
      setPickedCategory(null);
      setSelectedDate("");
      setSelectedTime("");
      return;
    }
    resetAndClose();
  }

  function resetAndClose() {
    const didBook = bookedRef.current;
    bookedRef.current = false;
    setStep("calendar");
    setSelectedDate("");
    setSelectedTime("");
    setDescription("");
    setCreatedBookingId(null);
    onClose();
    // Refresh server data so the slot we just booked stops showing as available on /buscar
    // (and the profile schedule). Only when a booking was actually made this session.
    if (didBook) router.refresh();
  }

  // "Ver mi solicitud" → the client's Solicitudes section, where the just-created request sits
  // at the top (newest first). Do not use resetAndClose here: that path refreshes the
  // current profile/search page, which can race the navigation and leave the user there.
  function goToMyRequest() {
    const params = new URLSearchParams({ tab: "sent_bookings" });
    if (createdBookingId) params.set("booking", createdBookingId);
    bookedRef.current = false;
    setStep("calendar");
    setSelectedDate("");
    setSelectedTime("");
    setDescription("");
    setCreatedBookingId(null);
    onClose();
    router.push(`/dashboard/profesional?${params.toString()}`);
  }

  async function handleSubmit(overrideCedula?: string, overridePhone?: string, overrideName?: string, options?: { skipProfilePhoneSave?: boolean }) {
    setSubmitting(true);
    setSubmitError(null);
    // The official padrón name (for "myself") prevails as the booking name.
    const submitName = (overrideName ?? (selfOfficialName || clientName)) || "Cliente";
    const serviceDescription = description;
    const effectivePhone = overridePhone ?? profilePhone;
    const cleanPhone = phoneDigits(effectivePhone);
    if (isLoggedIn && cleanPhone.length < 8) {
      setSubmitting(false);
      setSubmitError(locale === "en" ? "Enter a valid contact phone." : "Ingresa un teléfono de contacto válido.");
      return;
    }
    try {
      if (!options?.skipProfilePhoneSave && isLoggedIn) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const phoneChanged = cleanPhone !== phoneDigits(profilePhoneInitial);
          // Solo se guarda —y se avisa al resto de la app— si el teléfono de verdad
          // cambió. Antes se avisaba en CADA envío: el refresco global volvía a montar
          // la tarjeta con el modal y, si el servidor respondía con error, el cliente
          // veía el aviso medio segundo y el modal volvía solo al primer paso.
          if (phoneChanged) {
            const { error: profilePhoneError } = await supabase.from("profiles").update({ phone: cleanPhone }).eq("id", user.id);
            if (profilePhoneError) {
              setSubmitting(false);
              setSubmitError(locale === "en" ? "Couldn't save your contact phone. Try again." : "No se pudo guardar tu teléfono de contacto. Intenta de nuevo.");
              return;
            }
            const { error: professionalPhoneError } = await supabase.from("professionals").update({ whatsapp: cleanPhone }).eq("profile_id", user.id);
            if (professionalPhoneError) {
              setSubmitting(false);
              setSubmitError(locale === "en" ? "Couldn't save your contact phone. Try again." : "No se pudo guardar tu teléfono de contacto. Intenta de nuevo.");
              return;
            }
            setProfilePhoneInitial(cleanPhone);
            setProfilePhone(cleanPhone);
            window.dispatchEvent(new Event("ccr:profile-updated"));
          }
        }
      }
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: professional.id,
          clientName: submitName,
          clientEmail: clientEmail || null,
          clientCedula: (overrideCedula ?? profileCedula) || null,
          clientPhone: effectivePhone || null,
          // Sin descripción, la cita se llama como el servicio elegido.
          serviceDescription: serviceDescription.trim() || getCategoryLabel(effectiveCategory ?? professional.categoryId ?? "", locale),
          scheduledDate: selectedDate || null,
          scheduledTime: selectedTime || null,
          // (service + location) context of the picked slot.
          categoryId: effectiveCategory ?? professional.categoryId ?? null,
          slotLocationId: initialLocationId ?? null,
          slotLocationLabel: initialLocationLabel ?? null,
          preferredDateText: selectedDate
            ? `${formatDateDisplay(selectedDate, locale)}${selectedTime ? ` ${t("whatsapp.at")} ${selectedTime}` : ""}`
            : null,
          // Booking for someone else (a health-only DEPENDENT). We collect ONLY the
          // beneficiary's name + DOB — no cédula, no phone (the requester is the contact
          // and the pro doesn't need the patient's ID to accept/prepare).
          forSomeoneElse,
          beneficiaryName: forSomeoneElse ? (benName.trim() || null) : null,
          beneficiaryCedula: null,
          beneficiaryPhone: null,
          // DOB only for HEALTH services (data minimization). Omitted for non-health.
          clientDob: proIsHealth && !forSomeoneElse ? (effectiveSelfDob || null) : null,
          beneficiaryDob: proIsHealth && forSomeoneElse && benDob ? benDob : null,
          beneficiaryIsMinor: proIsHealth && forSomeoneElse && benDob ? isMinorFromDob(benDob) : false,
        }),
      });
      // Slot taken in the meantime (or another failure) → surface, don't "succeed".
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSubmitError(j?.error || (locale === "en" ? "Couldn't book the appointment. Try again." : "No se pudo reservar la cita. Intenta de nuevo."));
        return;
      }

      const result = await res.json().catch(() => ({}));
      if (typeof result?.id === "string") setCreatedBookingId(result.id);
      trackMetaEvent("Lead", {
        content_type: "professional_service",
        has_scheduled_time: Boolean(selectedDate && selectedTime),
        source: "booking_request",
      });

      bookedRef.current = true;
      clearPendingBookingIdentity();
      setStep("success");
      window.dispatchEvent(new Event("ccr:availability-changed"));
    } finally {
      setSubmitting(false);
    }
  }

  // Save the cédula/phone an OAuth user is missing, then continue to the booking.
  async function saveProfileAndSubmit() {
    setProfileError(null);
    const cleanCedula = profileCedula.replace(/\D/g, "");
    const cleanPhone = profilePhone.replace(/\D/g, "");
    if (cleanPhone.length < 8) { setProfileError(locale === "en" ? "Enter a valid phone number (8 digits)." : "Ingresa un teléfono válido (8 dígitos)."); return; }
    if ((needsProfile || needsCedula) && !selfHasAutoName && !clientName.trim()) { setProfileError(locale === "en" ? "Enter your full name." : "Ingresa tu nombre completo."); return; }
    // Validate the cédula (format + padrón existence) — recoverable inline error.
    // Capture the official name from the SAME call (avoids the debounce race).
    let validatedOfficialName: string | null = null;
    if (needsCedula && !noCedula) {
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
    const finalName = officialName || limitText(clientName.trim(), NAME_MAX_LENGTH);
    if (user) {
      // Only write the fields we actually collected on this step.
      const updates: Record<string, string> = { phone: cleanPhone };
      if (needsProfile) updates.full_name = clientName.trim();
      if (needsCedula && !noCedula && cleanCedula) updates.cedula = cleanCedula;
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
            ? (locale === "en" ? "That ID is already registered to another account." : "Esa identificación ya está registrada en otra cuenta.")
            : (locale === "en" ? "Couldn't save. Try again." : "No se pudo guardar. Intenta de nuevo.")
        );
        return;
      }
      const { error: professionalPhoneError } = await supabase.from("professionals").update({ whatsapp: cleanPhone }).eq("profile_id", user.id);
      if (professionalPhoneError) {
        setSavingProfile(false);
        setProfileError(locale === "en" ? "Couldn't save your contact phone. Try again." : "No se pudo guardar tu teléfono de contacto. Intenta de nuevo.");
        return;
      }
      await supabase.auth.updateUser({ data: { full_name: finalName, profile_completed: true } });
      window.dispatchEvent(new Event("ccr:profile-updated"));
    }
    if (officialName) setClientName(limitText(officialName, NAME_MAX_LENGTH));
    setProfileCedula(cleanCedula);
    setProfilePhone(cleanPhone);
    setProfilePhoneInitial(cleanPhone);
    setNeedsProfile(false);
    setSavingProfile(false);
    await handleSubmit(cleanCedula, cleanPhone, officialName || undefined, { skipProfilePhoneSave: true });
  }

  // Universal calendar export (.ics) — works with Google/Apple/Outlook.
  function downloadCalendar() {
    if (!selectedDate || !selectedTime) return;
    const ics = buildBookingIcs({
      proName: professional.fullName,
      service: description,
      date: selectedDate,
      time: selectedTime,
      whatsappLink: createdBookingId ? `${window.location.origin}/${locale}/dashboard/profesional?tab=sent_bookings&booking=${createdBookingId}` : `${window.location.origin}/${locale}/dashboard/profesional?tab=sent_bookings`,
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

  // Tira de días: el mes entero ocupaba tanto que las horas quedaban fuera de
  // pantalla y había que desplazarse para ver si servían. Con los próximos días
  // disponibles en una fila, la fecha y la hora se eligen sin bajar. El mes
  // completo sigue a un toque, para fechas lejanas.
  const [verMesCompleto, setVerMesCompleto] = useState(false);
  const proximosDias: Date[] = [];
  for (let i = 0; proximosDias.length < 14 && i < 120; i += 1) {
    const dia = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (isDayAvailable(dia)) proximosDias.push(dia);
  }
  const hasAnyAvailability = usesExplicitSlots || Object.values(availability).some((d) => d.enabled);

  // Cédula is requested at booking for EVERY client who doesn't have one on file
  // (it's no longer collected at signup). Phone is collected the same way.
  // "Needs cédula" depends on whether the account had one ON FILE (stable), NOT on
  // the live input value — otherwise typing fills profileCedula and the field
  // vanishes mid-keystroke. Gated on profileLoaded so it never flashes either. The
  // holder's cédula is only adopted for SELF bookings (a beneficiary's identity never
  // touches the account), so this stays gated on !forSomeoneElse.
  const needsCedula = isLoggedIn && profileLoaded && !hasStoredCedula && !forSomeoneElse;
  // The REQUESTER is always the coordination contact (incl. for a dependent booking,
  // since we no longer collect a beneficiary phone) — so require a phone on file
  // regardless of who the service is for.
  const needsPhone = isLoggedIn && !hasPhoneNumber(profilePhone);

  // Foreign / migratory ID (DIMEX/NITE): a VALID id that is NOT in the TSE padrón, so the
  // identity can't be padrón-verified. The request still goes through, but the pro sees it
  // as "sin verificar" — same as the no-cédula path. Drives the inline note below.
  const selfIsForeignId = !!profileCedula && isValidId(cleanId(profileCedula)) && detectIdType(cleanId(profileCedula)) !== "cedula";

  // Self: a national cédula resolved the official name → the name auto-fills (read-only)
  // below the ID; otherwise (no cédula / DIMEX) it's typed manually.
  const selfHasAutoName = !noCedula && !!selfCedulaName && !selfIsForeignId;

  // Effective DOB for the account holder: the SAVED profile DOB when present and not
  // being corrected; otherwise the manual input (first-time entry, or after "Corregir").
  const effectiveSelfDob = (selfDob && !dobEditing) ? selfDob : (selfDobInput || null);
  // "For myself" + a national cédula found in the padrón → the OFFICIAL name. When
  // it differs from the account name we warn, then let it prevail on confirm.
  // (Beneficiary cédulas never touch the account, so this is gated on !forSomeoneElse.)
  const selfOfficialName = !forSomeoneElse ? selfCedulaName : null;
  // When the cédula is already taken, the "already registered" message takes over —
  // don't also show the name-mismatch warning (it's moot; they can't use it).
  const nameWillChange = !cedulaTaken && !!selfOfficialName && !sameName(selfOfficialName, clientName);
  const needsCompleteStep = needsProfile || needsCedula || needsPhone;
  const canShowDetailsPhone = isLoggedIn && profileLoaded && !needsProfile && !needsCedula;
  const showDetailsPhone = canShowDetailsPhone && (!needsPhone || profilePhoneWasPrefilled);
  const detailsPhoneInvalid = showDetailsPhone && phoneDigits(profilePhone).length < 8;
  const totalSteps = (isLoggedIn ? (needsCompleteStep ? 3 : 2) : 3) + (hayPasoServicio ? 1 : 0);
  const stepIndex = { calendar: 0, details: 1, contact: 2, complete: 2, success: 3 };
  // Número de paso que se muestra: el de elegir servicio va antes del calendario.
  const pasoActual = needsProfessionPick ? 0 : (hayPasoServicio ? 1 : 0) + stepIndex[step];

  // Validate the client's cédula: format always; existence in the padrón for
  // national cédulas (DIMEX/NITE aren't in the TSE roll). Returns true if OK and
  // sets a recoverable inline error otherwise. Never drops the booking.
  async function validateClientCedula(): Promise<{ ok: boolean; officialName: string | null }> {
    setCedulaError(null);
    const clean = cleanId(profileCedula);
    if (!clean) {
      setCedulaError(locale === "en" ? "Enter your ID number." : "Ingresa tu número de identificación.");
      return { ok: false, officialName: null };
    }
    if (!isValidId(clean)) {
      setCedulaError(locale === "en"
        ? "The ID number is not valid (CR: 9 digits · DIMEX: 11-12 · NITE: 10). Check it and try again."
        : "El número de identificación no es válido (CR: 9 dígitos · DIMEX: 11-12 · NITE: 10). Revísalo e intenta de nuevo.");
      return { ok: false, officialName: null };
    }
    // Block early if it's already linked to another account (safety net for a fast
    // submit before the live check resolves).
    try {
      const a = await fetch(`/api/cedula-available?cedula=${clean}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (a?.taken) {
        setCedulaTaken(true);
        setCedulaError(locale === "en"
          ? "That ID is already registered to another account. Sign in to that account or use a different ID."
          : "Esa identificación ya está registrada en otra cuenta. Inicia sesión en esa cuenta o usa una identificación diferente.");
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
          setCedulaError(locale === "en"
            ? "We couldn't find that ID. Check the number and try again."
            : "No encontramos esa identificación. Revisa el número e intenta de nuevo.");
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
    // SAVED DOB → shown AUTO-FILLED and locked (a fixed fact); "Corregir" unlocks it for
    // a one-off correction. Otherwise (first time) → a manual date input asked once.
    if (selfDob && !dobEditing) {
      return (
        <div className="rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-[#15803d] break-words">
            {computeAge(selfDob)
              ? t("dobSavedWithAge", { dob: formatDobDMY(selfDob), age: formatAge(computeAge(selfDob), locale) })
              : t("dobSaved", { dob: formatDobDMY(selfDob) })}
          </p>
          <button type="button" onClick={() => { setSelfDobInput(selfDob); setDobEditing(true); }} className="shrink-0 text-[11px] font-semibold text-[#009FD9] hover:underline">
            {t("correct")}
          </button>
        </div>
      );
    }
    return (
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          {t("forWho.dobLabel")} <span className="text-red-500">*</span>
        </label>
        <DateOfBirthPicker
          value={selfDobInput}
          max={new Date().toISOString().slice(0, 10)}
          onChange={setSelfDobInput}
        />
        <p className="text-[11px] text-[#9ca3af] mt-1.5">{t("dobHealthHint")}</p>
      </div>
    );
  }

  function toggleNoCedula(on: boolean) {
    setNoCedula(on);
    // Entering the no-cédula path clears any typed/looked-up identification so nothing
    // stale is submitted or shown.
    if (on) { setProfileCedula(""); setCedulaError(null); setCedulaTaken(false); setSelfCedulaName(null); }
  }

  // "No tengo cédula" escape hatch (shared by the guest contact + logged-in complete
  // steps). When chosen, the request is sent WITHOUT a cédula and the pro sees it as
  // "sin verificar"; the client types their name manually (the name field is already
  // present in both steps). A "Tengo cédula" link returns to the verified path.
  function renderCedulaEscape() {
    if (noCedula) {
      return (
        <div className="rounded-lg bg-[#f9fafb] border border-[#e5e7eb] px-3 py-2.5 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#6b7280]" />
          <div className="text-xs text-[#6b7280] leading-snug break-words">
            <p>{locale === "en" ? <>You&apos;ll book your appointment <strong>without verified identity</strong>. The professional will see it and decide whether to contact you.</> : <>Reservarás tu cita <strong>sin identidad verificada</strong>. El profesional lo verá y decide si te contacta.</>}</p>
            <button type="button" onClick={() => toggleNoCedula(false)} className="mt-1 font-semibold text-[#009FD9] hover:underline">{locale === "en" ? "I have an ID" : "Tengo identificación"}</button>
          </div>
        </div>
      );
    }
    return (
      <button type="button" onClick={() => toggleNoCedula(true)} className="self-start -mt-1 text-xs font-semibold text-[#009FD9] hover:underline">
        {locale === "en" ? "I don't have an ID" : "No tengo identificación"}
      </button>
    );
  }

  // DIMEX/NITE (foreign ID) note — valid but not padrón-verifiable.
  function renderForeignIdNote() {
    if (!selfIsForeignId) return null;
    return (
      <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2 -mt-1 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#b45309]" />
        <p className="text-xs text-[#92400e] leading-snug break-words">
          {locale === "en"
            ? <>Foreign ID (DIMEX/NITE). It cannot be checked against the padrón; the professional will see your request as <strong>not verified</strong>. Enter your full name below.</>
            : <>Identificación extranjera (DIMEX/NITE). No se verifica contra el padrón; el profesional verá tu cita como <strong>no verificada</strong>. Escribe tu nombre completo abajo.</>}
        </p>
      </div>
    );
  }

  // Self "Nombre completo" field, rendered BELOW the identification: a placeholder while
  // a national cédula is looked up, the official name read-only once resolved, or a manual
  // input when there's no padrón name (no cédula / DIMEX).
  function renderSelfNameField() {
    if (!noCedula && selfCedulaLoading) {
      return (
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("contact.name")} <span className="text-red-500">*</span></label>
          <div className="flex h-10 items-center rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-sm text-[#9ca3af]">Buscando…</div>
        </div>
      );
    }
    if (selfHasAutoName) {
      return (
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("contact.name")} <span className="text-red-500">*</span></label>
          <div className="flex h-10 items-center justify-between rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4">
            <span className="truncate text-sm font-medium text-[#15803d]">{selfCedulaName}</span>
            <Check className="h-4 w-4 shrink-0 text-[#15803d]" />
          </div>
        </div>
      );
    }
    return (
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("contact.name")} <span className="text-red-500">*</span></label>
        <input
          type="text"
          className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          placeholder={t("contact.namePlaceholder")}
          value={clientName}
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => setClientName(limitText(e.target.value, NAME_MAX_LENGTH))}
        />
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 hidden bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:block" />
        <Dialog.Content
          // The SelectMenu dropdowns (DOB picker day/month/year, etc.) portal their option
          // list to <body>, OUTSIDE this dialog. Without these guards, clicking an option
          // registers as an "interaction outside" → the dialog dismisses, so the picker reads
          // as "broken / won't let me select" (most visible in the beneficiary DOB, which has
          // no padrón auto-fill and must be picked manually). preventDefault ONLY for the
          // SelectMenu list keeps normal overlay/Escape close working.
          onPointerDownOutside={keepSelectMenuOpen}
          onInteractOutside={keepSelectMenuOpen}
          onFocusOutside={keepSelectMenuOpen}
          className={cn(
            "ccr-booking-modal-panel fixed inset-0 z-50 lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
            "h-dvh max-h-dvh min-h-[100svh] w-full overflow-hidden rounded-none bg-[#f4f7fa] shadow-none lg:h-auto lg:min-h-0 lg:max-h-[720px] lg:w-[95vw] lg:max-w-xl lg:rounded-3xl lg:shadow-2xl",
            "flex flex-col",
            "lg:max-h-[720px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 lg:data-[state=closed]:zoom-out-95 lg:data-[state=open]:zoom-in-95 lg:data-[state=closed]:slide-out-to-bottom-0 lg:data-[state=open]:slide-in-from-bottom-0"
          )}
        >
          <Dialog.Title className="sr-only">
            {`${t("title")} - ${proDisplayName(professional.fullName)}`}
          </Dialog.Title>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f4f7fa]">
            {/* Cabecera con el mismo patrón que las demás pantallas: salida a la
                izquierda (flecha en el teléfono, X en escritorio), título centrado y
                el avance en una barra fina bajo la línea, en vez de puntitos. */}
            <div className="relative flex shrink-0 items-center justify-center border-b border-[#f3f4f6] bg-white px-14 pb-3.5 pt-[max(env(safe-area-inset-top),0.875rem)] lg:px-6 lg:py-4">
              <div className="min-w-0 text-center lg:text-left">
                <h2 className="text-lg font-bold text-[#111827]">{t("title")}</h2>
                {step !== "success" && (
                  <p className="mt-0.5 text-xs text-[#6b7280]">{t("stepOf", { current: pasoActual + 1, total: totalSteps })}</p>
                )}
              </div>
              <button
                type="button"
                onClick={pasoAtras}
                aria-label={puedeVolver ? t("back") : t("close")}
                className="absolute bottom-2.5 left-4 flex h-9 w-9 items-center justify-center rounded-lg text-[#162543] transition-colors hover:bg-[#f3f4f6] lg:bottom-auto lg:right-4 lg:top-1/2 lg:left-auto lg:-translate-y-1/2"
              >
                <ArrowLeft className="h-5 w-5 lg:hidden" />
                <X className="hidden h-5 w-5 lg:block" />
              </button>
            </div>
            {step !== "success" && (
              <div className="h-1 shrink-0 bg-[#eef3f7]">
                <div className="h-full bg-[#009FD9] transition-all duration-300" style={{ width: `${((pasoActual + 1) / totalSteps) * 100}%` }} />
              </div>
            )}

            {/* Step content */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#f4f7fa] px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 md:px-6 md:pb-4">
              {/* Con quién es la cita: una fila compacta, no medio modal. */}
              {step !== "success" && (
                <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-[#e5edf4] bg-white px-4 py-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                    <AvatarFallback className="bg-[#EAF7FD] text-sm font-bold text-[#0089bb]">{getInitials(professional.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[15px] font-bold leading-tight text-[#162543]">
                      <span className="min-w-0 truncate">{proDisplayName(professional.fullName)}</span>
                      {professional.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-[#009FD9]" aria-label={t("verified")} />}
                    </p>
                    {/* Con servicio elegido, el servicio. Mientras se elige, decir
                        "Cámaras de seguridad +5" suena a que ya se eligió: ahí van las
                        reseñas, que es lo que ayuda a decidir si reservar con él. */}
                    {effectiveCategory ? (
                      <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{getCategoryLabel(effectiveCategory, locale)}</p>
                    ) : professional.reviewCount > 0 ? (
                      <StarRating rating={professional.ratingAvg} reviewCount={professional.reviewCount} showValue size="sm" className="mt-0.5" />
                    ) : (
                      <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{t("noReviews")}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-[#e5edf4] bg-white px-4 py-4 md:px-5">

              {/* STEP: calendar */}
              {step === "calendar" && (
                <div>
                  {/* Multi-profession pro + no category context → pick the service FIRST
                      (so we know whether it's health → date of birth). */}
                  {needsProfessionPick && (
                    <div className="flex flex-col gap-2.5">
                      <h3 className="text-lg font-semibold text-[#111827] mb-0.5">{t("servicePick.title")}</h3>
                      <p className="text-sm text-[#6b7280] mb-1.5">{t("servicePick.body")}</p>
                      {proProfessions.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPickedCategory(cat)}
                          className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl border border-[#e5edf4] bg-white px-4 py-3.5 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f7f9fb]"
                        >
                          <span className="min-w-0 break-words">{getCategoryLabel(cat, locale)}</span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8]" />
                        </button>
                      ))}
                    </div>
                  )}
                  {!needsProfessionPick && (<>
                  <h3 className="text-lg font-semibold text-[#111827] mb-1">{t("calendar.title")}</h3>
                  <p className="text-sm text-[#6b7280] mb-4">
                    {initialLocationLabel ? <>{t.rich("calendar.locationPrefix", { location: initialLocationLabel, b: (c) => <span className="font-semibold text-[#374151]">{c}</span> })} </> : null}
                    {t("calendar.availabilityHint")}
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
                        <p className="text-sm font-semibold text-[#111827]">{t("calendar.privateTitle")}</p>
                        <p className="text-xs text-[#9ca3af] mt-1 max-w-xs">
                          {nativeApp
                            ? locale === "en"
                              ? "This professional coordinates availability by message."
                              : "Este profesional coordina la disponibilidad por mensaje."
                            : t("calendar.privateBody")}
                        </p>
                      </div>
                      <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} contextTitle={categoryName} buttonLabel="WhatsApp" analyticsSource="booking" className="rounded-xl px-5 py-2.5 text-sm font-semibold" />
                    </div>
                  ) : !hasAnyAvailability ? (
                    <div className="flex flex-col items-center text-center gap-3 py-8 rounded-2xl bg-[#f9fafb] border border-[#e5e7eb]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB]">
                        <MessageCircle className="h-5 w-5 text-[#009FD9]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">
                          {nativeApp
                            ? locale === "en" ? "Coordinate by message" : "Coordinar por mensaje"
                            : t("calendar.whatsappOnlyTitle")}
                        </p>
                        <p className="text-xs text-[#9ca3af] mt-1 max-w-xs">
                          {nativeApp
                            ? locale === "en"
                              ? "Write to the professional to ask about available times."
                              : "Escribe al profesional para consultar horarios disponibles."
                            : t("calendar.whatsappOnlyBody")}
                        </p>
                      </div>
                      <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} contextTitle={categoryName} buttonLabel="WhatsApp" analyticsSource="booking" className="rounded-xl px-5 py-2.5 text-sm font-semibold" />
                    </div>
                  ) : (
                    // Two sub-columns on desktop: CALENDAR (left) and that day's SLOTS (right).
                    <div className="grid min-w-0 gap-5 md:grid-cols-2">
                      {/* CALENDAR */}
                      <div className="min-w-0">
                        {!verMesCompleto && proximosDias.length > 0 ? (
                          <>
                            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {proximosDias.map((dia) => {
                                const iso = formatDateISO(dia);
                                const elegido = selectedDate === iso;
                                const esHoy = iso === formatDateISO(today);
                                return (
                                  <button
                                    key={iso}
                                    type="button"
                                    onClick={() => { setSelectedDate(iso); setSelectedTime(""); }}
                                    className={cn(
                                      "flex h-[68px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-colors",
                                      elegido ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#e5e7eb] bg-white text-[#162543] hover:border-[#009FD9]",
                                    )}
                                  >
                                    <span className={cn("text-[11px] font-semibold uppercase tracking-wide", elegido ? "text-white/80" : "text-[#9ca3af]")}>
                                      {esHoy ? t("calendar.today") : dia.toLocaleDateString(dateLocale(locale), { weekday: "short" }).replace(".", "")}
                                    </span>
                                    <span className="text-[17px] font-bold leading-none">{dia.getDate()}</span>
                                    <span className={cn("text-[11px] leading-none", elegido ? "text-white/80" : "text-[#9ca3af]")}>
                                      {dia.toLocaleDateString(dateLocale(locale), { month: "short" }).replace(".", "")}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => setVerMesCompleto(true)}
                              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0089bb] hover:text-[#006e96]"
                            >
                              <CalendarDays className="h-4 w-4" />
                              {t("calendar.seeMonth")}
                            </button>
                          </>
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
                            {calendarMonthLabel(currentYear, currentMonth, locale)}
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
                          {calendarDayNames(locale).map((d) => (
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
                                  "relative aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-all",
                                  isSelected && "bg-[#009FD9] text-white shadow-sm",
                                  !isSelected && available && "hover:bg-[#EBF5FB] text-[#111827] cursor-pointer",
                                  !isSelected && available && isToday && "text-[#009FD9]",
                                  !isSelected && !available && "text-[#d1d5db] cursor-not-allowed"
                                )}
                              >
                                {isToday && !isSelected && (
                                  <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wide leading-none text-[#009FD9]">{t("calendar.today")}</span>
                                )}
                                <span className={cn(isBlocked && "line-through opacity-50")}>{date.getDate()}</span>
                                {available && !isSelected && (
                                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#009FD9]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      
                            <button
                              type="button"
                              onClick={() => setVerMesCompleto(false)}
                              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0089bb] hover:text-[#006e96]"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              {t("calendar.seeDays")}
                            </button>
                          </>
                        )}
                      </div>

                      {/* SLOTS for the selected day, grouped by franja (Mañana / Tarde / Noche). */}
                      <div ref={slotsRef} className="min-w-0 md:border-l md:border-[#f3f4f6] md:pl-5 scroll-mt-4">
                        {!selectedDate ? (
                          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-center">
                            <CalendarCheck className="h-7 w-7 text-[#cbd5e1]" />
                            <p className="mt-2 text-sm text-[#9ca3af]">{t("calendar.pickDay")}</p>
                          </div>
                        ) : slots.length === 0 ? (
                          <p className="text-sm text-[#9ca3af] text-center py-6">{t("calendar.noSlots")}</p>
                        ) : (
                          <>
                            <p className="mb-3 text-sm font-semibold text-[#162543]">{formatDateDisplay(selectedDate, locale)}</p>
                            {[
                              { key: "morning", label: t("calendar.morning"), Icon: Sun, items: slots.filter((s) => parseInt(s, 10) < 12) },
                              { key: "afternoon", label: t("calendar.afternoon"), Icon: Sunset, items: slots.filter((s) => { const h = parseInt(s, 10); return h >= 12 && h < 18; }) },
                              { key: "night", label: t("calendar.night"), Icon: Moon, items: slots.filter((s) => parseInt(s, 10) >= 18) },
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
                                        "h-11 w-full rounded-full border text-sm font-semibold tabular-nums transition-all",
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
                    {/* Lo ya elegido, en el mismo bloque de resumen que la pantalla final:
                        antes eran tres líneas sueltas —un emoji en turquesa, un saludo y la
                        identificación en verde— que parecían avisos y no un resumen. */}
                    {selectedDate && (
                      <div className="mt-2.5 rounded-xl bg-[#f8fbfd] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#374151]">
                        <p className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4 shrink-0 text-[#0089bb]" />
                          <span className="font-semibold text-[#162543]">{formatDateDisplay(selectedDate, locale)}{selectedTime ? ` · ${selectedTime}` : ""}</span>
                        </p>
                        {isLoggedIn && profileCedula && (
                          <p className="mt-1 flex items-start gap-1.5 text-[#6b7280]">
                            <UserRound className="mt-px h-4 w-4 shrink-0 text-[#9ca3af]" />
                            <span>{t.rich("bookingAs", { name: clientName || t("youLower"), cedula: profileCedula, b: (c) => <span className="font-medium text-[#374151]">{c}</span> })}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ¿Para quién? — shown ONLY for HEALTH services (a doctor/therapist/carer
                      attends a specific person, so age = clinical triage). For every other
                      category the service is for the requester / a place / an object, so the
                      toggle is hidden and we collect requester data only. */}
                  {proIsHealth && (
                    <div className="border-t border-[#edf1f5] pt-3">
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">
                        {isCareCategory(effectiveCategory) ? t("forWho.questionCare") : t("forWho.question")} <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { v: false, label: t("forWho.me") },
                          { v: true, label: t("forWho.other") },
                        ] as const).map((opt) => (
                          <button
                            key={String(opt.v)}
                            type="button"
                            onClick={() => setForSomeoneElse(opt.v)}
                            className={cn(
                              "h-10 rounded-xl border px-3 text-sm font-semibold transition-all",
                              forSomeoneElse === opt.v ? "border-[#009FD9] bg-[#f5fbfe] text-[#0089bb] shadow-[0_0_0_1px_rgba(0,159,217,0.08)]" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#009FD9]/40"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {forSomeoneElse && (
                        <p className="text-xs text-[#9ca3af] mt-1.5 leading-snug">{t("forWho.helper")}</p>
                      )}
                    </div>
                  )}

                  {/* DOB for HEALTH services, "para mí" — ONLY when the cédula is already
                      on file (auto-filled from it, or asked once if the roll has no DOB).
                      When there's no cédula yet, the DOB is collected WITH the cédula at the
                      next step (so typing it auto-fills name + DOB together). */}
                  {proIsHealth && !forSomeoneElse && hasStoredCedula && renderSelfDobField()}

                  {/* Beneficiary (a HEALTH dependent) — NAME + DATE OF BIRTH only. The pro
                      attends THIS person and the age drives triage + the minor/adulto-mayor
                      badge; we collect nothing else (no cédula, no phone — the requester is
                      the coordination contact). */}
                  {forSomeoneElse && (
                    <div className="border-l-2 border-[#d8eef8] pl-3 flex flex-col gap-3">
                      <p className="text-sm font-semibold text-[#374151]">
                        {isCareCategory(effectiveCategory) ? t("forWho.personTitle") : t("forWho.patientTitle")}
                      </p>
                      <div>
                        <label className="text-xs font-medium text-[#374151] block mb-1.5">{t("forWho.nameLabel")} <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={benName}
                          maxLength={NAME_MAX_LENGTH}
                          onChange={(e) => setBenName(limitText(e.target.value, NAME_MAX_LENGTH))}
                          placeholder={t("forWho.namePlaceholder")}
                          className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#374151] block mb-1.5">{t("forWho.dobLabel")} <span className="text-red-500">*</span></label>
                        <DateOfBirthPicker
                          value={benDob}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={setBenDob}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.description")} <span className="font-normal text-[#9ca3af]">({t("optional")})</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[110px] resize-none break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder={t("step4.descPlaceholder")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={300}
                    />
                    {description.length >= 300 && (
                      <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: 300 })}</p>
                    )}
                  </div>
                  {showDetailsPhone && (
                    <div>
                      <PhoneInput
                        label={t("contact.phone")}
                        required
                        value={profilePhone}
                        onChange={setProfilePhone}
                      />
                      <p className="text-xs text-[#9ca3af] mt-1">{t("contact.phoneHint")}</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: contact (guests) */}
              {step === "contact" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">{t("contact.title")}</h3>
                  {/* IDENTIFICATION FIRST → the name auto-fills from it below. */}
                  {!noCedula && (
                    <CedulaInput
                      required
                      autoFocus
                      value={profileCedula}
                      onChange={(c) => { setProfileCedula(c); setCedulaError(null); setCedulaTaken(false); }}
                      error={cedulaError ?? undefined}
                    />
                  )}
                  {!noCedula && renderForeignIdNote()}
                  {renderCedulaEscape()}
                  {/* NAME below the ID — auto-filled (read-only) for a national cédula,
                      manual for no-cédula / DIMEX. */}
                  {renderSelfNameField()}
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.email")} <span className="text-[#9ca3af] font-normal">({t("optional")})</span>
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
                        {t("contact.emailTaken")}
                      </p>
                    )}
                  </div>
                  <PhoneInput
                    label={t("contact.phone")}
                    value={profilePhone}
                    onChange={setProfilePhone}
                  />
                  <p className="text-xs text-[#9ca3af] -mt-2">
                    {t("contact.phoneHint")}
                  </p>
                  {/* HEALTH service for myself → DOB, auto-filled from the cédula above. */}
                  {proIsHealth && !forSomeoneElse && renderSelfDobField()}
                </div>
              )}

              {/* STEP: complete profile — phone (always) + cédula/name when missing */}
              {step === "complete" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#111827]">
                      {needsProfile ? t("completeProfileTitle") : t("whatsappNumberTitle")}
                    </h3>
                    <p className="text-sm text-[#6b7280] mt-1">
                      {needsProfile
                        ? t("completeProfileBody")
                        : t("whatsappNumberBody")}
                    </p>
                  </div>

                  {profileError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                      <Shield className="h-3.5 w-3.5 shrink-0" />
                      {profileError}
                    </div>
                  )}

                  {/* IDENTIFICATION FIRST (when missing) → the name auto-fills/confirms below. */}
                  {needsCedula && (
                    <div className="flex flex-col">
                      {!noCedula && (
                        <>
                          <CedulaInput
                            required
                            value={profileCedula}
                            onChange={(c) => { setProfileCedula(c); setCedulaError(null); setCedulaTaken(false); }}
                            error={cedulaError ?? undefined}
                          />
                          {/* Padrón lookup: name MATCHES the account → silent green confirm.
                              Name DIFFERS → amber warning; the official name will prevail. */}
                          {selfCedulaName && !nameWillChange && (
                            <div className="rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-2 mt-1.5">
                              <p className="text-xs text-[#15803d] break-words">Confirma: <strong>{selfCedulaName}</strong></p>
                            </div>
                          )}
                          {nameWillChange && (
                            <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 mt-1.5 flex items-start gap-2">
                              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#b45309]" />
                              <p className="text-xs text-[#92400e] leading-snug break-words">
                                {locale === "en"
                                  ? <>The ID entered belongs to <strong>{selfCedulaName}</strong>. When you confirm, your account will use this official name. Use only your own ID.</>
                                  : <>La identificación ingresada pertenece a <strong>{selfCedulaName}</strong>. Al confirmar, tu cuenta usará este nombre oficial. Usa únicamente tu propia identificación.</>}
                              </p>
                            </div>
                          )}
                          <div className="mt-1.5">{renderForeignIdNote()}</div>
                        </>
                      )}
                      <div className="mt-1.5">{renderCedulaEscape()}</div>
                    </div>
                  )}
                  {/* NAME below the ID — typed manually when there's no padrón name to fill
                      it (OAuth account with no name, or the no-cédula / DIMEX paths). When a
                      national cédula resolves, the green confirm above is the name. */}
                  {(needsProfile || needsCedula) && !selfHasAutoName && (
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("contact.name")} <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                        placeholder={t("contact.namePlaceholder")}
                        value={clientName}
                        maxLength={NAME_MAX_LENGTH}
                        onChange={(e) => setClientName(limitText(e.target.value, NAME_MAX_LENGTH))}
                      />
                    </div>
                  )}
                  <PhoneInput
                    label={t("contact.phone")}
                    required
                    value={profilePhone}
                    onChange={setProfilePhone}
                  />
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
                  {/* Lo que acaba de reservar, en una línea por dato: la pantalla de
                      éxito decía "quedó agendada" sin decir cuándo ni de qué. */}
                  <div className="w-full max-w-xs rounded-2xl border border-[#e3edf5] bg-[#f8fbfd] px-4 py-3 text-left text-[13px] leading-relaxed text-[#374151]">
                    <p className="font-semibold text-[#162543]">{description.trim() || (effectiveCategory ? getCategoryLabel(effectiveCategory, locale) : categoryName || getCategoryLabel(professional.categoryId ?? "", locale))}</p>
                    {selectedDate && (
                      <p className="mt-1 inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-[#0089bb]" />{formatDateDisplay(selectedDate, locale)}{selectedTime ? ` · ${selectedTime}` : ""}</p>
                    )}
                    {initialLocationLabel && (
                      <p className="mt-0.5 inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#0089bb]" />{initialLocationLabel}</p>
                    )}
                  </div>
                  {createdBookingId && <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} bookingId={createdBookingId} contextTitle={description || categoryName} buttonLabel="WhatsApp" analyticsSource="booking" className="w-full max-w-xs rounded-xl px-5 py-3 text-sm font-semibold" />}
                  {selectedDate && selectedTime && (
                    <button
                      onClick={downloadCalendar}
                      className="inline-flex items-center justify-center gap-2 w-full max-w-xs border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] font-semibold py-2.5 rounded-xl transition-colors text-sm"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      {t("success.addToCalendar")}
                    </button>
                  )}
                </div>
              )}

              </div>
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

            {/* Footer actions — elegir el servicio ES la acción de ese paso: sin
                nada que confirmar, la barra de abajo se queda vacía y estorba. */}
            {step !== "success" && !(step === "calendar" && needsProfessionPick) && (
              <div className="ccr-pie-formulario flex shrink-0 flex-col gap-2 border-t border-[#e5e7eb] bg-white px-4 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
                {step === "calendar" && !needsProfessionPick && (
                  <>
                    {/* Igual que en Publicar empleo: solo el botón. La fecha elegida ya
                        se ve arriba (el día en el calendario y la hora resaltada), así
                        que repetirla aquí solo hacía la barra más alta. La pista queda
                        únicamente mientras no hay nada elegido, que es cuando ayuda. */}
                    {!(selectedDate && selectedTime) && (
                      <p className="truncate text-center text-sm text-[#6b7280]">{t("calendar.selectDateTime")}</p>
                    )}
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={!selectedDate || slots.length === 0 || !selectedTime}
                      onClick={() => setStep("details")}
                    >
                      {t("continue")}
                    </Button>
                  </>
                )}

                {step === "details" && (
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={
                      (forSomeoneElse && (!benName.trim() || !benDob))
                      || (proIsHealth && !forSomeoneElse && hasStoredCedula && !effectiveSelfDob)
                      || detailsPhoneInvalid
                    }
                    loading={submitting}
                    onClick={async () => {
                      // Booking for a dependent needs the beneficiary's name + DOB (age).
                      if (forSomeoneElse && (!benName.trim() || !benDob)) return;
                      // Health services require the patient's DOB. For "para mí" we only
                      // gate HERE when the cédula is already on file; otherwise the DOB is
                      // collected with the cédula at the contact/complete step.
                      if (proIsHealth && !forSomeoneElse && hasStoredCedula && !effectiveSelfDob) return;
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
                    size="lg"
                    className="w-full"
                    loading={submitting || checkingCedula}
                    disabled={profilePhone.replace(/\D/g, "").length < 8 || guestEmailCheck.taken || (!noCedula && !profileCedula) || (!selfHasAutoName && !clientName.trim()) || (proIsHealth && !forSomeoneElse && !effectiveSelfDob)}
                    onClick={async () => {
                      // No-cédula path → send WITHOUT a cédula (profileCedula was cleared);
                      // the pro receives it flagged as "sin verificar".
                      if (noCedula) { await handleSubmit(); return; }
                      const v = await validateClientCedula();
                      if (v.ok) await handleSubmit(undefined, undefined, v.officialName || undefined);
                    }}
                  >
                    {submitting || checkingCedula ? "Enviando…" : t("step4.submit")}
                  </Button>
                )}

                {step === "complete" && (
                  <Button
                    size="lg"
                    className="w-full"
                    loading={savingProfile || submitting}
                    disabled={savingProfile || submitting || ((needsProfile || needsCedula) && !selfHasAutoName && !clientName.trim()) || (proIsHealth && !forSomeoneElse && needsCedula && !effectiveSelfDob)}
                    onClick={saveProfileAndSubmit}
                  >
                    {savingProfile || submitting ? "Enviando…" : t("step4.submit")}
                  </Button>
                )}
              </div>
            )}

            {step === "success" && (
              <div className="ccr-pie-formulario flex shrink-0 flex-col gap-2 border-t border-[#e5e7eb] bg-white px-4 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
                {/* Lead to the just-made request (it's at the top of Solicitudes), not a
                    dead-end "Listo". Closing still refreshes /buscar so the slot disappears. */}
                <Button size="md" className="w-full" onClick={goToMyRequest}>
                  {t("success.viewRequest")}
                </Button>
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
