import { ShieldCheck, Star, LifeBuoy, BadgeCheck, FileCheck2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { FadeInUp } from "@/components/landing/fade-in-up";

// "Contrata con tranquilidad" — an asymmetric BENTO with one large featured
// pillar. Benefits, not technical features; no invented numbers.
export function TrustBenefits() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-gradient-to-b from-[#eef4f9] to-white">
      <div aria-hidden className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,159,217,0.10), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute bottom-0 -left-24 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(22,163,74,0.08), transparent 70%)" }} />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#009FD9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9]" /> Confianza
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-[#1a2744]">
            Contrata con tranquilidad
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Hecho para que encontrar y contratar a la persona correcta sea simple, transparente y seguro.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Featured large pillar — dark green, spans 2 cols */}
          <FadeInUp className="md:col-span-2">
            <div className="group relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-[#16a34a] to-[#0c6e31] p-8 shadow-[0_22px_55px_rgba(22,163,74,0.28)]">
              {/* Decorative shield watermark + glow */}
              <ShieldCheck aria-hidden className="pointer-events-none absolute -right-6 -bottom-8 h-52 w-52 text-white/[0.07]" strokeWidth={1.2} />
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />

              <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-300">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="relative mt-5 text-2xl font-extrabold text-white">Identidad verificada</h3>
              <p className="relative mt-2 text-[15px] text-white/85 leading-relaxed max-w-md">
                Confirmamos la identidad de cada profesional contra los registros oficiales del país, y los perfiles verificados aparecen primero.
              </p>
              <div className="relative mt-5 flex flex-wrap gap-2">
                {[
                  { Icon: BadgeCheck, label: "Cédula validada" },
                  { Icon: FileCheck2, label: "Registro oficial" },
                ].map(({ Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold text-white ring-1 ring-white/15">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </span>
                ))}
              </div>
            </div>
          </FadeInUp>

          <FadeInUp delay={90}>
            <PillarCard Icon={Star} tile="bg-gradient-to-br from-[#f59e0b] to-[#d97706]" glow="rgba(245,158,11,0.22)"
              title="Reseñas reales"
              desc="Solo quienes recibieron un servicio pueden dejar una reseña. Sin opiniones inventadas." />
          </FadeInUp>

          <FadeInUp delay={150}>
            <PillarCard Icon={WhatsAppIcon} tile="bg-gradient-to-br from-[#25D366] to-[#1da851]" glow="rgba(37,211,102,0.22)"
              title="Coordina por WhatsApp"
              desc="Hablas directo con el profesional, sin intermediarios y a tu propio ritmo." />
          </FadeInUp>

          {/* Soporte — wide horizontal card spanning 2 cols */}
          <FadeInUp delay={210} className="md:col-span-2">
            <div className="group relative h-full overflow-hidden rounded-3xl bg-white border border-[#eef1f5] p-7 shadow-[0_12px_44px_rgba(16,39,68,0.07)] hover:shadow-[0_24px_60px_rgba(16,39,68,0.13)] hover:-translate-y-1 transition-all duration-300 flex items-center gap-6">
              <div className="relative shrink-0">
                <span aria-hidden className="absolute inset-0 -z-10 rounded-2xl blur-xl opacity-50" style={{ background: "radial-gradient(circle, rgba(0,159,217,0.5), transparent 70%)" }} />
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#009FD9] to-[#0078a8] text-white shadow-lg group-hover:scale-105 transition-transform duration-300">
                  <LifeBuoy className="h-8 w-8" />
                </span>
              </div>
              <div>
                <h3 className="font-bold text-[#1a2744] text-lg">Soporte cuando lo necesites</h3>
                <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                  Te ayudamos por ticket o WhatsApp si algo no sale como esperabas. Estamos para apoyarte.
                </p>
              </div>
            </div>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}

function PillarCard({
  Icon, tile, glow, title, desc,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  tile: string; glow: string; title: string; desc: string;
}) {
  return (
    <div className="group relative h-full overflow-hidden rounded-3xl bg-white border border-[#eef1f5] p-7 shadow-[0_12px_44px_rgba(16,39,68,0.07)] hover:shadow-[0_24px_60px_rgba(16,39,68,0.14)] hover:-translate-y-1.5 transition-all duration-300">
      <span aria-hidden className="pointer-events-none absolute -top-8 -left-8 h-28 w-28 rounded-full" style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)` }} />
      <div className="relative">
        <span aria-hidden className="absolute inset-0 -z-10 rounded-2xl blur-lg opacity-40" style={{ background: glow }} />
        <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg ${tile} group-hover:scale-105 transition-transform duration-300`}>
          <Icon className="h-7 w-7" />
        </div>
      </div>
      <h3 className="relative mt-4 font-bold text-[#1a2744] text-lg leading-snug">{title}</h3>
      <p className="relative mt-1.5 text-sm text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}
