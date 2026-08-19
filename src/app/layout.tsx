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
