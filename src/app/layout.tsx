import { Suspense, type ReactNode } from "react";
import { Inter } from "next/font/google";
import { NativeDebugLogger } from "@/components/mobile/native-debug-logger";
import { LoadingMarkImage } from "@/components/ui/loading-mark-image";
import { LOADING_MARK_HANDOFF_SCRIPT } from "@/lib/loading-mark-handoff";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script
          type="text/javascript"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var k=${JSON.stringify(NATIVE_ONBOARDING_COMPLETED_KEY)};var p=new URLSearchParams(window.location.search);var local=/^(localhost|127\\.0\\.0\\.1)$/i.test(window.location.hostname);if(local&&p.get("resetNativeOnboarding")==="1"&&window.localStorage){window.localStorage.removeItem(k)}if(local&&p.get("nativePreview")==="1"){document.documentElement.classList.add("ccr-native-app");window.sessionStorage&&window.sessionStorage.setItem("ccr:native-preview","1")}else if(local&&window.sessionStorage&&window.sessionStorage.getItem("ccr:native-preview")==="1"){document.documentElement.classList.add("ccr-native-app")}if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.classList.add("ccr-native-app")}if(document.documentElement.classList.contains("ccr-native-app")&&window.localStorage&&window.localStorage.getItem(k)!=="1"){document.documentElement.classList.add("ccr-native-first-run-pending")}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white">
        <StaticNativeFirstRunPrepaint />
        <NativeDebugLogger />
        <Suspense fallback={<InitialRouteLoading />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}

function StaticNativeFirstRunPrepaint() {
  return (
    <div id="ccr-native-first-run-prepaint" aria-hidden="true">
      <div className="ccr-native-first-run-prepaint-bg" />
      <div className="ccr-native-first-run-prepaint-shade" />
      <div className="ccr-native-first-run-prepaint-content">
        <div className="ccr-native-first-run-prepaint-logo">
          <img src="/logo-mark-dark.png" alt="" />
          <span>
            Contrata<span>CR</span>
          </span>
        </div>
        <p>Elige como quieres comenzar</p>
        <div className="ccr-native-first-run-prepaint-actions">
          <span>Buscar servicios</span>
          <span>Ofrecer servicios</span>
        </div>
        <div className="ccr-native-first-run-prepaint-cta">Crear una cuenta</div>
        <div className="ccr-native-first-run-prepaint-login">
          Ya tienes una cuenta? <span>Inicia sesion</span>
        </div>
      </div>
    </div>
  );
}

function InitialRouteLoading() {
  return (
    <>
      <main
        className="ccr-page-route-loading fixed inset-0 z-[100000] grid min-h-dvh place-items-center bg-[#f4f7fa]"
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        {/* Keep the root suspense fallback visually identical to route loading. */}
        <LoadingMarkImage />
        <span className="sr-only">Cargando...</span>
      </main>
      <script dangerouslySetInnerHTML={{ __html: LOADING_MARK_HANDOFF_SCRIPT }} />
    </>
  );
}
