"use client";

import { Navbar } from "@/components/layout/navbar";
import { Skeleton } from "@/components/ui/content-loading";
import { useNativeApp } from "@/hooks/use-native-app";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

function DashboardLoadingNotice({ title, description }: { title?: string; description?: string }) {
  const t = useTranslations("loading");
  return (
    <div className="ccr-delayed-loading flex min-h-[45vh] flex-col items-center justify-center gap-3 px-6 text-center" aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
      <div>
        <p className="text-sm font-extrabold text-[#162543]">{title ?? t("panel")}</p>
        {description && <p className="mt-1 text-xs font-medium text-[#6b7280]">{description}</p>}
      </div>
    </div>
  );
}

export function DashboardRouteLoading({ title, description }: { title?: string; description?: string } = {}) {
  const nativeApp = useNativeApp();
  if (nativeApp) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fa]" aria-busy="true">
        <DashboardLoadingNotice title={title} description={description} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true">
      <Navbar />
      <main>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:px-8">
          <DashboardLoadingNotice title={title} description={description} />
        </div>
      </main>
    </div>
  );
}
