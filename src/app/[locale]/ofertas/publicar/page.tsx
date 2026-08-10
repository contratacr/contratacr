import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { OfferForm } from "@/components/offers/offer-form";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function PublishOfferPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const locale = await getLocale();
  const params = await searchParams;
  const fromPanel = params.from === "panel";
  const backHref = fromPanel ? "/dashboard/profesional?mode=offer&tab=offers" : "/ofertas";
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const publishPath = `/${locale}/ofertas/publicar${fromPanel ? "?from=panel" : ""}`;
  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(publishPath)}`);
  const { data: professional } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) redirect(`/${locale}/dashboard/profesional?mode=offer`);
  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));
  return <OfferForm professionalId={professional.id} serviceOptions={serviceOptions} backHref={backHref} />;
}
