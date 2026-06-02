import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MapPin, CheckCircle2, Clock, Phone, ArrowLeft, Briefcase } from "lucide-react";
import { BookingButton } from "@/components/booking/booking-button";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { MOCK_PROFESSIONALS } from "@/lib/data/mock-professionals";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { ReviewSection } from "@/components/professionals/review-section";
import { createClient } from "@/lib/supabase/server";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}


export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const t = await getTranslations("profile");
  const tCat = await getTranslations("categories");

  const professional = await getProfessionalBySlug(slug);
  if (!professional) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  const waLink = getWhatsAppLink(
    professional.whatsapp,
    `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría consultarte sobre tus servicios.`
  );

  const expYears = professional.yearsExperience ?? 0;
  const experienceLabel =
    expYears === 1
      ? t("experience", { years: expYears })
      : t("experiencePlural", { years: expYears });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/buscar"
            className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#319278] transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>

          {/* Profile header */}
          <Card className="mb-6 overflow-hidden">
            {professional.isFeatured && (
              <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-5 py-2">
                <span className="text-xs font-semibold text-white tracking-wide">⭐ {t("featuredBadge")}</span>
              </div>
            )}
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex flex-col items-center sm:items-start gap-3">
                  <div className="relative">
                    <Avatar className="h-24 w-24 ring-4 ring-offset-2 ring-[#bbe2d5]">
                      <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                      <AvatarFallback className="text-2xl">{getInitials(professional.fullName)}</AvatarFallback>
                    </Avatar>
                    {professional.isAvailable && (
                      <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-400 border-2 border-white" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
                    {professional.isVerified && (
                      <Badge variant="verified" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {t("verified")}
                      </Badge>
                    )}
                    <Badge variant={professional.isAvailable ? "success" : "muted"}>
                      {professional.isAvailable ? t("available") : t("notAvailable")}
                    </Badge>
                  </div>
                </div>

                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-[#111827]">{professional.fullName}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="default" className="text-sm">
                      {professional.categoryIcon} {tCat(professional.categoryId)}
                    </Badge>
                  </div>
                  <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="md" className="mt-3" />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm text-[#6b7280]">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-[#319278]" />
                      <span>{professional.cantonName}, {professional.provinceName}</span>
                    </div>
                    {expYears > 0 && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 shrink-0 text-[#319278]" />
                        <span>{experienceLabel}</span>
                      </div>
                    )}
                    {professional.hourlyRate && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-[#319278]" />
                        <span>₡{professional.hourlyRate.toLocaleString("es-CR")}{t("perHour")}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-5">
                    <BookingButton
                      professional={professional}
                      categoryName={tCat(professional.categoryId)}
                      size="lg"
                      className="flex-1 sm:flex-none"
                    />
                    <Button variant="outline" size="lg" asChild>
                      <a href={`tel:${professional.whatsapp}`}>
                        <Phone className="h-4 w-4" />
                        {t("contact.call")}
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-[#111827] mb-3">{t("about")}</h2>
                  <p className="text-sm text-[#374151] leading-relaxed">{professional.bio}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <ReviewSection
                    professionalId={professional.id}
                    professionalName={professional.fullName}
                    reviewCount={professional.reviewCount}
                    ratingAvg={professional.ratingAvg}
                    reviews={professional.reviews}
                    isAuthenticated={isAuthenticated}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Card className="sticky top-24">
                <CardContent className="p-5">
                  <h3 className="font-semibold text-[#111827] mb-1">{t("contact.title")}</h3>
                  <p className="text-xs text-[#6b7280] mb-4">{t("contact.responseTime")}</p>
                  <BookingButton
                    professional={professional}
                    categoryName={tCat(professional.categoryId)}
                    size="lg"
                    className="w-full"
                  />
                  <div className="border-t border-[#f3f4f6] mt-4 pt-4 flex flex-col gap-2 text-xs text-[#6b7280]">
                    {[t("contact.identityVerified"), t("contact.directPayment"), t("contact.noFees")].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-[#111827] mb-4">{t("reviews")}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: t("stats.reviews"), value: professional.reviewCount },
                      { label: t("stats.rating"), value: `${professional.ratingAvg.toFixed(1)} ★` },
                      { label: t("stats.experience"), value: expYears > 0 ? `${expYears} ${t("yearsUnit")}` : "—" },
                      {
                        label: t("stats.rate"),
                        value: professional.hourlyRate
                          ? `₡${(professional.hourlyRate / 1000).toFixed(0)}k${t("rateUnit")}`
                          : t("priceOnRequest"),
                      },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center p-3 rounded-xl bg-[#f3f4f6]">
                        <div className="font-bold text-[#111827] text-lg">{stat.value}</div>
                        <div className="text-xs text-[#6b7280]">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export async function generateStaticParams() {
  return MOCK_PROFESSIONALS.map((p) => ({ slug: p.slug }));
}
