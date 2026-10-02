import { getTranslations } from "next-intl/server";
import { GuiaDeLaApp, type PasoDeLaGuia } from "@/components/landing/guia-de-la-app";

/* «Todo ContrataCR en tu teléfono»: la guía de la app con un teléfono que
   muestra la pantalla REAL de cada cosa que se puede hacer (buscar
   profesionales, publicar un proyecto, empleos y promociones). Las pantallas
   viven en /public/guia y se toman de PRODUCCIÓN, nunca de test (ahí salen
   cuentas y publicaciones de prueba). */
export async function WhyContratacr() {
  const t = await getTranslations("landing.howItWorks");
  const pasos: PasoDeLaGuia[] = (["profesionales", "proyectos", "promociones", "empleos"] as const).map((clave) => ({
    clave,
    titulo: t(`guia.${clave}.titulo`),
    pestana: t(`guia.${clave}.pestana`),
    texto: t(`guia.${clave}.texto`),
    cta: t(`guia.${clave}.cta`),
    href: { profesionales: "/profesionales", proyectos: "/publicar-proyecto", empleos: "/empleos", promociones: "/promociones" }[clave],
    video: `/guia/${clave}.mp4`,
    poster: `/guia/${clave}.jpg`,
    alt: t(`guia.${clave}.alt`),
  }));

  return (
    <section className="relative bg-white pb-14 pt-5 sm:pb-20 sm:pt-7">
      {/* Sin overflow-hidden: recortaba la sombra del teléfono y quedaba un borde. */}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-14">
          <h2 className="text-3xl font-extrabold text-[#1a2744] sm:text-4xl">{t("guia.titulo")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-500">{t("guia.subtitulo")}</p>
        </div>
        <GuiaDeLaApp pasos={pasos} />
      </div>
    </section>
  );
}
