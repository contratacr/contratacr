import Image from "next/image";
import { ShieldCheck, Star, LifeBuoy, ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Link } from "@/i18n/navigation";
import { FadeInUp } from "@/components/landing/fade-in-up";

/* "Contrata con tranquilidad" — a clean split: trust checklist + CTA on the
   left, a cutout professional (transparent PNG) on the right. Benefits, not
   technical features; no invented numbers.
   Swap the photo by editing PRO_IMAGE.src (self-hosted Cloudinary cutout). */
const PRO_IMAGE = {
  src: "https://res.cloudinary.com/dxxrjx2go/image/upload/f_auto,q_auto,w_900/contratacr/home/pro-tranquilidad.png",
  alt: "Profesional verificado de ContrataCR",
};

const BENEFITS = [
  {
    Icon: ShieldCheck,
    tile: "bg-[#dcfce7] text-[#16a34a]",
    title: "Identidad verificada",
    desc: "Confirmamos la identidad de cada profesional contra los registros oficiales del país.",
  },
  {
    Icon: Star,
    tile: "bg-[#fef3c7] text-[#d97706]",
    title: "Reseñas reales",
    desc: "Solo quienes recibieron un servicio pueden dejar una reseña. Sin opiniones inventadas.",
  },
  {
    Icon: WhatsAppIcon,
    tile: "bg-[#dcfce7] text-[#1da851]",
    title: "Coordina por WhatsApp",
    desc: "Hablas directo con el profesional, sin intermediarios y a tu propio ritmo.",
  },
  {
    Icon: LifeBuoy,
    tile: "bg-[#EBF5FB] text-[#009FD9]",
    title: "Soporte cuando lo necesites",
    desc: "Te ayudamos por ticket o WhatsApp si algo no sale como esperabas.",
  },
];

export function TrustBenefits() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-white">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left: heading + checklist + CTA */}
          <FadeInUp>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5FB] text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Confianza
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight">
                Contrata con tranquilidad
              </h2>
              <p className="mt-3 text-gray-500 leading-relaxed max-w-md">
                Hecho para que encontrar y contratar a la persona correcta sea simple, transparente y seguro.
              </p>

              <ul className="mt-8 space-y-5">
                {BENEFITS.map(({ Icon, tile, title, desc }) => (
                  <li key={title} className="flex items-start gap-4">
                    <span className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-[#1a2744] leading-snug">{title}</p>
                      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <Link
                href="/buscar"
                className="mt-9 inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] px-6 py-3 text-sm font-bold text-white transition-colors shadow-[0_10px_30px_rgba(0,159,217,0.3)]"
              >
                Explorar profesionales <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </FadeInUp>

          {/* Right: cutout professional on a soft brand backdrop */}
          <FadeInUp delay={120}>
            <div className="relative flex justify-center lg:justify-end">
              {/* Soft brand shapes for depth (no rectangular photo background) */}
              <div aria-hidden className="pointer-events-none absolute inset-0 m-auto h-[22rem] w-[22rem] sm:h-[26rem] sm:w-[26rem] rounded-full bg-gradient-to-br from-[#EBF5FB] to-[#d7ecf7]" />
              <div aria-hidden className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 h-3 w-64 rounded-full bg-[#1a2744]/10 blur-xl" />
              <div className="relative h-[360px] sm:h-[460px] w-full max-w-[460px]">
                <Image
                  src={PRO_IMAGE.src}
                  alt={PRO_IMAGE.alt}
                  fill
                  className="object-contain object-bottom drop-shadow-[0_20px_40px_rgba(16,39,68,0.18)]"
                  sizes="(min-width:1024px) 460px, 80vw"
                />
              </div>
            </div>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}
