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
      ruta: "/registro",
      titulo: en ? "Create account | ContrataCR" : "Crear cuenta | ContrataCR",
      descripcion: en ? "Create your client or professional account on ContrataCR." : "Crea tu cuenta de cliente o profesional en ContrataCR.",
    }),
    robots: { index: false, follow: true },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
