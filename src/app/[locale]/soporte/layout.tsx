import type { Metadata } from "next";
import { metadatosDePantalla } from "@/lib/seo/alternates";

// La página es de cliente y no puede declarar metadata: el título vive aquí.
// Sin él, la pestaña decía el título del sitio entero.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const en = locale === "en";
  return {
    ...metadatosDePantalla({
      locale,
      ruta: "/soporte",
      titulo: en ? "Support | ContrataCR" : "Soporte | ContrataCR",
      descripcion: en ? "Write to us and we reply in your panel or by email." : "Escríbenos y te respondemos desde tu panel o por correo.",
    }),
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
