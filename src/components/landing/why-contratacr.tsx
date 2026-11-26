import { getTranslations } from "next-intl/server";
import { GuiaDeLaApp, type PasoDeLaGuia } from "@/components/landing/guia-de-la-app";
import { sitemapSections } from "@/lib/directory/sitemap-sections";

/* «Todo ContrataCR en tu teléfono»: la guía de la app con un teléfono que
   muestra la pantalla REAL de cada cosa que se puede hacer (buscar
   profesionales, publicar un proyecto, empleos y promociones). Las pantallas
   viven en /public/guia y muestran contenido real y formularios vacíos,
   sin enviar demostraciones. */
export async function WhyContratacr() {
  const t = await getTranslations("landing.howItWorks");
  // Directory on (test, owner 2026-11-26): ContrataCR is professionals AND companies, so the guide gets an Empresas step.
  // Its own video is recorded once the directory is finished; until then it shows the search video and poster.
  const directoryOn = sitemapSections().length > 0;
  const claves = directoryOn ? (["profesionales", "empresas", "proyectos", "promociones", "empleos"] as const) : (["profesionales", "proyectos", "promociones", "empleos"] as const);
  const pasos: PasoDeLaGuia[] = claves.map((clave) => ({
    clave,
    titulo: t(`guia.${clave}.titulo`),
    pestana: t(`guia.${clave}.pestana`),
    texto: t(`guia.${clave}.texto`),
    cta: t(`guia.${clave}.cta`),
    href: { profesionales: "/profesionales", empresas: "/categorias", proyectos: "/publicar-solicitud", empleos: "/empleos", promociones: "/promociones" }[clave],
    video: `/guia/${clave === "empresas" ? "profesionales" : clave}.mp4?v=20261117-solicitudes`,
    poster: `/guia/${clave === "empresas" ? "profesionales" : clave}.jpg?v=20261117-solicitudes`,
    alt: t(`guia.${clave}.alt`),
  }));

  return (
    <section id="asi-se-usa" className="relative scroll-mt-24 bg-white pb-14 pt-5 sm:pb-20 sm:pt-7">
      {/* Sin overflow-hidden: recortaba la sombra del teléfono y quedaba un borde. */}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-14">
          <h2 className="text-3xl font-extrabold text-[#1a2744] sm:text-4xl">{t.rich("guia.titulo", {
            // ContrataCR con los colores del logo: «Contrata» oscuro, «CR» celeste.
            marca: () => <span className="whitespace-nowrap">Contrata<span className="text-[#009FD9]">CR</span></span>,
          })}</h2>
        </div>
        <GuiaDeLaApp pasos={pasos} />
      </div>
    </section>
  );
}
