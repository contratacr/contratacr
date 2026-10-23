"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/content-loading";
import { ResolvedContactAvailabilityProvider, useProfesionalConApp } from "@/hooks/use-profesional-con-app";

/** Loading belongs to the whole result, including saved/contact actions. */
export function SearchCardContactBoundary({ professionalId, children }: { professionalId: string; children: ReactNode }) {
  const channel = useProfesionalConApp(professionalId, true);
  const t = useTranslations("search");
  if (channel === null) {
    return (
      <div data-search-card-loading role="status" aria-busy="true" aria-label={t("pagination.loadingMore")}>
        <ProfessionalCardSkeleton />
      </div>
    );
  }
  return (
    <ResolvedContactAvailabilityProvider professionalId={professionalId} value={channel}>
      {children}
    </ResolvedContactAvailabilityProvider>
  );
}

export function ProfessionalCardSkeleton() {
  return (
    <div className="w-full bg-white px-4 py-3 lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:p-4" aria-hidden>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_216px] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_292px] xl:gap-5">
        <div className="min-w-0 space-y-2.5">
          <div className="flex items-start gap-3">
            <Skeleton immediate className="h-[52px] w-[52px] shrink-0 rounded-full lg:h-16 lg:w-16" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton immediate className="h-5 w-2/3 rounded" />
              <Skeleton immediate className="h-4 w-1/2 rounded" />
              <Skeleton immediate className="h-4 w-1/3 rounded" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Skeleton immediate className="h-4 w-1/2 rounded" />
            <Skeleton immediate className="h-4 w-1/4 rounded" />
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:border-l lg:border-[#e5e7eb] lg:pt-6 lg:pl-4">
          <Skeleton immediate className="h-11 w-full rounded-full" />
          <Skeleton immediate className="h-11 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
