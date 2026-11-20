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
      ruta: "/login",
      titulo: en ? "Sign in | ContrataCR" : "Ingresar | ContrataCR",
      descripcion: en ? "Sign in to your ContrataCR account." : "Entra a tu cuenta de ContrataCR.",
    }),
    robots: { index: false, follow: true },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
