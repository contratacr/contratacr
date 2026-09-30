"use client";

import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** La bandeja de mensajes tal como se ve dentro de la app. */
export function MensajesEnLaApp() {
  const tSeccion = useTranslations("sectionTitles");
  // Archivados y Bloqueados son vistas DENTRO de Mensajes: toman la barra de
  // arriba («← Archivados») como toma su título cualquier pantalla interna.
  const [subvista, setSubvista] = useState<{ titulo: string; volver: () => void } | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <SectionHeaderTitle title={subvista?.titulo ?? tSeccion("messages")} fallbackHref="/" raiz={!subvista} alVolver={subvista?.volver} />
      <main data-messages-page-main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-0 pb-0 pt-16 sm:px-6 sm:pb-12 sm:pt-24 lg:px-8">
        <section data-messages-page-shell className="min-h-[calc(100dvh-4rem)] overflow-hidden bg-white shadow-sm sm:min-h-[680px] sm:rounded-2xl sm:border sm:border-[#e5e7eb]">
          <DirectChatInbox alCambiarSubvista={setSubvista} />
        </section>
      </main>
    </div>
  );
}
