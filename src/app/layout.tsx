import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { NativeDebugLogger } from "@/components/mobile/native-debug-logger";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  // La app nativa se reconoce por su cookie ya EN EL SERVIDOR: las clases del
  // armazón viajan pintadas en el HTML y React las reconoce como suyas. Cuando
  // las sembraba un script antes del primer cuadro, la hidratación las borraba
  // y el acomodo nativo se caía y volvía — el salto del arranque (main 0→64).
  const esApp = (await cookies()).get("ccr_platform")?.value === "native";
  const clasesNativas = esApp ? " ccr-native-app ccr-native-bottom-nav-visible" : "";
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased${clasesNativas}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* PRIMERO el viewport, antes de cualquier script síncrono: WebKit hace
            el primer layout al toparse con el script, y si el meta aún no llegó
            usa el viewport por defecto (568pt) — la página pintaba a escala
            1.68x y se reacomodaba después: el parpadeo del arranque en la app. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script
          type="text/javascript"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var k=${JSON.stringify(NATIVE_ONBOARDING_COMPLETED_KEY)};var p=new URLSearchParams(window.location.search);var local=/^(localhost|127\\.0\\.0\\.1)$/i.test(window.location.hostname);if(local&&p.get("resetNativeOnboarding")==="1"&&window.localStorage){window.localStorage.removeItem(k)}if(local&&p.get("nativePreview")==="1"){document.documentElement.classList.add("ccr-native-app");window.sessionStorage&&window.sessionStorage.setItem("ccr:native-preview","1")}else if(local&&window.sessionStorage&&window.sessionStorage.getItem("ccr:native-preview")==="1"){document.documentElement.classList.add("ccr-native-app")}if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.classList.add("ccr-native-app")}if(/(?:^|;\\s*)ccr_platform=native(?:;|$)/.test(document.cookie||"")){document.documentElement.classList.add("ccr-native-app")}if(document.documentElement.classList.contains("ccr-native-app")&&window.localStorage&&window.localStorage.getItem(k)!=="1"){document.documentElement.classList.add("ccr-native-first-run-pending")}}catch(e){}`,
          }}
        />
      </head>
      {/* El script de abajo agrega clases al body antes de hidratar (por ruta,
          p. ej. en /buscar); React no las corrige, solo avisaría en consola. */}
      <body className={`min-h-full flex flex-col bg-white${clasesNativas}`} suppressHydrationWarning>
        {/* Corre apenas el <body> existe, antes del primer cuadro: siembra las
            clases del armazón nativo que hasta ahora ponía la hidratación. Sin
            esto, la portada pintaba una vez con acomodo web y un instante
            después saltaba al nativo (barra de abajo, contenedor fijo) — el
            parpadeo del arranque. La hidratación después solo confirma.
            Ojo con las barras: dentro de la plantilla hay que escribir \\/ para que
            al navegador le llegue \\/ y la expresión regular no quede rota. */}
        <script
          type="text/javascript"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{if(document.documentElement.classList.contains("ccr-native-app")){document.body.classList.add("ccr-native-app");var r=window.location.pathname;if(!/(^|\\/)(publicar-proyecto|(empleos|ofertas)\\/publicar)(\\/|$)/.test(r)){document.documentElement.classList.add("ccr-native-bottom-nav-visible");document.body.classList.add("ccr-native-bottom-nav-visible")}if(/(^|\\/)buscar(\\/|$)/.test(r)){document.documentElement.classList.add("ccr-native-search-route");document.body.classList.add("ccr-native-search-route")}}}catch(e){}`,
          }}
        />
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
  // Ninguna espera muestra la marca: en la app la marca es del splash nativo y
  // en la web el logotipo a pantalla completa se leía como una pantalla de carga
  // más. Se pinta el lienzo con la barra y el contenido llega con esqueletos.
  return (
    <main className="ccr-page-route-loading fixed inset-0 z-[100000] bg-[#f4f7fa]" aria-busy="true" role="status">
      <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
      <span className="sr-only">Cargando...</span>
    </main>
  );
}
