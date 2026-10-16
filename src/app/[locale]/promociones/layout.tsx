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
    tarjetaPropia: true,
    ruta: "/promociones",
    titulo: en ? 'Promotions from professionals | ContrataCR' : 'Promociones de profesionales | ContrataCR',
    descripcion: en ? 'Explore service offers in Costa Rica and contact the professional on WhatsApp.' : 'Descubre ofertas de servicios en Costa Rica y contacta al profesional por WhatsApp.',
  });
}
