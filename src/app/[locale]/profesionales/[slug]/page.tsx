"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  MapPin, Shield, ArrowLeft, Star, Briefcase, Camera,
  Share2, Flag, ChevronDown, Lock, Phone, Building2, Award, Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InstagramIcon, FacebookIcon, TikTokIcon } from "@/components/icons/social-icons";
import { buildSocialUrl } from "@/lib/social";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { serviceLabelMap } from "@/lib/services";
import { formatPricingTier, primaryPricingLabel } from "@/lib/pricing";
import { languageLabel } from "@/lib/data/languages";
import { insurerLabel } from "@/lib/data/insurers";
import { ReviewSection } from "@/components/professionals/review-section";
import { ProfileGallery } from "@/components/professionals/profile-gallery";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { createClient } from "@/lib/supabase/client";
import { BookingButton } from "@/components/booking/booking-button";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { SelfActionModal, SELF_MSG } from "@/components/professionals/self-action-modal";
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
type Tab = "servicios" | "disponibilidad" | "casos" | "certificaciones" | "resenas" | "sobre";

function initialTabFromUrl(): Tab {
  if (typeof window === "undefined") return "servicios";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return (["servicios", "disponibilidad", "casos", "certificaciones", "resenas", "sobre"] as const).includes(tab as Tab)
    ? (tab as Tab)
    : "servicios";
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProfilePage({ params }: ProfilePageProps) {
  const t = useTranslations("profile");
  const tCat = useTranslations("categories");
  const locale = useLocale();
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [proNotFound, setProNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("servicios");
  // Deep-link support: /profesionales/[slug]?tab=casos opens that tab.
  useEffect(() => { setActiveTab(initialTabFromUrl()); }, []);
  // Preview mode (?preview=1): a pro opened "Ver cómo me ven los clientes" from
  // their panel → show a clear "Volver a mi panel" bar so they never get stuck.
  const [previewMode, setPreviewMode] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") setPreviewMode(new URLSearchParams(window.location.search).get("preview") === "1");
  }, []);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [slug, setSlug] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  // Own-profile self-actions are blocked with a friendly modal (buttons stay visible).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);
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
    }
    load();
  }, [params]);

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
          <div className="h-16 w-16 rounded-full bg-[#EBF5FB] flex items-center justify-center">
            <span className="text-3xl">🔍</span>
          </div>
          <h1 className="text-2xl font-bold text-[#111827]">{t("notFoundTitle")}</h1>
          <p className="text-[#6b7280] text-sm max-w-sm">
            {t("notFoundDesc")}
          </p>
          <Link href="/buscar" className="mt-2 inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm">
            {t("searchProfessionals")}
          </Link>
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

  const services = professional.services ?? [];
  const visibleServices = showAllServices ? services : services.slice(0, 5);
  const locationText = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");

  const hasCasos = !!professional.portfolioUrls && professional.portfolioUrls.length > 0;
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
  // Calls use the SEPARATE call number when set, else the WhatsApp number.
  const callDigits = (professional.callPhone || professional.whatsapp || "").replace(/\D/g, "");
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "servicios",      label: t("tabs.servicios") },
    { id: "disponibilidad", label: t("tabs.disponibilidad") },
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

          {/* ── HEADER CARD ── identity on the left, a right-aligned stats strip. Mirrors
              the new /buscar card (circular avatar, solid-blue "Verificado" pill). No
              "destacado" ribbon. */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-5 sm:p-6 mb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <Avatar className="h-20 w-20 sm:h-[88px] sm:w-[88px] shrink-0">
                  <AvatarImage src={professional.avatarUrl ?? undefined} alt={professional.fullName} className="object-cover" />
                  <AvatarFallback className="text-2xl bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(professional.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h1 className="text-2xl font-bold leading-tight text-[#111827]">{professional.businessName?.trim() || professional.fullName}</h1>
                    {professional.verificationStatus === "verified" && <Badge variant="verified">{t("identityVerified")}</Badge>}
                  </div>
                  {professional.businessName?.trim() && (
                    <p className="mt-0.5 text-sm font-medium text-[#6b7280]">{professional.fullName}</p>
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
                      <span className="text-[15px] font-bold text-[#111827]">{professional.portfolioUrls?.length ?? 0}</span>
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
                    const label = primaryPricingLabel(professional.pricing, professional.hourlyRate);
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

                {/* Ver horario completo — the primary CTA (filled blue); opens the booking
                    modal (the full schedule lives inside it). Only when the schedule is public. */}
                {professional.availabilityPublic && (
                  <BookingButton
                    professional={professional}
                    categoryName={professional.categoryId ? tCat(professional.categoryId as Parameters<typeof tCat>[0]) : ""}
                    label={t("viewFullSchedule")}
                    size="md"
                    className="w-full"
                  />
                )}

                {/* The pro's OWN profile shows the SAME buttons a client sees; the
                    action is blocked with a friendly modal (handled per button). */}
                {/* WhatsApp CTA */}
                {isOwn ? (
                  <button
                    onClick={() => setSelfMsg(SELF_MSG.whatsapp)}
                    className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {t("contact.whatsapp")}
                  </button>
                ) : isAuthenticated ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {t("contact.whatsapp")}
                  </a>
                ) : (
                  <button
                    onClick={() => setShowRegistration(true)}
                    className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {t("contact.whatsapp")}
                  </button>
                )}

                {/* Llamar — driven by "Permitir contacto por llamada", independent of
                    the privada toggle: shows in BOTH public and private modes. */}
                {professional.allowPhoneCall && callDigits && (
                  isOwn ? (
                    <button
                      onClick={() => setSelfMsg(SELF_MSG.call)}
                      className="flex items-center justify-center gap-2 w-full border border-[#009FD9] text-[#009FD9] hover:bg-[#EBF5FB] font-semibold py-3 rounded-xl transition-colors text-sm"
                    >
                      <Phone className="h-4 w-4" />
                      {t("contact.call")}
                    </button>
                  ) : (
                    <a
                      href={`tel:+506${callDigits}`}
                      className="flex items-center justify-center gap-2 w-full border border-[#009FD9] text-[#009FD9] hover:bg-[#EBF5FB] font-semibold py-3 rounded-xl transition-colors text-sm"
                    >
                      <Phone className="h-4 w-4" />
                      {t("contact.call")}
                    </a>
                  )
                )}

                {/* Correo — only when the pro opted in to show a contact email. */}
                {professional.contactEmail && (
                  isOwn ? (
                    <button
                      onClick={() => setSelfMsg(SELF_MSG.email)}
                      className="flex items-center justify-center gap-2 w-full border border-[#009FD9] text-[#009FD9] hover:bg-[#EBF5FB] font-semibold py-3 rounded-xl transition-colors text-sm"
                    >
                      <Mail className="h-4 w-4" />
                      {t("email")}
                    </button>
                  ) : (
                    <a
                      href={`mailto:${professional.contactEmail}`}
                      className="flex items-center justify-center gap-2 w-full border border-[#009FD9] text-[#009FD9] hover:bg-[#EBF5FB] font-semibold py-3 rounded-xl transition-colors text-sm"
                    >
                      <Mail className="h-4 w-4" />
                      {t("email")}
                    </a>
                  )
                )}

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
                  {activeTab === "servicios" && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#111827] mb-5">{t("servicesOffered")}</h2>
                      {services.length === 0 ? (
                        <p className="text-sm text-[#9ca3af] py-4 text-center">
                          {t("noServices")}
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-col divide-y divide-[#f3f4f6]">
                            {visibleServices.map((svc) => (
                              <div key={svc.id} className="py-3.5">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[#111827]">{svc.name}</p>
                                    {svc.description && (
                                      <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{svc.description}</p>
                                    )}
                                  </div>
                                  {svc.price ? (
                                    <span className="text-sm font-semibold text-[#009FD9] whitespace-nowrap shrink-0">{svc.price}</span>
                                  ) : (
                                    <button className="text-xs font-semibold text-[#009FD9] hover:underline shrink-0">
                                      {t("consult")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {services.length > 5 && (
                            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAllServices(v => !v)}>
                              {showAllServices ? t("viewLess") : t("viewMore", { count: services.length - 5 })}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Disponibilidad ── */}
                  {activeTab === "disponibilidad" && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#111827] mb-5">{t("tabs.disponibilidad")}</h2>
                      {professional.availabilityPublic ? (
                        <div className="flex flex-col items-center text-center gap-4 py-6">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF5FB]">
                            <MapPin className="h-6 w-6 text-[#009FD9]" />
                          </div>
                          <p className="text-sm text-[#374151] max-w-sm">
                            {t.rich("availPublicNote", { b: (c) => <strong>{c}</strong> })}
                          </p>
                          <BookingButton
                            professional={professional}
                            categoryName={professional.categoryId ? tCat(professional.categoryId as Parameters<typeof tCat>[0]) : ""}
                            size="md"
                          />
                          {/* No "Llamar" here — it already lives in the contact card
                              (sidebar); repeating it in this tab is redundant. */}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center gap-4 py-6">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fa]">
                            <Lock className="h-6 w-6 text-[#6b7280]" />
                          </div>
                          <p className="text-sm font-medium text-[#374151] max-w-sm">
                            {t("availPrivateTitle")}
                          </p>
                          <p className="text-xs text-[#9ca3af] max-w-sm -mt-2">
                            {t("availPrivateDesc")}
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-xs">
                            {isAuthenticated ? (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                              >
                                <WhatsAppIcon className="h-4 w-4" />
                                WhatsApp
                              </a>
                            ) : (
                              <button
                                onClick={() => setShowRegistration(true)}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                              >
                                <WhatsAppIcon className="h-4 w-4" />
                                WhatsApp
                              </button>
                            )}
                            {/* No "Llamar" here — the contact card (sidebar) already
                                offers it; repeating it in this tab is redundant. */}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Casos de éxito (grouped per profession/service) ── */}
                  {activeTab === "casos" && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-semibold text-[#111827] mb-1">{t("tabs.casos")}</h2>
                        <p className="text-sm text-[#6b7280]">{t("casosSubtitle", { name: professional.fullName.split(" ")[0] })}</p>
                      </div>
                      {hasCasos ? (
                        (() => {
                          const items = professional.portfolioItems && professional.portfolioItems.length > 0
                            ? professional.portfolioItems
                            : professional.portfolioUrls!.map((url) => ({ url, serviceId: undefined as string | undefined, profession: undefined as string | undefined }));
                          // Group by SERVICE INSTANCE (id) so repeated service names
                          // (e.g. several "Otro servicio") never share photos.
                          const svcs = professional.services ?? [];
                          const labels = serviceLabelMap(svcs);
                          const svcIds = new Set(svcs.map((s) => s.id));
                          const tagged = svcs.filter((s) => items.some((it) => it.serviceId === s.id));
                          const other = items.filter((it) => !it.serviceId || !svcIds.has(it.serviceId));
                          // No service tags at all → single gallery (back-compat).
                          if (tagged.length === 0) return <ProfileGallery urls={items.map((it) => it.url)} />;
                          return (
                            <>
                              {tagged.map((s) => (
                                <div key={s.id}>
                                  <h3 className="text-sm font-semibold text-[#111827] mb-2">{labels.get(s.id) ?? s.name}</h3>
                                  <ProfileGallery urls={items.filter((it) => it.serviceId === s.id).map((it) => it.url)} />
                                </div>
                              ))}
                              {other.length > 0 && (
                                <div>
                                  <h3 className="text-sm font-semibold text-[#111827] mb-2">{t("otherWorks")}</h3>
                                  <ProfileGallery urls={other.map((it) => it.url)} />
                                </div>
                              )}
                            </>
                          );
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
                  {activeTab === "sobre" && (
                    <div className="flex flex-col gap-5">
                      {/* Lead: the bio reads as the intro paragraph. */}
                      {professional.bio && (
                        <p className="text-[15px] text-[#374151] leading-relaxed whitespace-pre-line">{professional.bio}</p>
                      )}

                      {/* Facts grid: each is a small uppercase muted LABEL with the
                          value left-aligned beneath it — uniform, left-reading, no
                          per-row dividers or boxes (only one hairline separating the
                          bio). Long/multi-value facts (lugares, precios) span the full
                          width so they never crowd against the right edge. */}
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 border-t border-[#f3f4f6] pt-5">
                        {/* Verificación row only for verified pros — unverified show
                            nothing (no negative label). */}
                        {professional.verificationStatus === "verified" && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("verification")}</dt>
                            <dd>
                              <span className="inline-flex items-center text-sm font-semibold text-[#15803d]">
                                {t("identityVerified")}
                              </span>
                            </dd>
                          </div>
                        )}

                        {expYears > 0 && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("experienceLabel")}</dt>
                            <dd className="text-sm font-medium text-[#111827]">{t("yearsValue", { years: expYears })}</dd>
                          </div>
                        )}

                        {locationText && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("location")}</dt>
                            <dd className="text-sm font-medium text-[#111827]">{locationText}</dd>
                          </div>
                        )}

                        {professional.languages && professional.languages.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("languages")}</dt>
                            <dd className="text-sm font-medium text-[#111827]">
                              {professional.languages.map((l) => languageLabel(l, locale)).join(" · ")}
                            </dd>
                          </div>
                        )}

                        {professional.insuranceNetworks && professional.insuranceNetworks.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("insurers")}</dt>
                            <dd className="text-sm font-medium text-[#111827]">
                              {professional.insuranceNetworks.map((id) => insurerLabel(id)).join(" · ")}
                            </dd>
                          </div>
                        )}

                        {professional.pricing && professional.pricing.length > 0 ? (
                          <div className="flex flex-col gap-1 sm:col-span-2">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("prices")}</dt>
                            <dd className="flex flex-col gap-0.5">
                              {professional.pricing.map((tier) => (
                                <span key={tier.id} className="text-sm font-medium text-[#111827]">{formatPricingTier(tier)}</span>
                              ))}
                            </dd>
                          </div>
                        ) : professional.hourlyRate ? (
                          <div className="flex flex-col gap-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("baseRate")}</dt>
                            <dd className="text-sm font-medium text-[#111827]">₡{professional.hourlyRate.toLocaleString(locale === "en" ? "en-US" : "es-CR")}{t("perHour")}</dd>
                          </div>
                        ) : null}

                        {professional.workplaces && professional.workplaces.length > 0 && (
                          <div className="flex flex-col gap-1 sm:col-span-2">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("workplaces")}</dt>
                            <dd className="flex flex-col gap-1.5">
                              {professional.workplaces.map((w, i) => (
                                <span key={w.id ?? i} className="text-sm">
                                  <span className="font-medium text-[#111827]">{w.name}</span>
                                  {w.address && w.address !== w.name && (
                                    <span className="block text-xs text-[#9ca3af]">{w.address}</span>
                                  )}
                                </span>
                              ))}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

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
