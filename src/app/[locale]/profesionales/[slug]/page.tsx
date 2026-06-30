"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  MapPin, Shield, ArrowLeft, Star, Briefcase, Camera, Banknote, Languages,
  Share2, Flag, ChevronDown, Lock, Award, Mail, SearchX, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { InstagramIcon, FacebookIcon, TikTokIcon } from "@/components/icons/social-icons";
import { buildSocialUrl } from "@/lib/social";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink, proDisplayName, cn } from "@/lib/utils";
import { anyVideoConsultCategory, getCategoryLabel } from "@/lib/data/categories";
import { casoProfession, countCases } from "@/lib/services";
import { formatServicePrice, primaryPricingLabel } from "@/lib/pricing";
import { languageLabel } from "@/lib/data/languages";
import { insurerLabel } from "@/lib/data/insurers";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { ReviewSection } from "@/components/professionals/review-section";
import { CaseShowcase } from "@/components/professionals/case-showcase";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { createClient } from "@/lib/supabase/client";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { BookingModal } from "@/components/booking/booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { SelfActionModal, SELF_MSG } from "@/components/professionals/self-action-modal";
import { SaveButton, type SavedPro } from "@/components/professionals/save-button";
import type { ProfessionalDetail } from "@/lib/queries/professionals";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

// ─── WhatsApp icon ────────────────────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

// ─── Sub-rating row ───────────────────────────────────────────────────────────
// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = "servicios" | "casos" | "certificaciones" | "resenas" | "sobre";

function initialTabFromUrl(): Tab {
  if (typeof window === "undefined") return "servicios";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return (["servicios", "casos", "certificaciones", "resenas", "sobre"] as const).includes(tab as Tab)
    ? (tab as Tab)
    : "servicios";
}
function searchParamFromUrl(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProfilePage({ params }: ProfilePageProps) {
  const t = useTranslations("profile");
  const tCat = useTranslations("categories");
  const locale = useLocale();
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  const [profileSlots, setProfileSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [proNotFound, setProNotFound] = useState(false);
  // The logged-in viewer's role-aware panel route — drives the "Volver a mi panel"
  // button on the "Profesional no encontrado" screen so a signed-in visitor is never
  // stranded. `null` = logged out (that screen then shows only "Buscar profesionales").
  const [panelHref, setPanelHref] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => initialTabFromUrl());
  // Deep-link support: /profesionales/[slug]?tab=casos opens that tab.
  // Preview mode (?preview=1): a pro opened "Ver cómo me ven los clientes" from
  // their panel → show a clear "Volver a mi panel" bar so they never get stuck.
  const [previewMode] = useState(() => searchParamFromUrl("preview") === "1");
  // The profession the client searched/filtered by (?categoria=) — passed to the
  // booking modal so, for a multi-specialty pro, that service is pre-selected and we
  // know up front whether it's a health service (DOB) without re-asking.
  const [activeCategory, setActiveCategory] = useState<string | undefined>(() => searchParamFromUrl("categoria") ?? undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [slug, setSlug] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  // Own-profile self-actions are blocked with a friendly modal (buttons stay visible).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);
  // "Solicitar servicio" (per service card) → the SAME existing request flow as the
  // contact card: bookable pros open the booking modal (registration-gated for guests);
  // WhatsApp-only pros open WhatsApp. `bookingCat` carries the card's service as context.
  const [bookingCat, setBookingCat] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingReg, setBookingReg] = useState(false);
  const [serviceDescriptionOpen, setServiceDescriptionOpen] = useState<{ title: string; description: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { slug } = await params;
      setSlug(slug);
      const res = await fetch(`/api/professionals/${slug}`);
      if (!res.ok) { setProNotFound(true); setLoading(false); return; }
      const pro: ProfessionalDetail | null = await res.json();
      if (!pro) { setProNotFound(true); setLoading(false); return; }
      setProfessional(pro);
      setLoading(false);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
      setViewerId(user?.id ?? null);

      // Upcoming slots for the contact card, already excluding active bookings.
      const availability = await fetch(`/api/public-availability?professionalId=${pro.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      setProfileSlots(Array.isArray(availability?.slots) ? availability.slots : []);
    }
    load();
  }, [params]);

  // Resolve the viewer's role-aware panel route up front (parallel, non-blocking) so the
  // "Profesional no encontrado" screen can offer "Volver a mi panel" even though load()
  // bails early on a missing pro. Reads ONLY the session (no avatar/profiles query).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) { setPanelHref(null); return; }
        const role = (user.user_metadata?.role as string | undefined) ?? "client";
        setPanelHref(role === "professional" ? "/dashboard/profesional" : "/dashboard/cliente");
      })
      .catch(() => setPanelHref(null));
  }, []);

  // Close dropdown on outside click / tap / Escape
  useEffect(() => {
    function onClickOutside(e: Event) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setDropdownOpen(false); }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#009FD9] border-t-transparent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (proNotFound || !professional) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 text-center">
          <BrandIconBadge icon={SearchX} size={72} />
          <h1 className="text-2xl font-bold text-[#111827]">{t("notFoundTitle")}</h1>
          <p className="text-[#6b7280] text-sm max-w-sm">
            {t("notFoundDesc")}
          </p>
          {/* A logged-in visitor gets a role-aware "Volver a mi panel" (primary) so they're
              never stranded; "Buscar profesionales" stays as the secondary. A guest sees
              only "Buscar profesionales" (no broken panel link). Stacks full-width ~360px. */}
          <div className="mt-2 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            {panelHref && (
              <Link
                href={panelHref}
                className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" /> {t("backToPanel")}
              </Link>
            )}
            <Link
              href="/buscar"
              className={
                panelHref
                  ? "inline-flex items-center justify-center gap-2 border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] font-semibold px-6 py-3 rounded-full transition-colors text-sm w-full sm:w-auto"
                  : "inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm w-full sm:w-auto"
              }
            >
              {t("searchProfessionals")}
            </Link>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const expYears = professional.yearsExperience ?? 0;
  const waLink = getWhatsAppLink(
    professional.whatsapp,
    t("waPrefill", { name: professional.fullName.split(" ")[0] })
  );

  // Hide services the pro marked INACTIVE (paused) — clients only see active ones.
  const services = (professional.services ?? []).filter((s) => (s as { active?: boolean }).active !== false);
  const locationText = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");
  // Fallback location tab/address for the contact-card schedule (when the pro has no named
  // workplaces) — same data the /buscar card passes to ProfessionalSchedule.
  const placeFallback = professional.cantonName || professional.provinceName || "";
  const placeAddress = locationText;

  const hasCasos = !!professional.portfolioUrls && professional.portfolioUrls.length > 0;
  // Count CASES, not photos: 1 caso de éxito with 3 photos must read "1", not "3"
  // (portfolioUrls is the flattened photo list). See countCases().
  const casosCount = countCases(professional.portfolioItems, professional.portfolioUrls);
  const certificationsList = (professional.certifications ?? []).filter((c) => c?.name?.trim());
  const hasCerts = certificationsList.length > 0;
  // Group certifications by profession (legacy untagged → principal profession).
  const principalProfession = professional.professions?.[0] ?? professional.categoryId ?? "";
  const certGroups = (() => {
    const map = new Map<string, typeof certificationsList>();
    for (const c of certificationsList) {
      const key = c.profession || principalProfession || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries());
  })();
  // A pro viewing their OWN public profile cannot request a service from themselves.
  const isOwn = !!viewerId && viewerId === professional.profileId;

  // "Solicitar servicio" routing — mirrors the contact card's logic: a bookable pro
  // (public availability + not WhatsApp-only) opens the booking flow (registration-gated
  // for guests); otherwise it falls back to WhatsApp, exactly as the app handles it.
  const canBookService = (professional.availabilityPublic ?? true) && (professional.contactPreference ?? "ambas") !== "solo_whatsapp";
  function requestService(cat: string) {
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    setBookingCat(cat);
    if (!canBookService) { if (waLink) window.open(waLink, "_blank"); return; }
    if (isAuthenticated) setBookingOpen(true);
    else setBookingReg(true);
  }

  // Favorites: the SAME system as the /buscar cards. Keyed on `professional.id`
  // (the professionals row id the card also uses), so saving here reflects on the
  // card and vice-versa. `isVerified` is derived exactly like the card. Self-favorite
  // is blocked via the shared SelfActionModal (isOwn) — see SaveButton.
  const savedPro: SavedPro = {
    id: professional.id,
    slug: professional.slug,
    fullName: professional.fullName,
    avatarUrl: professional.avatarUrl ?? undefined,
    categoryIcon: professional.categoryIcon,
    categoryId: professional.categoryId,
    provinceName: professional.provinceName,
    cantonName: professional.cantonName,
    ratingAvg: professional.ratingAvg,
    reviewCount: professional.reviewCount,
    hourlyRate: professional.hourlyRate,
    isVerified: professional.verificationStatus === "verified",
  };
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "servicios",      label: t("tabs.servicios") },
    ...(hasCasos ? [{ id: "casos" as Tab, label: t("tabs.casos") }] : []),
    ...(hasCerts ? [{ id: "certificaciones" as Tab, label: t("tabs.certificaciones") }] : []),
    { id: "resenas",        label: t("tabs.resenas") },
    { id: "sobre",          label: t("tabs.sobre") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

          {/* Preview mode → a clear way back to the panel. Otherwise, back to search. */}
          {previewMode ? (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-[#6b7280] font-medium">{t("previewNote")}</p>
              <Link href="/dashboard/profesional" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-semibold px-4 py-2 transition-colors shrink-0">
                <ArrowLeft className="h-4 w-4" /> {t("backToPanel")}
              </Link>
            </div>
          ) : (
            <Link href="/buscar" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#009FD9] transition-colors mb-6">
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </Link>
          )}

          {/* No unverified-identity notice in the client preview: the ABSENCE of the
              "Verificado" badge already communicates the unverified state. (The invite to
              verify lives in the pro's own panel.) */}

          {/* ── HEADER CARD ── identity on the left, a right-aligned stats strip. Mirrors
              the new /buscar card (circular avatar, solid-blue "Verificado" pill). No
              "destacado" ribbon. */}
          <div className="relative bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-5 sm:p-6 mb-6">
            {/* Save to favorites — pinned to the TOP-RIGHT of the header card, next to the
                rating/identity (same favorites system + self-action block as the /buscar
                cards). A subtle bordered icon so it's discoverable without crowding. */}
            <SaveButton pro={savedPro} isOwn={isOwn} className="absolute right-3 top-3 z-10 rounded-full border border-[#e5e7eb] bg-white !p-2 shadow-sm hover:border-[#009FD9] hover:text-[#009FD9]" />
            <div className="flex flex-col gap-4 pr-10 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <Avatar className="h-20 w-20 sm:h-[88px] sm:w-[88px] shrink-0">
                  <AvatarImage src={professional.avatarUrl ?? undefined} alt={professional.fullName} className="object-cover" />
                  <AvatarFallback className="text-2xl bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(professional.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h1 className="text-2xl font-bold leading-tight text-[#111827]">{professional.businessName?.trim() || proDisplayName(professional.fullName)}</h1>
                    {professional.verificationStatus === "verified" && <Badge variant="verified">{t("identityVerified")}</Badge>}
                  </div>
                  {professional.businessName?.trim() && (
                    <p className="mt-0.5 text-sm font-medium text-[#6b7280]">{proDisplayName(professional.fullName)}</p>
                  )}
                  <p className="mt-1 text-sm text-[#6b7280]">
                    {(professional.professions && professional.professions.length > 0 ? professional.professions : [professional.categoryId])
                      .filter(Boolean)
                      .map((cat) => tCat(cat as Parameters<typeof tCat>[0]))
                      .join(" · ")}
                  </p>
                  {locationText && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-[#6b7280]">
                      <MapPin className="h-4 w-4 shrink-0 text-[#009FD9]" />
                      <span>{locationText}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats strip — rating · años de exp · casos de éxito. */}
              <div className="flex items-center gap-5 self-start shrink-0 sm:self-center sm:border-l sm:border-[#f3f4f6] sm:pl-5">
                <button type="button" onClick={() => setActiveTab("resenas")} className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="h-4 w-4 fill-[#ff9b32] text-[#ff9b32]" />
                    <span className="text-[15px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#9ca3af]">{t("reviewCountLabel", { count: professional.reviewCount })}</p>
                </button>
                {expYears > 0 && (
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Briefcase className="h-4 w-4 text-[#009FD9]" />
                      <span className="text-[15px] font-bold text-[#111827]">{expYears}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#9ca3af]">{t("statYears")}</p>
                  </div>
                )}
                {hasCasos && (
                  <button type="button" onClick={() => setActiveTab("casos")} className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Camera className="h-4 w-4 text-[#009FD9]" />
                      <span className="text-[15px] font-bold text-[#111827]">{casosCount}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#9ca3af]">{t("statCasos")}</p>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">

            {/* ── LEFT STICKY CARD ── */}
            <aside className="w-full shrink-0 lg:order-2 lg:w-80">
              <div className="bg-white rounded-2xl shadow-sm border border-[#e5e7eb] p-5 lg:sticky lg:top-24 flex flex-col gap-4">

                {/* "Desde" price — mirrors the right side of the /buscar card. Identity
                    (avatar/name/verificado/rating/location) now lives in the HEADER card
                    above, so it's not repeated here. */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("from")}</span>
                  {(() => {
                    const label = primaryPricingLabel(professional.pricing, professional.hourlyRate, locale);
                    const slash = label.indexOf("/");
                    const amount = slash >= 0 ? label.slice(0, slash).trim() : label;
                    const unit = slash >= 0 ? label.slice(slash) : "";
                    return (
                      <p className="leading-tight">
                        <span className="text-xl font-bold text-[#009FD9]">{amount}</span>
                        {unit && <span className="text-sm font-medium text-[#9ca3af]"> {unit}</span>}
                      </p>
                    );
                  })()}
                </div>

                {/* Schedule + booking/contact buttons — REUSES the /buscar card's
                    ProfessionalSchedule in a STACKED layout: location tabs + that location's
                    3-day strip, then the mutually-exclusive buttons (bookable → "Ver horario
                    completo" + "Solicitar servicio"; no public schedule → "Contáctanos por
                    WhatsApp" + "Contáctanos por llamada"). It owns its booking modal +
                    self-action handling, so no separate WhatsApp/Llamar/Correo buttons here. */}
                <ProfessionalSchedule
                  stacked
                  professional={professional}
                  activeCategory={activeCategory}
                  categoryName={professional.categoryId ? tCat(professional.categoryId as Parameters<typeof tCat>[0]) : ""}
                  availabilityPublic={professional.availabilityPublic ?? true}
                  contactPreference={professional.contactPreference ?? "ambas"}
                  slots={profileSlots}
                  isOwn={isOwn}
                  placeFallback={placeFallback}
                  placeAddress={placeAddress}
                  businessName={professional.businessName ?? ""}
                />

                {/* Social links — usernames the pro shared; we build the URL. Only
                    the networks filled in show; icons only, open in a new tab.
                    Additive to "casos de éxito". */}
                {(() => {
                  const sl = professional.socialLinks;
                  const items = [
                    { k: "instagram", href: buildSocialUrl("instagram", sl?.instagram), Icon: InstagramIcon },
                    { k: "facebook", href: buildSocialUrl("facebook", sl?.facebook), Icon: FacebookIcon },
                    { k: "tiktok", href: buildSocialUrl("tiktok", sl?.tiktok), Icon: TikTokIcon },
                  ].filter((x) => x.href);
                  if (items.length === 0) return null;
                  return (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      {items.map(({ k, href, Icon }) => (
                        <a
                          key={k}
                          href={href as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={k}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
                        >
                          <Icon className="h-4 w-4" />
                        </a>
                      ))}
                    </div>
                  );
                })()}

                <ClientRegistrationModal
                  open={showRegistration}
                  onClose={() => setShowRegistration(false)}
                  onSuccess={() => { setShowRegistration(false); window.open(waLink, "_blank"); }}
                  professionalName={professional.fullName}
                />

                {/* Own-profile self-action notice (shared across the page's actions). */}
                <SelfActionModal open={!!selfMsg} onClose={() => setSelfMsg(null)} message={selfMsg ?? ""} />

                {/* More options dropdown */}
                <div ref={dropdownRef} className="border-t border-[#f3f4f6] pt-3 relative">
                  <button
                    onClick={() => setDropdownOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#374151] transition-colors mx-auto"
                  >
                    {t("moreOptions")} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute bottom-full left-0 right-0 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-1 z-10 mb-1">
                      <button
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f3f4f6] transition-colors"
                        onClick={() => { navigator.share?.({ title: professional.fullName, url: window.location.href }); setDropdownOpen(false); }}
                      >
                        <Share2 className="h-4 w-4" />
                        {t("shareProfile")}
                      </button>
                      {/* No self-report: a pro can't report their own profile. */}
                      {isOwn ? (
                        <div className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#9ca3af]">
                          <Lock className="h-4 w-4" />
                          {t("thisIsYourProfile")}
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                          onClick={() => { setDropdownOpen(false); setReportOpen(true); }}
                        >
                          <Flag className="h-4 w-4" />
                          {t("reportProfile")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* ── TABBED CONTENT (LEFT on desktop; contact card is the right aside) ── */}
            <div className="flex-1 min-w-0 lg:order-1">
              <div className="bg-white rounded-2xl shadow-sm border border-[#e5e7eb] overflow-hidden">

                {/* Tab bar */}
                <div className="flex border-b border-[#e5e7eb] overflow-x-auto">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="relative shrink-0 px-5 py-4 text-sm font-semibold transition-colors"
                      style={{ color: activeTab === tab.id ? "#009FD9" : "#6b7280" }}
                    >
                      {tab.label}
                      {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#009FD9] rounded-full" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="p-6">

                  {/* ── TAB: Servicios ── */}
                  {activeTab === "servicios" && (() => {
                    // Text-only service cards: ONE card per service CATEGORY (the pro's professions),
                    // with its description, price and request action. Images belong to casos/photos.
                    const profs = (professional.professions && professional.professions.length > 0)
                      ? professional.professions
                      : (professional.categoryId ? [professional.categoryId] : []);
                    const byCat = new Map<string, typeof services>();
                    for (const s of services) {
                      const cat = (s as { category?: string }).category || profs[0] || "otro";
                      const arr = byCat.get(cat) ?? []; arr.push(s); byCat.set(cat, arr);
                    }
                    // Cards = the pro's professions (even with no priced offering yet) + any extra
                    // categories that DO have offerings; de-duplicated, professions first.
                    const cats = [...profs, ...[...byCat.keys()].filter((c) => !profs.includes(c))]
                      .filter((c, i, a) => a.indexOf(c) === i);
                    return (
                      <div>
                        <h2 className="text-lg font-semibold text-[#111827] mb-1">{t("servicesOffered")}</h2>
                        <p className="text-sm text-[#6b7280] mb-5">{t("servicesOfferedSub")}</p>
                        {cats.length === 0 ? (
                          <p className="text-sm text-[#9ca3af] py-4 text-center">{t("noServices")}</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {cats.map((cat) => {
                              const items = byCat.get(cat) ?? [];
                              // ONE clean summary per service: its description + price (the model is
                              // services-only). No icon overlay on the photo; the action is a single
                              // "Solicitar servicio" that enters the existing request flow.
                              const rep = items.find((s) => s.description) ?? items.find((s) => s.price) ?? items[0];
                              const yearsItem = items.find((s) => typeof (s as { years?: number }).years === "number" && ((s as { years?: number }).years ?? 0) > 0);
                              const serviceYears = (yearsItem as { years?: number } | undefined)?.years;
                              const priced = items.find((s) => s.priceAmount || s.price || (s as { priceType?: string }).priceType === "a_convenir");
                              const priceLabel = priced
                                ? formatServicePrice(priced.priceAmount, priced.priceType, locale)
                                  ?? (priced.price ? priced.price.replaceAll("/hora", locale === "en" ? " /hour" : " /hora").replaceAll("Precio a consultar", t("priceConsult")).replaceAll("Consultar precio", t("priceConsult")) : t("priceConsult"))
                                : t("priceConsult");
                              const title = getCategoryLabel(cat, locale);
                              const description = rep?.description?.trim() ?? "";
                              const hasFullDescription = description.length > 150;
                              return (
                                <div key={cat} className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                                  <div className="flex flex-1 flex-col">
                                    <p className="min-h-[44px] text-[16px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:min-h-[22px]">{title}</p>
                                    {description ? (
                                      <div className="mt-2 min-h-[88px]">
                                        <p className="line-clamp-3 text-[14px] leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{description}</p>
                                        {hasFullDescription && (
                                          <button
                                            type="button"
                                            onClick={() => setServiceDescriptionOpen({ title, description })}
                                            className="mt-1.5 text-left text-[13px] font-semibold text-[#009FD9] transition-colors hover:text-[#0089bb]"
                                          >
                                            {t("readFullDescription")}
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="mt-2 min-h-[88px] text-[13px] leading-relaxed text-[#9ca3af]">{t("askForDetails")}</p>
                                    )}
                                    <div className="mt-3 min-h-[46px] space-y-1.5 text-[14px]">
                                      {serviceYears ? (
                                        <p className="flex items-center gap-2 text-[#374151]">
                                          <Briefcase className="h-4 w-4 shrink-0 text-[#009FD9]" />
                                          <span className="font-semibold">{t("yearsExperienceValue", { years: serviceYears })}</span>
                                        </p>
                                      ) : null}
                                      <p className="flex items-center gap-2 text-[#111827]">
                                        <Banknote className="h-4 w-4 shrink-0 text-[#009FD9]" />
                                        <span className="font-bold [overflow-wrap:anywhere]">{priceLabel}</span>
                                      </p>
                                    </div>
                                    <button type="button" onClick={() => requestService(cat)} className="mt-auto pt-4">
                                      <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#009FD9] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]">
                                        {t("serviceRequest")}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* "Disponibilidad" is NOT a content tab — the contact card already
                      shows the schedule (3-day strip + booking/contact), so a separate
                      section here would only duplicate it. */}

                  {/* ── TAB: Casos de éxito (grouped per profession/service) ── */}
                  {activeTab === "casos" && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-semibold text-[#111827] mb-1">{t("tabs.casos")}</h2>
                        <p className="text-sm text-[#6b7280]">{t("casosSubtitle", { name: professional.fullName.split(" ")[0] })}</p>
                      </div>
                      {hasCasos ? (
                        (() => {
                          // NEW per-profession CASE model (sprint 493): each caso has a service title,
                          // recipient, date and up to 3 photos. Reads BOTH shapes — new cases (have
                          // `photos[]`) and legacy photos (`{url}`, grouped by profession into cases).
                          const svcs = professional.services ?? [];
                          const profsOrder = (professional.professions && professional.professions.length > 0)
                            ? professional.professions
                            : (professional.categoryId ? [professional.categoryId] : []);
                          const primaryProf = profsOrder[0] ?? "";
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const profOf = (it: any) => casoProfession(it, svcs, primaryProf);
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const raw: any[] = (professional.portfolioItems && professional.portfolioItems.length > 0)
                            ? professional.portfolioItems
                            : (professional.portfolioUrls ?? []).map((url) => ({ url }));
                          type Caso = { id: string; profession: string; title?: string; description?: string; recipient?: string; date?: string; photos: string[]; likes?: number; likeable?: boolean };
                          const caseList: Caso[] = [];
                          const legacyByProf = new Map<string, string[]>();
                          for (const it of raw) {
                            if (Array.isArray(it?.photos) && it.id) {
                              caseList.push({ id: String(it.id), profession: it.profession ?? primaryProf, title: it.title, description: it.description, recipient: it.recipient, date: it.date, photos: it.photos, likes: Number(it.likes) || 0, likeable: true });
                            } else if (it?.url) {
                              const prof = profOf(it) || primaryProf || "";
                              const arr = legacyByProf.get(prof) ?? []; arr.push(it.url); legacyByProf.set(prof, arr);
                            }
                          }
                          for (const [prof, photos] of legacyByProf) {
                            for (let i = 0; i < photos.length; i += 3) caseList.push({ id: `${prof}_${i}`, profession: prof, photos: photos.slice(i, i + 3) });
                          }
                          // Client-facing showcase: profession filter + a polished case-card grid.
                          return <CaseShowcase professionalId={professional.id} cases={caseList} professions={profsOrder} isOwn={isOwn} />;
                        })()
                      ) : (
                        <p className="text-sm text-[#9ca3af]">{t("noCasos")}</p>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Certificaciones (text only, no images) ── */}
                  {activeTab === "certificaciones" && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#111827] mb-1">{t("tabs.certificaciones")}</h2>
                      <p className="text-sm text-[#9ca3af] mb-4">{t("certsSubtitle")}</p>
                      <div className="flex flex-col gap-5">
                        {certGroups.map(([prof, certs]) => (
                          <div key={prof || "general"}>
                            {certGroups.length > 1 && prof && (
                              <h3 className="text-xs font-bold uppercase tracking-wide text-[#0089bb] mb-2">{getCategoryLabel(prof, locale)}</h3>
                            )}
                            <div className="flex flex-col gap-2.5">
                              {certs.map((c, i) => (
                                <div key={c.id ?? i} className="flex items-start gap-3 rounded-xl border border-[#e5e7eb] p-3.5">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EBF5FB] shrink-0">
                                    <Award className="h-4 w-4 text-[#009FD9]" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#111827] break-words">{c.name}</p>
                                    {(c.institution || c.year) && (
                                      <p className="text-xs text-[#6b7280] mt-0.5 break-words">
                                        {[c.institution, c.year].filter(Boolean).join(" · ")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── TAB: Reseñas ── */}
                  {activeTab === "resenas" && (
                    <div>
                      {/* Real aggregate ONLY when real reviews exist. Zero reviews →
                          honest empty state; never a fabricated score or per-category
                          breakdown (those were hardcoded fakes and were removed). */}
                      {professional.reviewCount > 0 && (
                        <div className="flex items-center gap-3 mb-5">
                          <span className="text-4xl font-extrabold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                          <div className="flex flex-col">
                            <StarRating rating={professional.ratingAvg} size="sm" />
                            <span className="text-xs text-[#9ca3af] mt-0.5">{t("reviewCountLabel", { count: professional.reviewCount })}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2 mb-5">
                        <Shield className="h-4 w-4 text-[#9ca3af] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#6b7280]">
                          {t("reviewsGate")}
                        </p>
                      </div>

                      <ReviewSection
                        professionalId={professional.id}
                        professionalName={professional.fullName}
                        reviewCount={professional.reviewCount}
                        ratingAvg={professional.ratingAvg}
                        reviews={professional.reviews}
                        isAuthenticated={isAuthenticated}
                      />
                    </div>
                  )}

                  {/* ── TAB: Sobre mí ── */}
                  {activeTab === "sobre" && (() => {
                    // Facts in display order — each = brand-tint icon + uppercase label + value
                    // + an optional caption, laid out in a hairline-divided grid (owner mockup).
                    type Fact = { key: string; icon: ReactNode; label: string; value: ReactNode; caption?: ReactNode };
                    const facts: Fact[] = [];
                    const uniqueWorkplaces = Array.from(
                      new Map(
                        (professional.workplaces ?? [])
                          .map((w) => {
                            const name = String(w.name ?? "").trim();
                            const address = String(w.address ?? "").trim();
                            return [`${name.toLowerCase()}|${address.toLowerCase()}`, { ...w, name, address }] as const;
                          })
                          .filter(([, w]) => w.name || w.address)
                      ).values()
                    );
                    const workplaceAreaLines = Array.from(new Set([
                      ...uniqueWorkplaces
                        .map((w) => {
                          const area = w as typeof w & { provinciaId?: string; cantonId?: string };
                          const cantonName = area.cantonId ? getCantonById(area.cantonId)?.name : "";
                          const provinceName = area.provinciaId ? getProvinceById(area.provinciaId)?.name : "";
                          return [cantonName, provinceName].filter(Boolean).join(", ");
                        })
                        .filter(Boolean),
                      locationText,
                    ].filter(Boolean)));
                    if (professional.bio) facts.push({
                      key: "bio",
                      icon: <FileText className="h-5 w-5" />,
                      label: t("description"),
                      value: <span className="block whitespace-pre-line text-[15px] font-normal leading-7 text-[#374151]">{professional.bio}</span>,
                    });
                    const profileCategoryIds = (professional.professions && professional.professions.length > 0)
                      ? professional.professions
                      : (professional.categoryId ? [professional.categoryId] : []);
                    const offersVideoConsult = !!professional.videoconsulta && anyVideoConsultCategory(profileCategoryIds);
                    if (professional.languages && professional.languages.length > 0) facts.push({
                      key: "lang", icon: <Languages className="h-5 w-5" />, label: t("languages"),
                      value: professional.languages.map((l) => languageLabel(l, locale)).join(" · "),
                    });
                    if (professional.insuranceNetworks && professional.insuranceNetworks.length > 0) facts.push({
                      key: "ins", icon: <Shield className="h-5 w-5" />, label: t("insurers"),
                      value: professional.insuranceNetworks.map((id) => insurerLabel(id)).join(" · "),
                    });
                    if (workplaceAreaLines.length > 0 || offersVideoConsult) facts.push({
                      key: "loc", icon: <MapPin className="h-5 w-5" />,
                      label: workplaceAreaLines.length > 1 || offersVideoConsult ? t("whereServes") : t("location"),
                      value: (
                        <span className="flex flex-col gap-1">
                          {workplaceAreaLines.map((line) => (
                            <span key={line} className="[overflow-wrap:anywhere]">{line}</span>
                          ))}
                          {offersVideoConsult && (
                            <span className="[overflow-wrap:anywhere]">{t("videoConsult")}</span>
                          )}
                        </span>
                      ),
                    });
                    return (
                      <div className="flex flex-col gap-5">
                        {facts.length > 0 && (
                          <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                            <div className="divide-y divide-[#eef2f6]">
                              {facts.map((f) => (
                                <div key={f.key} className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
                                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{f.icon}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{f.label}</p>
                                    <div className="mt-1 text-[15px] font-medium text-[#374151] [overflow-wrap:anywhere]">{f.value}</div>
                                    {f.caption && <div className="mt-1 text-xs leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{f.caption}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* "Solicitar servicio" (service cards) — the existing booking flow, registration-gated
          for guests. Carries the card's service as the booking context. */}
      <ClientRegistrationModal
        open={bookingReg}
        onClose={() => setBookingReg(false)}
        onSuccess={() => { setBookingReg(false); setBookingOpen(true); }}
        professionalName={professional.fullName}
      />
      <BookingModal
        professional={professional}
        categoryName={bookingCat ? tCat(bookingCat as Parameters<typeof tCat>[0]) : ""}
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        initialCategoryId={bookingCat}
      />

      {serviceDescriptionOpen && (
        <Modal
          title={serviceDescriptionOpen.title}
          subtitle={t("description")}
          open={!!serviceDescriptionOpen}
          onClose={() => setServiceDescriptionOpen(null)}
          closeLabel={t("close")}
          size="md"
        >
          <p className="whitespace-pre-line text-[15px] leading-7 text-[#374151] [overflow-wrap:anywhere]">
            {serviceDescriptionOpen.description}
          </p>
        </Modal>
      )}

      {reportOpen && (
        <ReportProfileModal
          professionalName={professional.fullName}
          professionalSlug={slug}
          onClose={() => setReportOpen(false)}
        />
      )}

      <LandingFooter />
    </div>
  );
}
