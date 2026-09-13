import type { Metadata } from "next";
import { metadatosDePantalla } from "@/lib/seo/alternates";
import { MarketplaceSectionLayoutShell } from "@/components/marketplace/marketplace-section-layout-shell";

export default function OffersLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceSectionLayoutShell>{children}</MarketplaceSectionLayoutShell>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const en = locale === "en";
  return metadatosDePantalla({
    locale,
    ruta: "/ofertas",
    titulo: en ? 'Deals and promotions from professionals | ContrataCR' : 'Ofertas y promociones de profesionales | ContrataCR',
    descripcion: en ? 'Discounts and promotions published by verified professionals in Costa Rica. Use them before they expire.' : 'Descuentos y promociones publicadas por profesionales verificados en Costa Rica. Aprovéchalas antes de que venzan.',
  });
}
