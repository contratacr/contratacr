import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";
import { paginaDeOrigen } from "@/lib/navigation/pagina-de-origen";
import { PublicarProyectoSinSesion } from "@/components/projects/publicar-proyecto-sin-sesion";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return { title: en ? "Post what you need · ContrataCR" : "Publique lo que necesita · ContrataCR", description: en ? "Tell us what you need and professionals contact you on WhatsApp. Free." : "Cuente qué necesita y los profesionales le contactan por WhatsApp. Gratis.", openGraph: {}, twitter: { card: "summary_large_image" as const } };
}


// El formulario es la propia ruta, también con sesión: no pasa por el panel.
export default async function PublicarProyectoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { returnTo } = await searchParams;
  const origen = rutaInternaSegura(typeof returnTo === "string" ? returnTo : null) ?? await paginaDeOrigen();
  const volverA = origen && !/^\/(?:en\/)?(?:publicar-solicitud|login|auth|registro)(?:[/?]|$)/.test(origen) ? origen : "/solicitudes";
  return <PublicarProyectoSinSesion volverA={volverA} />;
}
