import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { OfferForm } from "@/components/offers/offer-form";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditOfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const locale = await getLocale();
  const { id } = await params;
  const query = await searchParams;
  const fromPanel = query.from === "panel";
  const editPath = `/${locale}/ofertas/${id}/editar${fromPanel ? "?from=panel" : ""}`;
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(editPath)}`);
  const { data: professional } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) redirect(`/${locale}/dashboard/profesional?mode=offer`);
  const { data: offer } = await supabase.from("professional_offers").select("*").eq("id", id).eq("professional_id", professional.id).maybeSingle();
  if (!offer) notFound();
  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));
  if (offer.service_category_id && !serviceOptions.some((option) => option.value === offer.service_category_id)) {
    serviceOptions.unshift({ value: offer.service_category_id, label: offer.service_label ? String(offer.service_label) : getCategoryLabel(offer.service_category_id, locale) });
  }
  return <OfferForm professionalId={professional.id} serviceOptions={serviceOptions} initialOffer={offer} backHref={fromPanel ? "/dashboard/profesional?mode=offer&tab=offers" : `/ofertas/${id}`} />;
}