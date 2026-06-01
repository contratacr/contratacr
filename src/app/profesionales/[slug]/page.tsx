import { notFound } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  CheckCircle2,
  MessageCircle,
  Star,
  Clock,
  Phone,
  ArrowLeft,
  CalendarDays,
  Briefcase,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { MOCK_PROFESSIONALS } from "@/lib/data/mock-professionals";
import { getInitials, getWhatsAppLink } from "@/lib/utils";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

const MOCK_REVIEWS = [
  {
    id: "r1",
    client_name: "Laura Fernández",
    rating: 5,
    comment:
      "Excelente trabajo. Muy puntual, limpio y profesional. El precio fue justo y el resultado quedó perfecto. Totalmente recomendado.",
    date: "hace 2 días",
    avatar: "https://randomuser.me/api/portraits/women/12.jpg",
  },
  {
    id: "r2",
    client_name: "José Arias",
    rating: 5,
    comment:
      "Muy buen profesional. Resolvió el problema rápidamente y explicó todo el proceso. Lo volvería a contratar sin duda.",
    date: "hace 1 semana",
    avatar: "https://randomuser.me/api/portraits/men/23.jpg",
  },
  {
    id: "r3",
    client_name: "Patricia Solís",
    rating: 4,
    comment:
      "Buen servicio en general. Llegó un poco tarde pero el trabajo quedó bien hecho. Precio razonable.",
    date: "hace 2 semanas",
    avatar: "https://randomuser.me/api/portraits/women/34.jpg",
  },
];

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const professional = MOCK_PROFESSIONALS.find((p) => p.slug === slug);

  if (!professional) notFound();

  const waLink = getWhatsAppLink(
    professional.whatsapp,
    `Hola ${professional.full_name.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría consultarte sobre tus servicios.`
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Back */}
          <Link
            href="/buscar"
            className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#319278] transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a resultados
          </Link>

          {/* Profile header */}
          <Card className="mb-6 overflow-hidden">
            {professional.is_featured && (
              <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-5 py-2">
                <span className="text-xs font-semibold text-white tracking-wide">⭐ PERFIL DESTACADO</span>
              </div>
            )}

            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Avatar + badges */}
                <div className="flex flex-col items-center sm:items-start gap-3">
                  <div className="relative">
                    <Avatar className="h-24 w-24 ring-4 ring-offset-2 ring-[#bbe2d5]">
                      <AvatarImage src={professional.avatar_url} alt={professional.full_name} />
                      <AvatarFallback className="text-2xl">
                        {getInitials(professional.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {professional.is_available && (
                      <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-400 border-2 border-white" />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
                    {professional.is_verified && (
                      <Badge variant="verified" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verificado
                      </Badge>
                    )}
                    {professional.is_available ? (
                      <Badge variant="success">Disponible</Badge>
                    ) : (
                      <Badge variant="muted">No disponible</Badge>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-[#111827]">{professional.full_name}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="default" className="text-sm">
                      {professional.category_icon} {professional.category_name}
                    </Badge>
                  </div>

                  <StarRating
                    rating={professional.rating_avg}
                    showValue
                    reviewCount={professional.review_count}
                    size="md"
                    className="mt-3"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm text-[#6b7280]">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-[#319278]" />
                      <span>{professional.canton_name}, {professional.provincia_name}</span>
                    </div>
                    {professional.years_experience && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 shrink-0 text-[#319278]" />
                        <span>{professional.years_experience} años de experiencia</span>
                      </div>
                    )}
                    {professional.hourly_rate && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-[#319278]" />
                        <span>₡{professional.hourly_rate.toLocaleString("es-CR")}/hora</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-5">
                    <Button variant="whatsapp" size="lg" className="flex-1 sm:flex-none" asChild>
                      <a href={waLink} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-5 w-5" />
                        Contactar por WhatsApp
                      </a>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                      <a href={`tel:${professional.whatsapp}`}>
                        <Phone className="h-4 w-4" />
                        Llamar
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* About */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-[#111827] mb-3">Sobre mí</h2>
                  <p className="text-sm text-[#374151] leading-relaxed">{professional.bio}</p>
                </CardContent>
              </Card>

              {/* Reviews */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-[#111827]">
                      Reseñas ({professional.review_count})
                    </h2>
                    <div className="flex items-center gap-1">
                      <Star className="h-5 w-5 text-[#ff9b32] fill-[#ff9b32]" />
                      <span className="font-bold text-[#111827]">
                        {professional.rating_avg.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    {MOCK_REVIEWS.map((review) => (
                      <div key={review.id} className="flex gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={review.avatar} />
                          <AvatarFallback>{getInitials(review.client_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-[#111827]">
                              {review.client_name}
                            </span>
                            <span className="text-xs text-[#9ca3af]">{review.date}</span>
                          </div>
                          <StarRating rating={review.rating} size="sm" className="my-1" />
                          <p className="text-sm text-[#374151] leading-relaxed">{review.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-4">
              {/* Quick contact card */}
              <Card className="sticky top-24">
                <CardContent className="p-5">
                  <h3 className="font-semibold text-[#111827] mb-1">Contactar ahora</h3>
                  <p className="text-xs text-[#6b7280] mb-4">
                    Responde normalmente en menos de 2 horas
                  </p>

                  <Button variant="whatsapp" size="lg" className="w-full" asChild>
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5" />
                      WhatsApp
                    </a>
                  </Button>

                  <div className="border-t border-[#f3f4f6] mt-4 pt-4">
                    <div className="flex flex-col gap-2 text-xs text-[#6b7280]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Identidad verificada</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Pago directo (SINPE / efectivo)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Sin intermediarios</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats card */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-[#111827] mb-4">Estadísticas</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Reseñas", value: professional.review_count },
                      { label: "Calificación", value: `${professional.rating_avg.toFixed(1)} ★` },
                      { label: "Experiencia", value: `${professional.years_experience ?? "—"} años` },
                      { label: "Tarifa", value: professional.hourly_rate ? `₡${(professional.hourly_rate / 1000).toFixed(0)}k/h` : "A consultar" },
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
