import type { Metadata } from "next";
import { metadatosDePantalla } from "@/lib/seo/alternates";
import { MarketplaceSectionLayoutShell } from "@/components/marketplace/marketplace-section-layout-shell";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceSectionLayoutShell>{children}</MarketplaceSectionLayoutShell>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const en = locale === "en";
  return metadatosDePantalla({
    locale,
    ruta: "/empleos",
    titulo: en ? 'Jobs and vacancies | ContrataCR' : 'Empleos y vacantes | ContrataCR',
    descripcion: en ? 'Openings posted by professionals and companies in Costa Rica. Open the posting and message whoever published it on WhatsApp.' : 'Vacantes publicadas por profesionales y empresas de Costa Rica. Postúlate en línea con tu currículum.',
  });
}
