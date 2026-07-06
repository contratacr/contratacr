import type { ReactNode } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { ErrorScreen } from "@/components/error/error-screen";

const COPY = {
  es: {
    code: "Error temporal",
    title: "Servicio temporalmente no disponible",
    message:
      "No pudimos completar esta carga por un problema temporal de conexión o de proveedor. Intenta de nuevo en unos minutos.",
    maintenanceCode: "Mantenimiento temporal",
    maintenanceTitle: "Estamos en mantenimiento",
    maintenanceMessage:
      "Estamos haciendo ajustes para que ContrataCR siga funcionando bien. Vuelve en unos minutos; si estabas guardando algo, espera antes de enviarlo otra vez.",
  },
  en: {
    code: "Temporary error",
    title: "Service temporarily unavailable",
    message:
      "We couldn't finish loading this because of a temporary connection or provider issue. Try again in a few minutes.",
    maintenanceCode: "Temporary maintenance",
    maintenanceTitle: "We are under maintenance",
    maintenanceMessage:
      "We are making updates so ContrataCR keeps running smoothly. Come back in a few minutes; if you were saving something, wait before submitting it again.",
  },
} as const;

function copyFor(locale: string) {
  return COPY[locale === "en" ? "en" : "es"];
}

export function ServiceUnavailableScreen({
  locale,
  children,
}: {
  locale: string;
  children?: ReactNode;
}) {
  const t = copyFor(locale);

  return (
    <ErrorScreen
      code={t.code}
      icon={<AlertTriangle className="h-7 w-7" />}
      title={t.title}
      message={t.message}
    >
      {children}
    </ErrorScreen>
  );
}
export function MaintenanceScreen({
  locale,
  children,
}: {
  locale: string;
  children?: ReactNode;
}) {
  const t = copyFor(locale);

  return (
    <ErrorScreen
      code={t.maintenanceCode}
      icon={<Activity className="h-7 w-7" />}
      title={t.maintenanceTitle}
      message={t.maintenanceMessage}
    >
      {children}
    </ErrorScreen>
  );
}
