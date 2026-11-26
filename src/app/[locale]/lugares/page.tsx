import { permanentRedirect } from "next/navigation";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";

// There is no separate "lugares" world any more (owner decision 2026-11-22): the Categorías page lists businesses and
// professionals together. The old address keeps working (SEO-safe permanent redirect).
export const dynamic = "force-dynamic";

export default async function PlacesHubRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect(rutaConIdioma(locale, "/categorias"));
}
