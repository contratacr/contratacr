import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";
import { HomeRecoveryLink } from "@/components/error/home-recovery-link";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { MaintenanceScreen } from "@/components/error/service-unavailable-screen";
import { errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";

export const metadata: Metadata = {
  title: "Mantenimiento temporal - ContrataCR",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const retryLabel = locale === "en" ? "Try again" : "Reintentar";
  const homeLabel = locale === "en" ? "Go home" : "Ir al inicio";

  return (
    <MaintenanceScreen locale={locale}>
      <a href="" className={errorPrimaryBtn}>
        <RefreshCw className="h-4 w-4" /> {retryLabel}
      </a>
      <HomeRecoveryLink href={rutaConIdioma(locale, "/")} className={errorSecondaryBtn} documentNavigation>
        {homeLabel}
      </HomeRecoveryLink>
    </MaintenanceScreen>
  );
}
