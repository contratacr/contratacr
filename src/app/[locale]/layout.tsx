import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { EmojiBlocker } from "@/components/util/emoji-blocker";
import { BackToTop } from "@/components/landing/back-to-top";
import { NotificationLiveToast } from "@/components/notifications/notification-live-toast";
import { CustomCategoriesLoader } from "@/lib/data/use-custom-categories";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

type LocaleParams = {
  params: Promise<{ locale: string }>;
};

function buildMetadata(locale: string): Metadata {
  const isEn = locale === "en";
  const title = isEn
    ? "ContrataCR: Service professionals in Costa Rica"
    : "ContrataCR: Profesionales de servicios en Costa Rica";
  const description = isEn
    ? "Find electricians, plumbers, painters, tutors and more verified professionals in your canton."
    : "Encuentra electricistas, plomeros, pintores, tutores y mas profesionales verificados en tu canton.";
  const socialDescription = isEn
    ? "Find and hire professionals in Costa Rica"
    : "Encuentra y contrata profesionales en Costa Rica";

  return {
    metadataBase: new URL("https://contratacr.com"),
    title,
    description,
    applicationName: "ContrataCR",
    manifest: "/site.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      siteName: "ContrataCR",
      title: "ContrataCR",
      description: socialDescription,
      url: "https://contratacr.com",
      locale: isEn ? "en_US" : "es_CR",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: `ContrataCR - ${socialDescription}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ContrataCR",
      description: socialDescription,
      images: ["/og-image.png"],
    },
  };
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale);
}

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
          <CustomCategoriesLoader />
          <NotificationLiveToast scope="all" />
          {children}
          <BackToTop />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
