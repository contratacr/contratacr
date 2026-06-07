"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  MapPin, Shield, ArrowLeft,
  Share2, Flag, ChevronDown, Lock, Phone, Building2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { formatPricingTier } from "@/lib/pricing";
import { languageLabel } from "@/lib/data/languages";
import { ReviewSection } from "@/components/professionals/review-section";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { createClient } from "@/lib/supabase/client";
import { BookingButton } from "@/components/booking/booking-button";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
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
function SubRating({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#6b7280]">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-24 h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
          <div className="h-full rounded-full bg-[#ff9b32]" style={{ width: `${(value / 5) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-[#111827] w-6">{value.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = "servicios" | "disponibilidad" | "resenas" | "sobre";

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProfilePage({ params }: ProfilePageProps) {
  const t = useTranslations("profile");
  const tCat = useTranslations("categories");
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [proNotFound, setProNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("servicios");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [slug, setSlug] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
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
    }
    load();
  }, [params]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
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
          <h1 className="text-2xl font-bold text-[#111827]">Profesional no encontrado</h1>
          <p className="text-[#6b7280] text-sm max-w-sm">
            El perfil que buscás no existe o fue eliminado.
          </p>
          <Link href="/buscar" className="mt-2 inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm">
            Buscar profesionales
          </Link>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const expYears = professional.yearsExperience ?? 0;
  const waLink = getWhatsAppLink(
    professional.whatsapp,
    `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría consultarte sobre tus servicios.`
  );

  const services = professional.services ?? [];
  const visibleServices = showAllServices ? services : services.slice(0, 5);
  const locationText = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "servicios",      label: "Servicios" },
    { id: "disponibilidad", label: "Disponibilidad" },
    { id: "resenas",        label: "Reseñas" },
    { id: "sobre",          label: "Sobre mí" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

          {/* Back link */}
          <Link href="/buscar" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#009FD9] transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>

          {professional.isFeatured && (
            <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-5 py-2 rounded-t-2xl">
              <span className="text-xs font-semibold text-white tracking-wide">{t("featuredBadge")}</span>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-6">

            {/* ── LEFT STICKY CARD ── */}
            <aside className="w-full lg:w-72 shrink-0">
              <div className="bg-white rounded-2xl shadow-sm border border-[#e5e7eb] p-6 lg:sticky lg:top-24 flex flex-col gap-4">

                {/* Avatar + name — photo appears exactly once */}
                <div className="flex flex-col items-center text-center gap-3">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={professional.avatarUrl ?? undefined} alt={professional.fullName} className="object-cover" />
                    <AvatarFallback className="text-2xl bg-[#EBF5FB] text-[#009FD9] font-bold">
                      {getInitials(professional.fullName)}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <h1 className="text-xl font-bold text-[#111827]">{professional.fullName}</h1>
                    {professional.businessName && (
                      <p className="text-sm font-medium text-[#009FD9] mt-0.5">{professional.businessName}</p>
                    )}
                    <div className="flex flex-wrap gap-1 justify-center mt-1">
                      {(professional.professions && professional.professions.length > 0
                        ? professional.professions
                        : [professional.categoryId]
                      ).filter(Boolean).map((cat) => (
                        <Badge key={cat} variant="default" className="text-xs">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {tCat(cat as any)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {professional.isVerified && (
                    <div className="flex items-center gap-1.5 text-xs text-[#009FD9]">
                      <Shield className="h-3.5 w-3.5" />
                      <span className="font-medium">Cédula verificada</span>
                    </div>
                  )}
                </div>

                {/* Rating */}
                <div className="flex flex-col items-center gap-1">
                  <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="md" />
                  <button onClick={() => setActiveTab("resenas")} className="text-xs text-[#009FD9] hover:underline">
                    Ver {professional.reviewCount} reseñas
                  </button>
                </div>

                {/* Location — only show if there's content */}
                {locationText && (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-[#6b7280]">
                    <MapPin className="h-4 w-4 shrink-0 text-[#009FD9]" />
                    <span>{locationText}</span>
                  </div>
                )}

                {/* Portfolio thumbnails */}
                {professional.portfolioUrls && professional.portfolioUrls.length > 0 && (
                  <div className="flex gap-1.5 justify-center flex-wrap">
                    {professional.portfolioUrls.slice(0, 4).map((url, i) => (
                      <img key={i} src={url} alt={`Portfolio ${i + 1}`} className="h-14 w-14 object-cover rounded-xl border border-gray-100" />
                    ))}
                    {professional.portfolioUrls.length > 4 && (
                      <div className="h-14 w-14 rounded-xl bg-[#f3f4f6] border border-gray-100 flex items-center justify-center text-xs font-bold text-[#6b7280]">
                        +{professional.portfolioUrls.length - 4}
                      </div>
                    )}
                  </div>
                )}

                {/* WhatsApp CTA */}
                {isAuthenticated ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Contactar por WhatsApp
                  </a>
                ) : (
                  <button
                    onClick={() => setShowRegistration(true)}
                    className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Contactar por WhatsApp
                  </button>
                )}

                {/* Solicitar servicio CTA — only when schedule is public */}
                {professional.availabilityPublic ? (
                  <BookingButton
                    professional={professional}
                    categoryName={professional.categoryId ? tCat(professional.categoryId as Parameters<typeof tCat>[0]) : ""}
                    variant="outline"
                    size="md"
                    className="w-full"
                  />
                ) : (
                  <a
                    href={`tel:+506${professional.whatsapp.replace(/\D/g, "")}`}
                    className="flex items-center justify-center gap-2 w-full border border-[#009FD9] text-[#009FD9] hover:bg-[#EBF5FB] font-semibold py-3 rounded-xl transition-colors text-sm"
                  >
                    <Phone className="h-4 w-4" />
                    Llamar
                  </a>
                )}

                <ClientRegistrationModal
                  open={showRegistration}
                  onClose={() => setShowRegistration(false)}
                  onSuccess={() => { setShowRegistration(false); window.open(waLink, "_blank"); }}
                  professionalName={professional.fullName}
                />

                {/* More options dropdown */}
                <div ref={dropdownRef} className="border-t border-[#f3f4f6] pt-3 relative">
                  <button
                    onClick={() => setDropdownOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#374151] transition-colors mx-auto"
                  >
                    Más opciones <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute bottom-full left-0 right-0 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-1 z-10 mb-1">
                      <button
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f3f4f6] transition-colors"
                        onClick={() => { navigator.share?.({ title: professional.fullName, url: window.location.href }); setDropdownOpen(false); }}
                      >
                        <Share2 className="h-4 w-4" />
                        Compartir perfil
                      </button>
                      <button
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => { setDropdownOpen(false); setReportOpen(true); }}
                      >
                        <Flag className="h-4 w-4" />
                        Reportar perfil
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* ── RIGHT TABBED CONTENT ── */}
            <div className="flex-1 min-w-0">
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
                      <h2 className="text-lg font-semibold text-[#111827] mb-5">Servicios ofrecidos</h2>
                      {services.length === 0 ? (
                        <p className="text-sm text-[#9ca3af] py-4 text-center">
                          Este profesional no ha agregado servicios específicos todavía.
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
                                      Consultar
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {services.length > 5 && (
                            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAllServices(v => !v)}>
                              {showAllServices ? "Ver menos" : `Ver más (${services.length - 5} más)`}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Disponibilidad ── */}
                  {activeTab === "disponibilidad" && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#111827] mb-5">Disponibilidad</h2>
                      {professional.availabilityPublic ? (
                        <div className="flex flex-col items-center text-center gap-4 py-6">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF5FB]">
                            <MapPin className="h-6 w-6 text-[#009FD9]" />
                          </div>
                          <p className="text-sm text-[#374151] max-w-sm">
                            Este profesional tiene horarios disponibles. Usá <strong>Solicitar servicio</strong> para
                            elegir una fecha y hora y reservar directamente.
                          </p>
                          <BookingButton
                            professional={professional}
                            categoryName={professional.categoryId ? tCat(professional.categoryId as Parameters<typeof tCat>[0]) : ""}
                            size="md"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center gap-4 py-6">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f7fa]">
                            <Lock className="h-6 w-6 text-[#6b7280]" />
                          </div>
                          <p className="text-sm font-medium text-[#374151] max-w-sm">
                            La disponibilidad de este profesional no es pública.
                          </p>
                          <p className="text-xs text-[#9ca3af] max-w-sm -mt-2">
                            Contactalo directamente y conocé sus horarios.
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
                            <a
                              href={`tel:+506${professional.whatsapp.replace(/\D/g, "")}`}
                              className="flex-1 flex items-center justify-center gap-2 border border-[#009FD9] text-[#009FD9] hover:bg-[#EBF5FB] font-semibold py-2.5 rounded-xl transition-colors text-sm"
                            >
                              <Phone className="h-4 w-4" />
                              Llamar
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Reseñas ── */}
                  {activeTab === "resenas" && (
                    <div>
                      <div className="flex items-center gap-4 mb-5">
                        <div className="flex flex-col items-center">
                          <span className="text-4xl font-extrabold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                          <StarRating rating={professional.ratingAvg} size="sm" className="mt-1" />
                          <span className="text-xs text-[#9ca3af] mt-1">{professional.reviewCount} reseñas</span>
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                          <SubRating label="Precio" value={4.8} />
                          <SubRating label="Puntualidad" value={4.9} />
                          <SubRating label="Calidad" value={5.0} />
                          <SubRating label="Comunicación" value={4.7} />
                        </div>
                      </div>

                      <div className="flex items-start gap-2 bg-[#EBF5FB] border border-[#bfdbfe] rounded-xl px-4 py-3 mb-5">
                        <Shield className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#0089bb] font-medium">
                          Sello de veracidad — solo clientes que usaron el servicio pueden dejar reseñas.
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
                      {professional.bio && (
                        <div>
                          <h2 className="text-lg font-semibold text-[#111827] mb-3">Descripción</h2>
                          <p className="text-sm text-[#374151] leading-relaxed">{professional.bio}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {expYears > 0 && (
                          <div className="bg-[#f3f4f6] rounded-xl p-4">
                            <p className="text-xs text-[#9ca3af] font-medium mb-1">Experiencia</p>
                            <p className="text-base font-bold text-[#111827]">{expYears} {expYears === 1 ? "año" : "años"}</p>
                          </div>
                        )}
                        {professional.isVerified && (
                          <div className="bg-[#EBF5FB] rounded-xl p-4 flex items-center gap-3">
                            <Shield className="h-5 w-5 text-[#009FD9] shrink-0" />
                            <div>
                              <p className="text-xs text-[#6b7280] font-medium">Cédula</p>
                              <p className="text-sm font-bold text-[#009FD9]">Verificada</p>
                            </div>
                          </div>
                        )}
                        {locationText && (
                          <div className="bg-[#f3f4f6] rounded-xl p-4 flex items-center gap-3">
                            <MapPin className="h-5 w-5 text-[#6b7280] shrink-0" />
                            <div>
                              <p className="text-xs text-[#9ca3af] font-medium">Ubicación</p>
                              <p className="text-sm font-bold text-[#111827]">{locationText}</p>
                            </div>
                          </div>
                        )}
                        {professional.pricing && professional.pricing.length > 0 ? (
                          <div className="bg-[#f3f4f6] rounded-xl p-4 sm:col-span-2">
                            <p className="text-xs text-[#9ca3af] font-medium mb-2">Precios</p>
                            <div className="flex flex-col gap-1">
                              {professional.pricing.map((tier) => (
                                <p key={tier.id} className="text-sm font-semibold text-[#111827]">{formatPricingTier(tier)}</p>
                              ))}
                            </div>
                          </div>
                        ) : professional.hourlyRate ? (
                          <div className="bg-[#f3f4f6] rounded-xl p-4">
                            <p className="text-xs text-[#9ca3af] font-medium mb-1">Tarifa base</p>
                            <p className="text-base font-bold text-[#111827]">₡{professional.hourlyRate.toLocaleString("es-CR")}/hora</p>
                          </div>
                        ) : null}
                      </div>

                      {professional.affiliations && professional.affiliations.length > 0 && (
                        <div>
                          <h2 className="text-lg font-semibold text-[#111827] mb-3">Instituciones y lugares de trabajo</h2>
                          <div className="flex flex-wrap gap-2">
                            {professional.affiliations.map((a) => (
                              <span key={a} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium px-3 py-1.5">
                                <Building2 className="h-3.5 w-3.5" />
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {professional.languages && professional.languages.length > 0 && (
                        <div>
                          <h2 className="text-lg font-semibold text-[#111827] mb-3">Idiomas</h2>
                          <div className="flex flex-wrap gap-2">
                            {professional.languages.map((l) => (
                              <span key={l} className="inline-flex items-center rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium px-3 py-1.5">
                                {languageLabel(l)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
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
