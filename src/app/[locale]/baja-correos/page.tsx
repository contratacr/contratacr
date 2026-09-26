import type { Metadata } from "next";
import { MailX, MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
import { PanelEmptyState } from "@/components/ui/content-loading";

/**
 * «Listo, no te mandamos más novedades».
 *
 * Llega aquí quien tocó el enlace del pie de un correo. La baja ya ocurrió en
 * `/api/email/baja`: esta pantalla solo la confirma, porque un enlace que no
 * contesta nada deja a la persona sin saber si funcionó —y volviendo a tocarlo.
 *
 * No se indexa: es el final de un enlace privado, no una página del sitio.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BajaCorreosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const t = await getTranslations("bajaCorreos");
  const listo = (await searchParams).ok !== "0";

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12 pt-24 sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
          <PanelEmptyState
            plano
            icon={listo ? MailCheck : MailX}
            title={listo ? t("listoTitulo") : t("falloTitulo")}
            description={listo ? t("listoCuerpo") : t("falloCuerpo")}
            className="px-5 py-14"
            action={(
              <Link href="/" className="inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 text-[14px] font-bold text-white transition-colors hover:bg-[#0089bb]">
                {t("volver")}
              </Link>
            )}
          />
        </section>
      </main>
      <div className="hidden sm:block">
        <FooterSoloWeb soloEscritorio />
      </div>
    </div>
  );
}
