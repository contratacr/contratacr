import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";

/**
 * La invitación a dejar una reseña en Google.
 *
 * Existe como PÁGINA porque el aviso de la campanita solo sabe llevar a una
 * dirección del app: un enlace externo no se puede poner ahí. Además así la
 * persona ve de qué se trata antes de salir a Google, y el enlace vive en un
 * solo lugar el día que cambie.
 */
const ENLACE = "https://g.page/r/CeZkdYZpL2enECE/review";

export const metadata: Metadata = { robots: { index: false } };

export default async function ResenaGooglePage() {
  const t = await getTranslations("resenaGoogle");
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />
      <SectionHeaderTitle title={t("titulo")} />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
      <main className="flex-1 px-4 py-12">
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eaf7fd] text-[#009FD9]">
            <Star className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-black text-[#162543] sm:text-3xl">{t("titulo")}</h1>
          <p className="mt-3 text-sm leading-6 text-[#6b7280]">{t("cuerpo")}</p>
          <a
            href={ENLACE}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 text-sm font-bold text-white hover:bg-[#0089bb]"
          >
            {t("boton")}
          </a>
          <p className="mt-3 text-xs text-[#8b95a5]">{t("nota")}</p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
