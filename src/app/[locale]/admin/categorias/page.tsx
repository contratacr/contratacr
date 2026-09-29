import { redirect } from "next/navigation";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesRedirectPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${prefijoDeIdioma(locale)}/admin/servicios`);
}
