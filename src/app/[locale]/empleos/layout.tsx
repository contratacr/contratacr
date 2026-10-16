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
    tarjetaPropia: true,
    ruta: "/empleos",
    titulo: en ? 'Jobs and vacancies | ContrataCR' : 'Empleos y vacantes | ContrataCR',
    descripcion: en ? 'Browse job openings in Costa Rica and contact the person who posted them on WhatsApp.' : 'Explora vacantes en Costa Rica y contacta por WhatsApp a quien las publica.',
  });
}
