import { redirect } from "next/navigation";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import ServiciosPage from "../servicios/page";

// Directory on (test, owner 2026-11-26): the catalog page is called Categorías and lives here (/servicios answers a
// redirect in the middleware). Directory off (production): it keeps redirecting to /servicios.
export default async function CategoriasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (sitemapSections().length === 0) redirect(`${prefijoDeIdioma(locale)}/servicios`);
  return <ServiciosPage />;
}
