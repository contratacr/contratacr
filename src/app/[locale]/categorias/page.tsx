import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";

const CATEGORIES = [
  {
    id: "electricidad",
    icon: "⚡",
    name: "Electricidad",
    description: "Instalaciones, reparaciones y tableros eléctricos",
  },
  {
    id: "plomeria",
    icon: "🔧",
    name: "Plomería",
    description: "Tuberías, baños y sistemas de agua",
  },
  {
    id: "jardineria",
    icon: "🌿",
    name: "Jardinería",
    description: "Poda, mantenimiento y paisajismo",
  },
  {
    id: "mudanzas",
    icon: "📦",
    name: "Mudanzas",
    description: "Transporte de muebles y embalaje",
  },
  {
    id: "pintura",
    icon: "🖌️",
    name: "Pintura",
    description: "Interior, exterior e impermeabilización",
  },
  {
    id: "carpinteria",
    icon: "🪵",
    name: "Carpintería",
    description: "Muebles a medida, puertas y pisos",
  },
  {
    id: "limpieza",
    icon: "🧹",
    name: "Limpieza",
    description: "Hogar, oficinas y desinfección",
  },
  {
    id: "tecnologia",
    icon: "💻",
    name: "Tecnología",
    description: "Soporte técnico, redes y CCTV",
  },
  {
    id: "mecanica",
    icon: "🔩",
    name: "Mecánica",
    description: "Revisión, frenos y sistema eléctrico",
  },
  {
    id: "seguridad",
    icon: "🔐",
    name: "Seguridad",
    description: "Cámaras, alarmas y cerrajería",
  },
];

export default function CategoriasPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-12 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#2563EB] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Servicios
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            Todos los servicios en ContrataCR.
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Encontrá profesionales para cualquier proyecto.
          </p>
        </FadeInUp>
      </section>

      {/* Categories Grid */}
      <section className="pb-24 px-4" style={{ background: "#f4f7fa" }}>
        <div className="mx-auto max-w-6xl">
          <FadeInUp>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 pt-10">
              {CATEGORIES.map((cat, i) => (
                <FadeInUp key={cat.id} delay={i * 40}>
                  <div className="group bg-white border border-gray-100 rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer">
                    <div className="w-20 h-20 rounded-2xl bg-[#EBF5FB] flex items-center justify-center text-4xl mb-4 group-hover:bg-[#2563EB]/10 transition-colors">
                      {cat.icon}
                    </div>
                    <h3 className="text-base font-bold text-[#1a2744] mb-1">{cat.name}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed mb-4">{cat.description}</p>
                    <Link
                      href={`/buscar?categoria=${cat.id}`}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      Ver profesionales →
                    </Link>
                  </div>
                </FadeInUp>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="py-16 bg-[#1a2744] text-white text-center px-4">
        <FadeInUp>
          <h2 className="text-3xl font-extrabold mb-3">¿No encontrás tu categoría?</h2>
          <p className="text-gray-300 mb-8 max-w-md mx-auto">
            Tenemos más de 50 especialidades disponibles. Escribinos y te ayudamos a encontrar el profesional que necesitás.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-bold px-7 py-3 rounded-full transition-all"
            >
              Buscar profesionales
            </Link>
            <Link
              href="/contacto"
              className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-3 rounded-full transition-all border border-white/20"
            >
              Contactarnos
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}
