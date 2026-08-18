import { Suspense, type ReactNode } from "react";
import { Inter } from "next/font/google";
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
            __html: `try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.classList.add("ccr-native-app");if(window.localStorage&&window.localStorage.getItem(${JSON.stringify(NATIVE_ONBOARDING_COMPLETED_KEY)})!=="1"){document.documentElement.classList.add("ccr-native-first-run-pending")}}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white">
        <div
          className="ccr-native-first-run-shell fixed inset-0 z-[219] overflow-hidden bg-[#071523] text-white"
          data-testid="native-first-run-onboarding"
          aria-hidden="true"
        >
          <img
            src="/mobile/contratacr-welcome-client-v1.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,31,0.03)_0%,rgba(5,18,31,0.08)_34%,rgba(8,28,52,0.68)_58%,#081c34_75%,#081c34_100%)]" />
          <div className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
            <section className="mt-auto pb-1 text-center">
              <div className="mb-4 inline-flex items-center" aria-label="ContrataCR">
                <img src="/logo-mark-dark.png" alt="" className="h-9 w-9 object-contain drop-shadow-lg" />
                <span className="-ml-0.5 text-[24px] font-black tracking-[-0.055em] drop-shadow-sm">
                  Contrata<span className="text-[#38bdf8]">CR</span>
                </span>
              </div>
              <p className="mx-auto max-w-[22rem] text-[clamp(1.55rem,6.5vw,2rem)] font-extrabold leading-tight tracking-[-0.035em]">
                Elige cómo quieres comenzar
              </p>
              <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-full border border-white/85 bg-[#081c34]/50 shadow-[0_16px_42px_rgba(0,0,0,0.24)] backdrop-blur-[3px]">
                <span className="grid min-h-14 place-items-center bg-white px-3 text-[14px] font-extrabold text-[#071523]">
                  Buscar servicios
                </span>
                <span className="grid min-h-14 place-items-center border-l border-white/80 px-3 text-[14px] font-extrabold text-white">
                  Ofrecer servicios
                </span>
              </div>
              <div className="mt-4 min-h-14 w-full rounded-full bg-[#08a7df]" />
              <div className="mx-auto mt-5 h-4 w-52 rounded-full bg-white/25" />
            </section>
          </div>
        </div>
        <Suspense fallback={<InitialRouteLoading />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}

function InitialRouteLoading() {
  return (
    <main
      className="ccr-page-route-loading fixed inset-0 z-[100000] grid min-h-dvh place-items-center bg-[#f4f7fa]"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      {/* Keep the root suspense fallback visually identical to route loading. */}
      <img
        src="/logo-mark-transparent.png"
        alt=""
        width={72}
        height={72}
        className="ccr-brand-loading-mark"
      />
      <span className="sr-only">Cargando...</span>
    </main>
  );
}
