import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GuiaDeLaApp, type PasoDeLaGuia } from "@/components/landing/guia-de-la-app";

/* «Todo ContrataCR en tu teléfono»: la guía de la app con un teléfono que
   muestra la pantalla REAL de cada cosa que se puede hacer (buscar
   profesionales, publicar un proyecto, empleos y promociones). Las pantallas
   viven en /public/guia y se toman de PRODUCCIÓN, nunca de test (ahí salen
   cuentas y publicaciones de prueba). */
export async function WhyContratacr() {
  const t = await getTranslations("landing.howItWorks");
  const pasos: PasoDeLaGuia[] = (["profesionales", "proyectos", "empleos", "promociones"] as const).map((clave) => ({
    clave,
    titulo: t(`guia.${clave}.titulo`),
    texto: t(`guia.${clave}.texto`),
    cta: t(`guia.${clave}.cta`),
    href: { profesionales: "/profesionales", proyectos: "/publicar-proyecto", empleos: "/empleos", promociones: "/promociones" }[clave],
    video: `/guia/${clave}.mp4`,
    poster: `/guia/${clave}.jpg`,
    alt: t(`guia.${clave}.alt`),
  }));

  return (
    <section className="relative overflow-hidden bg-white py-5 sm:py-7">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-14">
          <h2 className="text-3xl font-extrabold text-[#1a2744] sm:text-4xl">{t("guia.titulo")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-500">{t("guia.subtitulo")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/como-funciona" className="text-sm font-bold text-[#009FD9] transition-colors hover:text-[#007da8] hover:underline">
              {t("guideCta")}
            </Link>
            <Link
              href="/ayuda#agregar-a-inicio"
              // En la app ya está instalada: agregarla al celular no aplica.
              className="ccr-solo-web text-sm font-bold text-[#009FD9] transition-colors hover:text-[#007da8] hover:underline"
            >
              {t("installLink")}
            </Link>
          </div>
        </div>
        <GuiaDeLaApp pasos={pasos} />
      </div>
    </section>
  );
}
