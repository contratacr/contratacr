"use client";

import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useTranslations } from "next-intl";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default function NotificationsPage() {
  const tSeccion = useTranslations("sectionTitles");
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <SectionHeaderTitle title={tSeccion("notifications")} fallbackHref="/" raiz tambienEnLaWeb />
      <main className="ccr-notifications-page-main flex w-full flex-1 flex-col px-0 pb-0 pt-16 sm:px-6 sm:pb-16 sm:pt-20 lg:px-8">
        {/* El lienzo gris de siempre: la lista y el vacío traen su propia
            tarjeta, igual que Mis proyectos. Antes esta sección era una sábana
            blanca de borde a borde y Notificaciones se sentía de otro app. */}
        <section className="ccr-notifications-page-panel mx-auto w-full max-w-5xl flex-1 px-4 pb-5 pt-4 sm:flex-none sm:px-6 sm:pb-6 sm:pt-4">
          <NotificationsList scope="all" titulo={tSeccion("notifications")} />
        </section>
      </main>
      <FooterSoloWeb soloEscritorio />
    </div>
  );
}
