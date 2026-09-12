"use client";

import { useMemo } from "react";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { OffersManager } from "@/components/offers/offers-manager";
import { createClient } from "@/lib/supabase/client";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import type { ProfessionalOffer } from "@/lib/offers";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { useLocale } from "next-intl";
import { PanelListSkeleton } from "@/components/ui/content-loading";

const SIN_OFERTAS: ProfessionalOffer[] = [];

// Caché de sesión: al volver a la sección se pinta lo último que se vio y la
// consulta se repite por detrás, igual que en Empleos. Antes cada entrada
// arrancaba de cero y mostraba el esqueleto aunque no hubiera nada nuevo.
export function OffersPanel({ professionalId }: { professionalId: string }) {
  const locale = useLocale();
  const { data: offers, loading, refresh } = useCachedResource<ProfessionalOffer[]>(
    `dashboard:offers:${professionalId}`,
    () => cargarOfertas(professionalId),
    SIN_OFERTAS,
  );
  const serviceOptions = useMemo(() => getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) })), [locale]);
  if (loading) {
    return <PanelListSkeleton rows={2} />;
  }
  return <OffersManager initialOffers={offers} professionalId={professionalId} serviceOptions={serviceOptions} embedded onRefresh={() => void refresh()} />;
}

async function cargarOfertas(professionalId: string): Promise<ProfessionalOffer[]> {
  const { data } = await createClient()
    .from("professional_offers")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    title: repairVisibleText(String(row.title ?? "")),
    description: repairVisibleText(String(row.description ?? "")),
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
  })) as ProfessionalOffer[];
}
