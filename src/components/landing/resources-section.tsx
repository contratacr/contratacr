import Image from "next/image";
import { Link } from "@/i18n/navigation";

const RESOURCES = [
  {
    id: "precios",
    label: "Guías de precios",
    description: "Estimá costos para todos tus proyectos del hogar.",
    href: "/guias/precios",
    src: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=700&q=80",
  },
  {
    id: "mantenimiento",
    label: "Consejos de mantenimiento",
    description: "Consejos para mantener tu hogar en perfectas condiciones todo el año.",
    href: "/guias/mantenimiento",
    src: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=700&q=80",
  },
  {
    id: "proyectos",
    label: "Guías de proyectos",
    description: "Guías paso a paso para contratar profesionales y hacer DIY.",
    href: "/guias/proyectos",
    src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=700&q=80",
  },
];

export function ResourcesSection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-3">
            Recursos para tu hogar.
          </h2>
          <p className="text-gray-400 text-base max-w-md mx-auto">
            A veces arrancar es lo más difícil.
            <br />Tenemos guías expertas para tu próximo proyecto.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {RESOURCES.map((res) => (
            <Link
              key={res.id}
              href={res.href}
              className="group relative block rounded-2xl overflow-hidden card-lift"
              style={{ height: 260 }}
            >
              <Image
                src={res.src}
                alt={res.label}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.07]"
                sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
              />
              {/* Gradient */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.30) 50%, transparent 100%)",
                }}
              />
              {/* Blue tint on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "rgba(0,159,217,0.14)" }}
              />
              {/* Text */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="text-white font-bold text-base leading-tight">{res.label}</p>
                <p className="text-white/70 text-xs mt-1 leading-relaxed">{res.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
