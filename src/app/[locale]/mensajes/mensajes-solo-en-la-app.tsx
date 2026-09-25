"use client";

import { Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { useNativeApp } from "@/hooks/use-native-app";
import { MensajesEnLaApp } from "./mensajes-en-la-app";

/**
 * Lo que ve la web en /mensajes: los mensajes están en la app.
 *
 * Si resulta que SÍ es la app (la cookie todavía no existía en el primer
 * arranque), se pinta la bandeja de verdad. Es la red de seguridad del
 * reconocimiento en el servidor, no el camino normal.
 */
export function MensajesSoloEnLaApp() {
  const t = useTranslations("mensajesSoloApp");
  const nativeApp = useNativeApp();
  if (nativeApp) return <MensajesEnLaApp />;

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12 pt-24 sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
          <PanelEmptyState
            plano
            icon={Smartphone}
            title={t("titulo")}
            description={t("cuerpo")}
            className="px-5 py-14"
            action={(
              <Link href="/buscar" className="inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 text-[14px] font-bold text-white transition-colors hover:bg-[#0089bb]">
                {t("accion")}
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
