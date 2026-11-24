import { redirect } from "next/navigation";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { MoreCategories } from "@/components/directory/more-categories";

// With the directory on this is the "Más categorías" screen of the app home; with it off it keeps redirecting to /servicios.
export default async function CategoriasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (sitemapSections().length === 0) redirect(`${prefijoDeIdioma(locale)}/servicios`);
  return <MoreCategories variant="page" />;
}
