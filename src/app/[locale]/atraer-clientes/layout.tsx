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
    ruta: "/atraer-clientes",
    titulo: en ? 'How to attract more clients | ContrataCR' : 'Cómo atraer más clientes | ContrataCR',
    descripcion: en ? 'A practical guide for professionals in Costa Rica: complete your profile, earn reviews and rank first in searches.' : 'Guía práctica para profesionales en Costa Rica: cómo completar tu perfil, conseguir reseñas y aparecer de primero en las búsquedas.',
  });
}
