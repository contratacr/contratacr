"use client";

import { useEffect, useMemo, useState } from "react";
import { OffersManager } from "@/components/offers/offers-manager";
import { createClient } from "@/lib/supabase/client";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import type { ProfessionalOffer } from "@/lib/offers";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { useLocale } from "next-intl";
import { PanelListSkeleton } from "@/components/ui/content-loading";

export function OffersPanel({ professionalId }: { professionalId: string }) {
  const locale = useLocale();
  const [offers, setOffers] = useState<ProfessionalOffer[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void createClient()
      .from("professional_offers")
      .select("*")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          ...row,
          title: repairVisibleText(String(row.title ?? "")),
          description: repairVisibleText(String(row.description ?? "")),
          image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
        })) as ProfessionalOffer[];
        setOffers(rows);
      });
    return () => {
      active = false;
    };
  }, [professionalId, refreshKey]);

  const serviceOptions = useMemo(() => getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) })), [locale]);

  if (!offers) {
    return <PanelListSkeleton rows={2} />;
  }

  return <OffersManager initialOffers={offers} professionalId={professionalId} serviceOptions={serviceOptions} embedded onRefresh={() => setRefreshKey((key) => key + 1)} />;
}
