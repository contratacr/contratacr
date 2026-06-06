import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { EmojiBlocker } from "@/components/util/emoji-blocker";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "ContrataCR — Profesionales de servicios en Costa Rica",
  description:
    "Encontrá electricistas, plomeros, pintores, tutores y más profesionales verificados en tu cantón.",
};

// viewport-fit=cover exposes the env(safe-area-inset-*) values used by the
// search map on notched / home-bar devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "es" | "en")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white">
        <NextIntlClientProvider messages={messages}>
          <EmojiBlocker />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
