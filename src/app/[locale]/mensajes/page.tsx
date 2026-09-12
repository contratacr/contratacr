"use client";

import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

// La app se reconoce por el runtime de Capacitor o por la marca que el propio
// armazón nativo deja en la cookie; cualquiera de las dos alcanza.
function esLaApp() {
  if (isNativeAppRuntime()) return true;
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)ccr_platform=native(?:;|$)/.test(document.cookie);
}

// Capacitor no avisa cuando se anuncia: la lectura se repite en el efecto de
// abajo, así que aquí no hay nada a lo que suscribirse.
const sinSuscripcion = () => () => {};

export default function MessagesPage() {
  const tSeccion = useTranslations("sectionTitles");
  // Los mensajes son de la app: en la web esta ruta no existe. Capacitor tarda
  // unos milisegundos en anunciarse, así que solo se descarta cuando ya se sabe.
  // Arranca SIEMPRE en «pendiente», también en el cliente: el servidor no ve
  // Capacitor ni el documento y pinta el marco vacío, así que si el cliente
  // arrancara ya en «app» React descartaría el HTML entero por no coincidir
  // (error de hidratación en cada apertura de Mensajes y un repintado de más).
  // La app se reconoce antes del primer pintado, en el efecto de abajo.
  // El servidor responde «no es la app» (marco vacío) y el cliente lo
  // reemplaza en el mismo ciclo de hidratación sin descartar el HTML.
  const esAppAhora = useSyncExternalStore(sinSuscripcion, esLaApp, () => false);
  const [entornoDetectado, setEntorno] = useState<"pendiente" | "app" | "web">("pendiente");
  const entorno = esAppAhora ? "app" : entornoDetectado;
  useEffect(() => {
    if (entorno === "app") return;
    const revisar = () => { if (esLaApp()) setEntorno("app"); };
    const tiempos = [0, 50, 250, 750].map((espera) => window.setTimeout(revisar, espera));
    const final = window.setTimeout(() => { if (!esLaApp()) setEntorno("web"); }, 900);
    return () => { tiempos.forEach(window.clearTimeout); window.clearTimeout(final); };
  }, [entorno]);

  if (entorno === "web") notFound();
  if (entorno === "pendiente") return <div className="min-h-screen bg-[#f5f8fb]" />;

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
