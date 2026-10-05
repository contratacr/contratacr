import { redirect } from "next/navigation";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { getLocale } from "next-intl/server";
import { OfferFormConBorrador } from "@/components/offers/offer-form-con-borrador";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function PublishOfferPage({ searchParams }: { searchParams: Promise<{ from?: string; borrador?: string }> }) {
  const locale = await getLocale();
  const params = await searchParams;
  const fromPanel = params.from === "panel";
  const backHref = fromPanel ? "/dashboard/profesional?mode=offer&tab=offers" : "/promociones";
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const conBorrador = params.borrador === "1";
  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));
  // Sin sesión se puede llenar todo: al publicar se guarda y se pide entrar.
  if (!user) return <OfferFormConBorrador professionalId={null} serviceOptions={serviceOptions} backHref={backHref} conBorrador={false} />;
  const publishPath = `${prefijoDeIdioma(locale)}/promociones/publicar${fromPanel ? "?from=panel" : ""}${conBorrador ? `${fromPanel ? "&" : "?"}borrador=1` : ""}`;
  // Con la llave del servidor y el id ya verificado de la sesión: recién
  // convertida en profesional, la sesión de la cookie todavía es la vieja y
  // las reglas de acceso no le dejaban ver su propio perfil. El registro (que
  // sí lo ve) la devolvía aquí y esta página al registro, en bucle.
  const { data: professional } = await createAdminClient().from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  // Una cuenta sin perfil profesional lo crea y vuelve aquí, con el borrador.
  if (!professional) redirect(`${prefijoDeIdioma(locale)}/registro/profesional?redirect=${encodeURIComponent(publishPath)}`);
  return <OfferFormConBorrador professionalId={professional.id} serviceOptions={serviceOptions} backHref={backHref} conBorrador={conBorrador} />;
}
