import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { EmojiBlocker } from "@/components/util/emoji-blocker";
import { BackToTop } from "@/components/landing/back-to-top";
import { NotificationLiveToast } from "@/components/notifications/notification-live-toast";
import { CustomCategoriesLoader } from "@/lib/data/use-custom-categories";
import { ViewportEnvironment } from "@/components/util/viewport-environment";
import { DocumentLocale } from "@/components/util/document-locale";
import { OperationalStatusBanner } from "@/components/status/operational-status-banner";
import { getOperationalStatusBanner } from "@/lib/status/runtime-status";
import { AuthProvider } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { notificationContext } from "@/lib/notification-link";

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
    : "Encuentra electricistas, plomeros, pintores, tutores y más profesionales verificados en tu cantón.";
  const socialDescription = isEn
    ? "Find and hire professionals in Costa Rica"
    : "Encuentra y contrata profesionales en Costa Rica";
  const socialImage = `/${locale}/opengraph-image`;

  return {
    metadataBase: new URL("https://contratacr.com"),
    title,
    description,
    applicationName: "ContrataCR",
    manifest: "/site.webmanifest",
    appleWebApp: {
      capable: true,
      title: "ContrataCR",
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: "/favicon.ico?v=transparent-mark-clean", sizes: "any" },
        { url: "/favicon-96x96.png?v=transparent-mark-clean", type: "image/png", sizes: "96x96" },
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
      images: [{ url: socialImage, width: 1200, height: 630, alt: `ContrataCR - ${socialDescription}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ContrataCR",
      description: socialDescription,
      images: [socialImage],
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
  themeColor: "#ffffff",
  interactiveWidget: "resizes-content",
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
  const operationalStatus = getOperationalStatusBanner(locale);
  const supabase = await createClient();
  const initialUser = await safeGetUser(supabase);
  let initialAvatarUrl: string | null | undefined;
  const initialNotificationUnread = { offer: 0, use: 0, neutral: 0 };
  if (initialUser) {
    const [{ data }, { data: unreadNotifications }] = await Promise.all([
      supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", initialUser.id)
        .maybeSingle(),
      supabase
        .from("notifications")
        .select("type")
        .eq("user_id", initialUser.id)
        .eq("read", false),
    ]);
    initialAvatarUrl = (data?.avatar_url as string | null | undefined) ?? null;
    for (const notification of unreadNotifications ?? []) {
      const context = notificationContext(notification.type as string);
      if (context === "professional") initialNotificationUnread.offer++;
      else if (context === "client") initialNotificationUnread.use++;
      else initialNotificationUnread.neutral++;
    }
  }

  return (
    <NextIntlClientProvider messages={messages}>
      <AuthProvider initialUser={initialUser} initialAvatarUrl={initialAvatarUrl} initialNotificationUnread={initialNotificationUnread}>
        <DocumentLocale locale={locale} />
        <EmojiBlocker />
        <ViewportEnvironment />
        <CustomCategoriesLoader />
        <NotificationLiveToast scope="all" />
        <OperationalStatusBanner locale={locale} status={operationalStatus} />
        {children}
        <BackToTop />
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
