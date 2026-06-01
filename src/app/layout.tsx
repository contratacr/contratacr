import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ContrataCR — Profesionales de servicios en Costa Rica",
  description:
    "Encontrá electricistas, plomeros, pintores, tutores y más profesionales verificados en tu cantón. La plataforma de servicios profesionales de Costa Rica.",
  keywords: ["profesionales", "servicios", "costa rica", "contratar", "electricista", "plomero"],
  openGraph: {
    title: "ContrataCR — Profesionales de servicios en Costa Rica",
    description: "Encontrá profesionales verificados cerca de vos. Contacto directo por WhatsApp.",
    locale: "es_CR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#fafafa]">{children}</body>
    </html>
  );
}
