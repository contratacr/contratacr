"use client";

import { useLocale, useTranslations } from "next-intl";
import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { abrirPasoProfesional, cerrarPasoProfesional } from "@/lib/navigation/paso-profesional";
import { UserRoundSearch, BriefcaseBusiness, ArrowRight, ChevronLeft, HardHat, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CabeceraDeEntrada } from "@/components/auth/cabecera-de-entrada";
import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
import { useRedirectIfRegistered } from "@/hooks/use-redirect-if-registered";
import { useSiteFeatures } from "@/components/site-features";

export default function RegisterPage() {
  const t = useTranslations("registerChoice");
  const searchParams = useSearchParams();
  const redirect = rutaInternaSegura(searchParams.get("redirect"));
  const redirectSuffix = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  // A logged-in user with an existing account must never see the "choose account
  // type" screen — send them to their panel. Genuinely-new visitors see the chooser.
  const { checking } = useRedirectIfRegistered();
  // Directory on (2026-11-27): «Profesional» asks one more thing, independent professional or business with premises
  // («Empresa o local» → add or claim the place). With the directory off (production) the card is the same link as always.
  const directoryOn = useSiteFeatures().directorySections.length > 0;
  // The second question is a history entry (?paso=profesional): the phone's back gesture and the browser's Back return
  // to the first question instead of leaving sign-up, and Back from /registro/profesional lands on this question again.
  const proStep = searchParams.get("paso") === "profesional";
  const pasoAbiertoAqui = useRef(false);
  const abrirPaso = () => { pasoAbiertoAqui.current = true; abrirPasoProfesional(); };
  const cerrarPaso = () => { cerrarPasoProfesional(pasoAbiertoAqui.current); pasoAbiertoAqui.current = false; };
  // Directory on (owner 2026-11-27): «Crear cuenta» is a step of the sign-in flow when it came from login
  // (cabecera-de-entrada.tsx) and the professional-kind question is a step of «Crear cuenta»: phones get «← paso» in
  // the bar instead of an in-page «Volver». Directory off: the site bar, as always.
  const en = useLocale() === "en";
  const createTitle = en ? "Create account" : "Crear cuenta";

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  if (directoryOn && proStep) {
    return (
      <div className="ccr-account-page min-h-dvh flex flex-col bg-white" data-register-pro-kind>
        <CabeceraDeEntrada title={t("proTitle")} onBack={cerrarPaso} />
        <main className="flex-1 ccr-centrado-seguro px-4 py-12 lg:py-20">
          <div className="w-full max-w-2xl">
            <div className="ccr-entrada text-center mb-8 lg:mb-12">
              <button type="button" data-register-kind-back onClick={cerrarPaso} className="mb-3 hidden lg:inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#009FD9] hover:underline">
                <ChevronLeft className="h-4 w-4" aria-hidden />{t("back")}
              </button>
              <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#162543] sm:text-4xl lg:text-[2.75rem]">{t("proKindTitle")}</h1>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {([
                { href: `/registro/profesional${redirectSuffix}`, Icon: HardHat, title: t("independentTitle"), role: t("independentRole"), mosaic: "ccr-mosaico-pro", id: "independiente" },
                { href: `/registro/empresa${redirectSuffix}`, Icon: Store, title: t("businessTitle"), role: t("businessRole"), mosaic: "ccr-mosaico-cliente", id: "empresa" },
              ] as const).map(({ href, Icon, title, role, mosaic, id }, n) => (
                <Link key={id} href={href} data-register-pro-kind-option={id}
                  className={`ccr-entrada ccr-tarjeta-rol group ${n ? "[animation-delay:160ms]" : "[animation-delay:80ms]"} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35`}>
                  <span className={`ccr-tarjeta-rol-mosaico ${mosaic}`} aria-hidden>
                    <Icon className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
                  </span>
                  <span className="mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] sm:text-[22px]">
                    {title}
                    <ArrowRight className="ccr-tarjeta-rol-flecha ml-1.5 hidden h-6 w-6 align-[-4px] sm:inline-block" strokeWidth={2.4} />
                  </span>
                  <span className="mt-1 block text-center text-[13px] font-semibold text-[#009FD9] sm:text-[15px]">{role}</span>
                </Link>
              ))}
            </div>
            <p className="ccr-entrada [animation-delay:240ms] mx-auto mt-6 max-w-md text-center text-[13px] leading-relaxed text-[#8a94a6] sm:text-sm">
              {t("proKindNote")}
            </p>
          </div>
        </main>
        <FooterSoloWeb soloEscritorio />
      </div>
    );
  }

  // The «Profesional» card: a link to its form (production) or, with the directory on, the button to the next question.
  const proCard = (
    <>
      <span className="ccr-tarjeta-rol-mosaico ccr-mosaico-pro" aria-hidden>
        <BriefcaseBusiness className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
      </span>
      {/* La flecha solo donde cabe en el mismo renglón: en el teléfono se
          iba sola a una segunda línea y la tarjeta ya se ve pulsable. */}
      <span className="mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] sm:text-[22px]">
        {t("proTitle")}
        <ArrowRight className="ccr-tarjeta-rol-flecha ml-1.5 hidden h-6 w-6 align-[-4px] sm:inline-block" strokeWidth={2.4} />
      </span>
      <span className="mt-1 block text-center text-[13px] font-semibold text-[#009FD9] sm:text-[15px]">{t("proRole")}</span>
    </>
  );
  const proCardClass = "ccr-entrada ccr-tarjeta-rol group [animation-delay:80ms] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35";

  return (
    <div className="ccr-account-page min-h-dvh flex flex-col bg-white">
      {/* Misma envoltura que ingresar: navbar y pie en todo tamaño. La salida
          es el propio menú, no un botón de volver. */}
      <CabeceraDeEntrada title={createTitle} parentHref={`/login${redirectSuffix}`} />
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

          {/* Dos tarjetas iguales, como eligen rol Upwork o Airbnb: un mosaico con
              el icono a línea, la acción en grande y el rol debajo. Profesional
              primero porque es quien más se registra —288 cuentas contra 108—,
              pero las dos pesan lo mismo y por eso se ven igual: la del cliente
              es la puerta de quien llega decidido a publicar, guardar o reseñar.

              (Estuvo un rato como una sola tarjeta con el cliente en una línea
              debajo. Se leía torcido: si las dos puertas hacen falta, no se
              pueden dibujar con distinto peso.) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            {directoryOn ? (
              <button type="button" onClick={abrirPaso} data-register-pro className={proCardClass}>{proCard}</button>
            ) : (
              <Link href={`/registro/profesional${redirectSuffix}`} className={proCardClass}>{proCard}</Link>
            )}

            <Link
              href={`/registro/cliente${redirectSuffix}`}
              className="ccr-entrada ccr-tarjeta-rol group [animation-delay:160ms] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35"
            >
              <span className="ccr-tarjeta-rol-mosaico ccr-mosaico-cliente" aria-hidden>
                <UserRoundSearch className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4} />
              </span>
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
            <Link href={directoryOn ? `/login${redirectSuffix}` : "/login"} className="text-[#009FD9] font-semibold hover:underline">
              {t("signIn")}
            </Link>
          </p>
        </div>
      </main>
      <FooterSoloWeb soloEscritorio />
    </div>
  );
}
