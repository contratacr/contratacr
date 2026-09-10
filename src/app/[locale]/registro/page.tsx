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
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 lg:py-20">
        <div className="w-full max-w-2xl">
          <div className="ccr-entrada text-center mb-8 lg:mb-12">
            <h1 className="text-[1.9rem] font-extrabold tracking-tight text-[#162543] mb-3 lg:text-5xl">{t("title")}</h1>
            <p className="text-base font-medium text-[#6b7280] lg:text-lg">{t("subtitle")}</p>
          </div>

          {/* Como eligen rol Upwork o Airbnb: dos tarjetas iguales, cada una con
              un mosaico de color y el icono dibujado a línea; abajo el rol con
              la flecha y una frase de qué hace. Profesional primero: es quien
              más se registra. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            <Link
              href={`/registro/profesional${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:80ms]"
            >
              <span className="ccr-tarjeta-rol-mosaico ccr-mosaico-pro" aria-hidden>
                <BriefcaseBusiness className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
              </span>
              <span className="mt-4 flex items-center justify-center gap-1.5 text-[19px] font-bold text-[#162543] sm:text-2xl">
                {t("proRole")}
                <ArrowRight className="ccr-tarjeta-rol-flecha h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.4} />
              </span>
              <span className="mt-1 block text-center text-[13px] text-[#6b7280] sm:text-base">{t("proTitle")}</span>
            </Link>

            <Link
              href={`/registro/cliente${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:160ms]"
            >
              <span className="ccr-tarjeta-rol-mosaico ccr-mosaico-cliente" aria-hidden>
                <UserRoundSearch className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
              </span>
              <span className="mt-4 flex items-center justify-center gap-1.5 text-[19px] font-bold text-[#162543] sm:text-2xl">
                {t("clientRole")}
                <ArrowRight className="ccr-tarjeta-rol-flecha h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.4} />
              </span>
              <span className="mt-1 block text-center text-[13px] text-[#6b7280] sm:text-base">{t("clientTitle")}</span>
            </Link>
          </div>

          <p className="ccr-entrada [animation-delay:240ms] text-center text-sm text-[#6b7280] mt-8 lg:mt-10">
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
