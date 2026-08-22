import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { ensureServerCategoryCatalog } from "@/lib/data/server-category-catalog";
import { routing } from "@/i18n/routing";
import { EmojiBlocker } from "@/components/util/emoji-blocker";
import { NotificationLiveToast } from "@/components/notifications/notification-live-toast";
import { CustomCategoriesLoader } from "@/lib/data/use-custom-categories";
import { ViewportEnvironment } from "@/components/util/viewport-environment";
import { DocumentLocale } from "@/components/util/document-locale";
import { OperationalStatusBanner } from "@/components/status/operational-status-banner";
import { getOperationalStatusBanner } from "@/lib/status/runtime-status";
import { AuthProvider } from "@/hooks/use-auth";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { notificationContext } from "@/lib/notification-link";
import { WhatsAppReviewFollowUp } from "@/components/reviews/whatsapp-review-followup";
import { PushTokenManager } from "@/components/push/push-token-manager";
import { AppResumeRecovery } from "@/components/util/app-resume-recovery";
import { MobileAppBridge } from "@/components/mobile/mobile-app-bridge";
import { NativeFirstRunOnboarding } from "@/components/mobile/native-first-run-onboarding";
import { AppIntlProvider } from "@/components/app-intl-provider";
import { GlobalActionLoading } from "@/components/global-action-loading";
import { GlobalDataRefresh } from "@/components/util/global-data-refresh";
import { RouteScrollReset } from "@/components/util/route-scroll-reset";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { AiConcierge } from "@/components/landing/ai-concierge";

type LocaleParams = {
  params: Promise<{ locale: string }>;
};

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1980721055914350";

function buildMetadata(locale: string): Metadata {
  const isEn = locale === "en";
  const title = isEn
    ? "ContrataCR: Service professionals in Costa Rica"
    : "ContrataCR: Profesionales de servicios en Costa Rica";
  const description = isEn
    ? "Find electricians, plumbers, painters, tutors and more verified professionals in your canton."
    : "Encuentra electricistas, plomeros, pintores, tutores y más profesionales verificados en tu cantón.";
  const socialDescription = isEn
    ? "Offer and find services in Costa Rica"
    : "Ofrece y encuentra servicios en Costa Rica";
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
        { url: "/favicon.ico?v=tab-tile-20260727", sizes: "any" },
        { url: "/favicon-96x96.png?v=tab-tile-20260727", type: "image/png", sizes: "96x96" },
      ],
      apple: [{ url: "/apple-touch-icon.png?v=apple-safe-color-20260727", sizes: "180x180" }],
      other: [
        {
          rel: "apple-touch-icon-precomposed",
          url: "/apple-touch-icon-precomposed.png?v=apple-safe-color-20260727",
          sizes: "180x180",
        },
      ],
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
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) await ensureServerCategoryCatalog();
  const operationalStatus = getOperationalStatusBanner(locale);
  const supabase = hasSupabaseServerConfig() ? await createClient() : null;
  const initialUser = supabase ? await safeGetUser(supabase) : null;
  let initialAvatarUrl: string | null | undefined;
  const initialNotificationUnread = { offer: 0, use: 0, neutral: 0 };
  if (supabase && initialUser) {
    try {
      const [{ data }, { data: unreadNotifications }] = await withPromiseTimeout(Promise.all([
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
      ]), 6_000, "layout-account-bootstrap-timeout");
      initialAvatarUrl = (data?.avatar_url as string | null | undefined) ?? null;
      for (const notification of unreadNotifications ?? []) {
        const context = notificationContext(notification.type as string);
        if (context === "professional") initialNotificationUnread.offer++;
        else if (context === "client") initialNotificationUnread.use++;
        else initialNotificationUnread.neutral++;
      }
    } catch (error) {
      // Rendering the destination is more important than optional navbar seed
      // data. The client provider reconciles avatar and counters afterwards.
      console.error("[locale-layout] account bootstrap timed out or failed", error);
    }
  }

  return (
    <AppIntlProvider messages={messages} locale={locale}>
      <GlobalActionLoading />
      <GlobalDataRefresh />
      <RouteScrollReset />
      <AuthProvider initialUser={initialUser} initialAvatarUrl={initialAvatarUrl} initialNotificationUnread={initialNotificationUnread}>
        <DocumentLocale locale={locale} />
        <EmojiBlocker />
        <ViewportEnvironment />
        <AppResumeRecovery />
        <MobileAppBridge />
        <NativeFirstRunOnboarding />
        <CustomCategoriesLoader />
        <NotificationLiveToast scope="all" />
        <OperationalStatusBanner locale={locale} status={operationalStatus} />
        <Suspense fallback={null}>
          <MetaPixel pixelId={META_PIXEL_ID} />
        </Suspense>
        <PushTokenManager />
        {children}
        <WhatsAppReviewFollowUp />
        <AiConcierge />
      </AuthProvider>
    </AppIntlProvider>
  );
}
