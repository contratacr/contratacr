import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * La otra puerta de entrada: publicar lo que se necesita. Vivía pegada al
 * buscador con un separador "o", y eso la ponía al mismo nivel que la búsqueda,
 * que es la acción principal del home. Aquí abajo se lee como lo que es: la
 * salida para quien no sabe a quién contratar.
 */
export async function PublishNeedRow() {
  const t = await getTranslations("landing.hero");
  return (
    <section className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
      <Link
        href="/dashboard/profesional?tab=sent_projects&openPublish=1"
        className="group flex items-center justify-between gap-3 rounded-2xl border border-[#e5eaf0] bg-[#f8fafc] px-4 py-3.5 transition-colors hover:border-[#bfe3f5] hover:bg-white sm:px-5"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-[#162543]">{t("publishCardTitle")}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-[#68778d]">{t("publishCardBody")}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#68778d] transition-transform group-hover:translate-x-0.5 group-hover:text-[#0089bb]" />
      </Link>
    </section>
  );
}
