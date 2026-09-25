"use client";

import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useTranslations } from "next-intl";

/** La bandeja de mensajes tal como se ve dentro de la app. */
export function MensajesEnLaApp() {
  const tSeccion = useTranslations("sectionTitles");

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <SectionHeaderTitle title={tSeccion("messages")} fallbackHref="/" raiz />
      <main data-messages-page-main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-0 pb-0 pt-16 sm:px-6 sm:pb-12 sm:pt-24 lg:px-8">
        <section data-messages-page-shell className="min-h-[calc(100dvh-4rem)] overflow-hidden bg-white shadow-sm sm:min-h-[680px] sm:rounded-2xl sm:border sm:border-[#e5e7eb]">
          <DirectChatInbox />
        </section>
      </main>
    </div>
  );
}
