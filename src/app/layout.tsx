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
      className="ccr-page-route-loading fixed inset-0 z-[200] min-h-dvh bg-[#f4f7fa]"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">Cargando...</span>
    </main>
  );
}
