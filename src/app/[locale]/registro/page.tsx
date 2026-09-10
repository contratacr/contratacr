"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { UserRoundSearch, BriefcaseBusiness, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { FocusedHeader } from "@/components/layout/focused-header";
import { ArrowLeft } from "lucide-react";
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
    <div className="ccr-acceso-fondo relative min-h-screen flex flex-col bg-[#f4f7fa]">
      {/* Aurora de marca detrás de todo: tres manchas difusas que se mueven muy
          despacio. Es decoración, no contenido: aria-hidden y quieta si la persona
          pidió menos movimiento. */}
      <div aria-hidden className="ccr-aurora pointer-events-none absolute inset-0 overflow-hidden">
        <span className="ccr-aurora-mancha ccr-aurora-a" />
        <span className="ccr-aurora-mancha ccr-aurora-b" />
        <span className="ccr-aurora-mancha ccr-aurora-c" />
      </div>
      {/* Igual que ingresar: en el teléfono esta pantalla tiene una sola tarea,
          así que va sin menú ni pie, con la marca arriba y una salida clara. */}
      <div className="relative hidden lg:block"><Navbar mobileSearch={false} /></div>
      <div className="relative lg:hidden"><FocusedHeader /></div>
      <main className="relative flex-1 flex flex-col items-center justify-start px-4 pb-10 pt-5 lg:justify-center lg:py-16">
        <div className="w-full max-w-xl">
          <Link
            href="/"
            className="ccr-entrada mb-6 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-[13px] font-bold text-[#162543] transition-colors hover:bg-[#eef3f8] lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
            {t("backHome")}
          </Link>
          <div className="ccr-entrada text-center mb-8">
            <h1 className="text-[2rem] font-extrabold tracking-tight text-[#162543] mb-2 lg:text-4xl">{t("title")}</h1>
            <p className="text-[#6b7280] text-base">{t("subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Profesional → ofrezco servicios. Va primero: es quien más se registra. */}
            <Link
              href={`/registro/profesional${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:90ms]"
            >
              <span aria-hidden className="ccr-tarjeta-rol-halo bg-[#009FD9]" />
              <span className="ccr-tarjeta-rol-icono bg-gradient-to-br from-[#2fb9ea] to-[#0077b6] shadow-[0_14px_30px_-12px_rgba(0,159,217,0.75)]">
                <BriefcaseBusiness className="h-7 w-7 text-white" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[22px] font-extrabold leading-tight text-[#162543]">{t("proRole")}</span>
                <span className="mt-0.5 block text-sm font-semibold text-[#009FD9]">{t("proTitle")}</span>
                <span className="mt-2 block text-[13px] leading-snug text-[#6b7280]">{t("proHint")}</span>
              </span>
              <span className="ccr-tarjeta-rol-flecha bg-[#EBF5FB] text-[#009FD9] group-hover:bg-[#009FD9] group-hover:text-white">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            {/* Cliente → busco servicios. Lleva el azul marino de la marca para que
                las dos opciones se distingan de un vistazo. */}
            <Link
              href={`/registro/cliente${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:180ms]"
            >
              <span aria-hidden className="ccr-tarjeta-rol-halo bg-[#162543]" />
              <span className="ccr-tarjeta-rol-icono bg-gradient-to-br from-[#33507f] to-[#162543] shadow-[0_14px_30px_-12px_rgba(22,37,67,0.7)]">
                <UserRoundSearch className="h-7 w-7 text-white" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[22px] font-extrabold leading-tight text-[#162543]">{t("clientRole")}</span>
                <span className="mt-0.5 block text-sm font-semibold text-[#009FD9]">{t("clientTitle")}</span>
                <span className="mt-2 block text-[13px] leading-snug text-[#6b7280]">{t("clientHint")}</span>
              </span>
              <span className="ccr-tarjeta-rol-flecha bg-[#EBF5FB] text-[#009FD9] group-hover:bg-[#162543] group-hover:text-white">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>

          <p className="ccr-entrada [animation-delay:260ms] text-center text-sm text-[#6b7280] mt-8">
            {t("haveAccount")}{" "}
            <Link href="/login" className="text-[#009FD9] font-semibold hover:underline">
              {t("signIn")}
            </Link>
          </p>
        </div>
      </main>
      <div className="relative hidden lg:block"><LandingFooter /></div>
    </div>
  );
}
