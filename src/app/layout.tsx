import { Suspense, type ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`} data-scroll-behavior="smooth">
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
      className="ccr-page-route-loading fixed inset-0 z-[200] grid min-h-dvh place-items-center bg-[#f4f7fa] text-[#162543]"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="flex flex-col items-center gap-3">
        <span className="h-11 w-11 animate-spin rounded-full border-4 border-[#cdeefa] border-t-[#009fd9]" aria-hidden="true" />
        <span className="text-lg font-bold">ContrataCR</span>
        <span className="text-sm text-[#5b6b82]">Cargando...</span>
      </div>
    </main>
  );
}
