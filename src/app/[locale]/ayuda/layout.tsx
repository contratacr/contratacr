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
    ruta: "/ayuda",
    titulo: en ? 'Help center | ContrataCR' : 'Centro de ayuda | ContrataCR',
    descripcion: en ? 'Answers about finding professionals, posting projects, requesting quotes and getting paid for your services in Costa Rica.' : 'Respuestas a las dudas más comunes sobre buscar profesionales, publicar proyectos, pedir cotizaciones y cobrar por tus servicios en Costa Rica.',
  });
}
