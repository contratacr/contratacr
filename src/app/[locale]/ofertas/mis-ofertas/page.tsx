import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { OffersManager } from "@/components/offers/offers-manager";
import { type ProfessionalOffer } from "@/lib/offers";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { repairVisibleText } from "@/lib/text/repair-visible-text";

export const dynamic = "force-dynamic";

export default async function MyOffersPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(`/${locale}/ofertas/mis-ofertas`)}`);
  const { data: professional } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) redirect(`/${locale}/ofertas`);
  const { data } = await supabase.from("professional_offers").select("*").eq("professional_id", professional.id).order("created_at", { ascending: false });
  const offers = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    title: repairVisibleText(String(row.title ?? "")),
    description: repairVisibleText(String(row.description ?? "")),
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
  })) as ProfessionalOffer[];
  return <OffersManager initialOffers={offers} />;
}
