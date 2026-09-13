import type { Metadata } from "next";
import { metadatosDePantalla } from "@/lib/seo/alternates";

// La página es de cliente, así que sus metadatos viven aquí: sin ellos Google
// mostraba el título genérico del sitio para todas estas pantallas.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const en = locale === "en";
  return metadatosDePantalla({
    locale,
    ruta: "/servicios",
    titulo: en ? 'All services | ContrataCR' : 'Todos los servicios | ContrataCR',
    descripcion: en ? 'Browse every trade and service available in Costa Rica: plumbing, electrical, health, beauty, construction and more.' : 'Explora todos los oficios y servicios disponibles en Costa Rica: plomería, electricidad, salud, belleza, construcción y más.',
  });
}
