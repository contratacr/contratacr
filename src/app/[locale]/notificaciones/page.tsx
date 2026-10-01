"use client";

import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useTranslations } from "next-intl";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default function NotificationsPage() {
  const tSeccion = useTranslations("sectionTitles");
  return (
    <div className="flex min-h-screen flex-col bg-white lg:bg-[#f5f8fb]">
      <LandingNavbar />
      <SectionHeaderTitle title={tSeccion("notifications")} fallbackHref="/" raiz tambienEnLaWeb />
      <main className="ccr-notifications-page-main flex w-full flex-1 flex-col px-0 pb-0 pt-16 lg:px-8 lg:pb-16 lg:pt-20">
        {/* En el teléfono —app o web— la lista va de borde a borde, como en la
            app; la tarjeta sobre el lienzo gris queda para la computadora, del
            ancho de una columna de lectura (como Facebook): a lo ancho de la
            pantalla los renglones eran cortos y el «···» quedaba lejísimos. */}
        <section className="ccr-notifications-page-panel mx-auto w-full max-w-5xl flex-1 lg:max-w-2xl px-0 pb-0 pt-2 lg:flex-none lg:px-6 lg:pb-6 lg:pt-4">
          <NotificationsList scope="all" titulo={tSeccion("notifications")} />
        </section>
      </main>
      <FooterSoloWeb soloEscritorio />
    </div>
  );
}
