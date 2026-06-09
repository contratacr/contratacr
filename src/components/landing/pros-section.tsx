import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";

/* Home category cards — ONE self-hosted Cloudinary image per category.
   Category ids come from the single taxonomy (src/lib/data/categories.ts);
   images live in Cloudinary under contratacr/categorias/<id>. */
const CLOUD = "dxxrjx2go";
const catImg = (id: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_450/contratacr/categorias/${id}`;

// Most-requested CR services we currently have matching imagery for.
const HOME_CATEGORIES = [
  "limpieza", "plomeria", "electricidad", "jardineria",
  "pintura", "carpinteria", "construccion", "cerrajeria",
  "mudanzas", "mecanica", "peluqueria", "entrenamiento_personal",
  "masajes", "psicologia", "desarrollo_web", "contabilidad",
  "marketing_digital", "fotografia", "dj_sonido",
];

function CategoryCard({ id }: { id: string }) {
  const label = getCategoryLabel(id);
  return (
    <Link
      href={`/buscar?categoria=${id}`}
      className="group relative block rounded-2xl overflow-hidden card-lift"
      style={{ height: 180 }}
    >
      <Image
        src={catImg(id)}
        alt={label}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-[1.07]"
        sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 50%, transparent 100%)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-2">
        <span className="text-white font-bold text-sm drop-shadow leading-tight">{label}</span>
        <ArrowRight className="h-4 w-4 text-white/70 shrink-0 translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
      </div>
    </Link>
  );
}

export function ProsSection() {
  return (
    <section className="py-16 sm:py-24 bg-[#f4f7fa]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight">
            Profesionales para cada <span className="text-[#009FD9]">proyecto</span>
          </h2>
          <p className="text-gray-500 mt-2">Explora los servicios más solicitados en Costa Rica.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {HOME_CATEGORIES.map((id) => <CategoryCard key={id} id={id} />)}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/categorias"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#009FD9] hover:underline"
          >
            Ver todas las categorías <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
