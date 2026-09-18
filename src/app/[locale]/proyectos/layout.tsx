import type { Metadata } from "next";
import { metadatosDePantalla } from "@/lib/seo/alternates";
import { MarketplaceSectionLayoutShell } from "@/components/marketplace/marketplace-section-layout-shell";

export default function ProyectosLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceSectionLayoutShell>{children}</MarketplaceSectionLayoutShell>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const en = locale === "en";
  return metadatosDePantalla({
    locale,
    ruta: "/proyectos",
    titulo: en ? "Projects clients need | ContrataCR" : "Proyectos que la gente necesita | ContrataCR",
    descripcion: en
      ? "Work posted by clients across Costa Rica. Read the brief and message them on WhatsApp."
      : "Trabajos publicados por clientes de todo Costa Rica. Leé lo que necesitan y escribiles por WhatsApp.",
  });
}
