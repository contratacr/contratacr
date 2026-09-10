"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { UserRoundSearch, BriefcaseBusiness, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { useRedirectIfRegistered } from "@/hooks/use-redirect-if-registered";

export default function RegisterPage() {
  const t = useTranslations("registerChoice");
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const redirectSuffix = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  // A logged-in user with an existing account must never see the "choose account
  // type" screen — send them to their panel. Genuinely-new visitors see the chooser.
  const { checking } = useRedirectIfRegistered();

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      {/* Misma envoltura que ingresar: navbar y pie en todo tamaño. La salida
          es el propio menú, no un botón de volver. */}
      <Navbar mobileSearch={false} />
      <main className="flex-1 ccr-centrado-seguro px-4 py-12 lg:py-20">
        <div className="w-full max-w-2xl">
          {/* El saludo va arriba y pequeño: la marca ya está en el navbar y en el
              pie, así que no necesita el tamaño grande. Lo grande es la pregunta,
              porque «Ofrezco servicios» y «Busco servicios» son respuestas: con la
              pregunta a la vista se leen como una decisión y no como un menú. */}
          <div className="ccr-entrada text-center mb-8 lg:mb-12">
            <p className="mb-1.5 text-[15px] font-semibold text-[#009FD9] lg:text-base">{t("welcome")}</p>
            <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#162543] sm:text-4xl lg:text-[2.75rem]">{t("title")}</h1>
          </div>

          {/* Como eligen rol Upwork o Airbnb: dos tarjetas iguales, cada una con
              un mosaico de color y el icono dibujado a línea; abajo el rol con
              la flecha y una frase de qué hace. Profesional primero: es quien
              más se registra. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            <Link
              href={`/registro/profesional${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:80ms] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35"
            >
              <span className="ccr-tarjeta-rol-mosaico ccr-mosaico-pro" aria-hidden>
                <BriefcaseBusiness className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
              </span>
              {/* Lo grande responde la pregunta ("¿cómo vas a usar…?"); el rol
                  queda abajo para que sepa qué cuenta está creando. */}
              {/* La flecha solo donde cabe en el mismo renglón: en el teléfono se
                  iba sola a una segunda línea y la tarjeta ya se ve pulsable. */}
              <span className="mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] sm:text-[22px]">
                {t("proTitle")}
                <ArrowRight className="ccr-tarjeta-rol-flecha ml-1.5 hidden h-6 w-6 align-[-4px] sm:inline-block" strokeWidth={2.4} />
              </span>
              <span className="mt-1 block text-center text-[13px] font-semibold text-[#009FD9] sm:text-[15px]">{t("proRole")}</span>
            </Link>

            <Link
              href={`/registro/cliente${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:160ms] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35"
            >
              <span className="ccr-tarjeta-rol-mosaico ccr-mosaico-cliente" aria-hidden>
                <UserRoundSearch className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
              </span>
              {/* La flecha solo donde cabe en el mismo renglón: en el teléfono se
                  iba sola a una segunda línea y la tarjeta ya se ve pulsable. */}
              <span className="mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] sm:text-[22px]">
                {t("clientTitle")}
                <ArrowRight className="ccr-tarjeta-rol-flecha ml-1.5 hidden h-6 w-6 align-[-4px] sm:inline-block" strokeWidth={2.4} />
              </span>
              <span className="mt-1 block text-center text-[13px] font-semibold text-[#009FD9] sm:text-[15px]">{t("clientRole")}</span>
            </Link>
          </div>

          {/* Una sola cuenta sirve para las dos cosas. Dicho una vez y DEBAJO de
              las tarjetas: dentro de cada una competía con la elección y hacía
              dudar de si las dos hacían lo mismo. */}
          <p className="ccr-entrada [animation-delay:240ms] mx-auto mt-6 max-w-md text-center text-[13px] leading-relaxed text-[#8a94a6] sm:text-sm">
            {t("reassurance")}
          </p>
          <p className="ccr-entrada [animation-delay:300ms] text-center text-sm text-[#6b7280] mt-6 lg:mt-8">
            {t("haveAccount")}{" "}
            <Link href="/login" className="text-[#009FD9] font-semibold hover:underline">
              {t("signIn")}
            </Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
