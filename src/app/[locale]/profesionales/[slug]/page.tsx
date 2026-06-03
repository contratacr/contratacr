"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  MapPin, Shield, MessageCircle, ArrowLeft,
  Share2, Flag, ChevronDown,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { MOCK_PROFESSIONALS } from "@/lib/data/mock-professionals";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { ReviewSection } from "@/components/professionals/review-section";
import { createClient } from "@/lib/supabase/client";
import type { ProfessionalDetail } from "@/lib/queries/professionals";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

// ─── Mock availability data ───────────────────────────────────────────────
const MOCK_AVAILABILITY: Record<string, string[]> = {
  "Lunes":     ["8:00 AM", "10:00 AM", "2:00 PM"],
  "Martes":    [],
  "Miércoles": ["9:00 AM", "11:00 AM", "4:00 PM"],
  "Jueves":    [],
  "Viernes":   ["8:00 AM", "1:00 PM", "3:00 PM"],
  "Sábado":    [],
  "Domingo":   [],
};

// ─── Mock services by category ───────────────────────────────────────────
function getMockServices(categoryId: string): Array<{ name: string; price?: string }> {
  const map: Record<string, Array<{ name: string; price?: string }>> = {
    electricidad: [
      { name: "Instalación eléctrica residencial", price: "₡15,000/hora" },
      { name: "Tableros y breakers", price: "₡25,000+" },
      { name: "Iluminación LED", price: "₡8,000/punto" },
      { name: "Revisión de sistema eléctrico" },
      { name: "Cableado estructurado" },
    ],
    plomeria: [
      { name: "Reparación de tuberías", price: "₡12,000/hora" },
      { name: "Instalación de grifería", price: "₡15,000+" },
      { name: "Detección de fugas" },
      { name: "Tanques y cisternas" },
      { name: "Sistema de calentadores" },
    ],
  };
  const fallback = [
    { name: "Consulta inicial gratuita" },
    { name: "Servicio estándar", price: "₡10,000/hora" },
    { name: "Servicio urgente (+50%)", price: "₡15,000/hora" },
    { name: "Presupuesto personalizado" },
    { name: "Mantenimiento preventivo" },
  ];
  return map[categoryId] ?? fallback;
}

// ─── Tab types ────────────────────────────────────────────────────────────
type Tab = "disponibilidad" | "servicios" | "resenas" | "sobre";

// ─── Sub-rating row ───────────────────────────────────────────────────────
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

// ─── Main page ────────────────────────────────────────────────────────────
export default function ProfilePage({ params }: ProfilePageProps) {
  const t = useTranslations("profile");
  const tCat = useTranslations("categories");
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("servicios");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);

  useEffect(() => {
    async function load() {
      const { slug } = await params;
      const pro = await getProfessionalBySlug(slug);
      if (!pro) {
        notFound();
        return;
      }
      setProfessional(pro);
      setLoading(false);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    }
    load();
  }, [params]);

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

  if (!professional) return null;

  const expYears = professional.yearsExperience ?? 0;
  const waLink = getWhatsAppLink(
    professional.whatsapp,
    `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría consultarte sobre tus servicios.`
  );

  const services = getMockServices(professional.categoryId);
  const visibleServices = showAllServices ? services : services.slice(0, 4);

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "disponibilidad", label: "Disponibilidad" },
    { id: "servicios",       label: "Servicios" },
    { id: "resenas",         label: "Reseñas" },
    { id: "sobre",           label: "Sobre mí" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

          {/* Back link */}
          <Link
            href="/buscar"
            className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#009FD9] transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>

          {/* Featured banner */}
          {professional.isFeatured && (
            <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-5 py-2 rounded-t-2xl">
              <span className="text-xs font-semibold text-white tracking-wide">{t("featuredBadge")}</span>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-6">

            {/* ── LEFT STICKY CARD ── */}
            <aside className="w-full lg:w-72 shrink-0">
              <div className="bg-white rounded-2xl shadow-sm border border-[#e5e7eb] p-6 lg:sticky lg:top-24 flex flex-col gap-4">

                {/* Avatar + name */}
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="relative">
                    <Avatar className="h-20 w-20 ring-4 ring-offset-2 ring-[#bfdbfe]">
                      <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                      <AvatarFallback className="text-2xl">{getInitials(professional.fullName)}</AvatarFallback>
                    </Avatar>
                    {professional.isAvailable && (
                      <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-400 border-2 border-white" />
                    )}
                  </div>

                  <div>
                    <h1 className="text-xl font-bold text-[#111827]">{professional.fullName}</h1>
                    <Badge variant="default" className="mt-1 text-xs">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {tCat(professional.categoryId as any)}
                    </Badge>
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
                  <button
                    onClick={() => setActiveTab("resenas")}
                    className="text-xs text-[#009FD9] hover:underline"
                  >
                    Ver {professional.reviewCount} reseñas
                  </button>
                </div>

                {/* Location */}
                <div className="flex items-center justify-center gap-1.5 text-sm text-[#6b7280]">
                  <MapPin className="h-4 w-4 shrink-0 text-[#009FD9]" />
                  <span>{professional.cantonName}, {professional.provinceName}</span>
                </div>

                {/* Portfolio thumbnails */}
                {professional.portfolioUrls && professional.portfolioUrls.length > 0 && (
                  <div className="flex gap-1.5 justify-center flex-wrap">
                    {professional.portfolioUrls.slice(0, 4).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Portfolio ${i + 1}`}
                        className="h-14 w-14 object-cover rounded-xl border border-gray-100"
                      />
                    ))}
                    {professional.portfolioUrls.length > 4 && (
                      <div className="h-14 w-14 rounded-xl bg-[#f3f4f6] border border-gray-100 flex items-center justify-center text-xs font-bold text-[#6b7280]">
                        +{professional.portfolioUrls.length - 4}
                      </div>
                    )}
                  </div>
                )}

                {/* WhatsApp CTA */}
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  <MessageCircle className="h-4 w-4" />
                  Contactar por WhatsApp
                </a>

                {/* Separator + dropdown */}
                <div className="border-t border-[#f3f4f6] pt-3 relative">
                  <button
                    onClick={() => setDropdownOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#374151] transition-colors mx-auto"
                  >
                    Más opciones <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute bottom-full left-0 right-0 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-1 z-10">
                      <button
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f3f4f6] transition-colors"
                        onClick={() => { navigator.share?.({ title: professional.fullName, url: window.location.href }); setDropdownOpen(false); }}
                      >
                        <Share2 className="h-4 w-4" />
                        Compartir perfil
                      </button>
                      <button
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => setDropdownOpen(false)}
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

                  {/* ── TAB: Disponibilidad ── */}
                  {activeTab === "disponibilidad" && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#111827] mb-5">Horario semanal</h2>
                      <div className="flex flex-col gap-3">
                        {Object.entries(MOCK_AVAILABILITY).map(([day, slots]) => (
                          <div key={day} className="flex items-start gap-4">
                            <span className="text-sm font-medium text-[#374151] w-24 shrink-0 pt-1">{day}</span>
                            {slots.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {slots.map(slot => (
                                  <span
                                    key={slot}
                                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#EBF5FB] text-[#009FD9]"
                                  >
                                    {slot}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-[#9ca3af] pt-1">No disponible</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" className="mt-6">
                        Ver horario completo
                      </Button>
                    </div>
                  )}

                  {/* ── TAB: Servicios ── */}
                  {activeTab === "servicios" && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#111827] mb-5">Servicios ofrecidos</h2>
                      <div className="flex flex-col divide-y divide-[#f3f4f6]">
                        {visibleServices.map((svc) => (
                          <div key={svc.name} className="flex items-center justify-between py-3">
                            <span className="text-sm text-[#374151] font-medium">{svc.name}</span>
                            {svc.price ? (
                              <span className="text-sm font-semibold text-[#111827]">{svc.price}</span>
                            ) : (
                              <button className="text-xs font-semibold text-[#009FD9] hover:underline">
                                Consultar precio
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {services.length > 4 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => setShowAllServices(v => !v)}
                        >
                          {showAllServices ? "Ver menos" : `Ver más (${services.length - 4} más)`}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Reseñas ── */}
                  {activeTab === "resenas" && (
                    <div>
                      {/* Overall rating */}
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

                      {/* Sello de veracidad */}
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
                      <div>
                        <h2 className="text-lg font-semibold text-[#111827] mb-3">Descripción</h2>
                        <p className="text-sm text-[#374151] leading-relaxed">{professional.bio}</p>
                      </div>

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
                              <p className="text-sm font-bold text-[#009FD9]">Verificada por Registro Civil</p>
                            </div>
                          </div>
                        )}
                        <div className="bg-[#f3f4f6] rounded-xl p-4 flex items-center gap-3">
                          <MapPin className="h-5 w-5 text-[#6b7280] shrink-0" />
                          <div>
                            <p className="text-xs text-[#9ca3af] font-medium">Ubicación</p>
                            <p className="text-sm font-bold text-[#111827]">{professional.cantonName}, {professional.provinceName}</p>
                          </div>
                        </div>
                        {professional.hourlyRate && (
                          <div className="bg-[#f3f4f6] rounded-xl p-4">
                            <p className="text-xs text-[#9ca3af] font-medium mb-1">Tarifa base</p>
                            <p className="text-base font-bold text-[#111827]">₡{professional.hourlyRate.toLocaleString("es-CR")}/hora</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

export async function generateStaticParams() {
  return MOCK_PROFESSIONALS.map((p) => ({ slug: p.slug }));
}
