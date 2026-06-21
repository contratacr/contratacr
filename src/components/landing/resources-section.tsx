import Image from "next/image";
import { Link } from "@/i18n/navigation";

const RESOURCES = [
  {
    id: "como-funciona",
    label: "Cómo funciona ContrataCR",
    description: "Conoce las dos formas de encontrar el servicio correcto para lo que necesitas.",
    href: "/como-funciona",
    src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=700&q=80",
  },
  {
    id: "para-profesionales",
    label: "Consejos para quienes ofrecen servicios",
    description: "Estrategias prácticas para atraer más clientes en el mercado costarricense.",
    href: "/atraer-clientes",
    src: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=700&q=80",
  },
  {
    id: "ayuda",
    label: "Centro de ayuda",
    description: "Respuestas rápidas a las preguntas más comunes sobre la plataforma.",
    href: "/ayuda",
    src: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=700&q=80",
  },
];

export function ResourcesSection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-3">
            Recursos útiles.
          </h2>
          <p className="text-gray-400 text-base max-w-md mx-auto">
            Todo lo que necesitas saber para sacarle el máximo provecho a ContrataCR.
          </p>
        </div>

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
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.30) 50%, transparent 100%)",
                }}
              />
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "rgba(0,159,217,0.14)" }}
              />
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
