"use client";

import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useTranslations } from "next-intl";

/**
 * Mensajes, en la app Y en la web.
 *
 * Esta ruta respondía 404 fuera de la app nativa, y con eso quedaban dos
 * caminos rotos en la web: la notificación «Nuevo mensaje» —que apunta a
 * /mensajes?conversation=…— y el panel, que redirige aquí cuando le piden
 * ?tab=chat. Las dos puertas llevaban a «Página no encontrada», así que en la
 * web NO había forma de leer un mensaje recibido.
 *
 * Lo que sigue siendo de la app es el ICONO de Mensajes en la barra de arriba;
 * en la web se llega desde el menú, desde el panel y desde el aviso. La
 * pantalla ya traía su propio marco para la web (navbar y pie), solo estaba
 * apagada.
 */
export default function MessagesPage() {
  const tSeccion = useTranslations("sectionTitles");

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <SectionHeaderTitle title={tSeccion("messages")} fallbackHref="/" raiz />
      <main data-messages-page-main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-0 pb-0 pt-16 sm:px-6 sm:pb-12 sm:pt-24 lg:px-8">
        <section data-messages-page-shell className="min-h-[calc(100dvh-4rem)] overflow-hidden bg-white shadow-sm sm:min-h-[680px] sm:rounded-2xl sm:border sm:border-[#dfe8f0]">
          <DirectChatInbox />
        </section>
      </main>
      <div className="hidden sm:block">
        <LandingFooter />
      </div>
    </div>
  );
}
