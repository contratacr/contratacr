import type { Metadata } from "next";
import { metadatosDePantalla } from "@/lib/seo/alternates";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const en = locale === "en";
  return metadatosDePantalla({
    locale,
    ruta: "/categorias",
    titulo: en ? "Categories | ContrataCR" : "Categorías | ContrataCR",
    descripcion: en ? "Every business section and every professional service in Costa Rica, in one place." : "Todas las secciones de negocios y todos los servicios profesionales de Costa Rica, en un solo lugar.",
  });
}
