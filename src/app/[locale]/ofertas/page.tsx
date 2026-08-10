import { OffersBoard } from "@/components/offers/offers-board";
import { type ProfessionalOffer } from "@/lib/offers";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { getLocale } from "next-intl/server";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { crTodayISO } from "@/lib/time-cr";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const today = crTodayISO();
  const professionalColumns = user
    ? "slug,business_name,whatsapp,allow_phone_call,call_phone,contact_email,profiles(full_name)"
    : "slug,business_name,profiles(full_name)";
  const [{ data, error: offersError }, { data: professional }] = await Promise.all([
    supabase
      .from("professional_offers")
      .select(`*, professionals!professional_offers_professional_id_fkey(${professionalColumns})`)
      .eq("status", "published")
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(100),
    user ? supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (offersError) throw offersError;

  const offers = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const professional = row.professionals as { slug?: string; business_name?: string; whatsapp?: string | null; allow_phone_call?: boolean | null; call_phone?: string | null; contact_email?: string | null; profiles?: { full_name?: string } | null } | null;
    return {
      ...row,
      title: repairVisibleText(String(row.title ?? "")),
      description: repairVisibleText(String(row.description ?? "")),
      service_label: row.service_label ? repairVisibleText(String(row.service_label)) : null,
      location_label: row.location_label ? repairVisibleText(String(row.location_label)) : null,
      image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
      professional_name: repairVisibleText(professional?.business_name || professional?.profiles?.full_name || "Profesional en ContrataCR"),
      professional_slug: professional?.slug ?? null,
      professional_whatsapp: professional?.whatsapp ?? null,
      professional_allow_phone_call: professional?.allow_phone_call ?? false,
      professional_call_phone: professional?.call_phone ?? null,
      professional_contact_email: professional?.contact_email ?? null,
    } as ProfessionalOffer;
  });

  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));

  return <OffersBoard offers={offers} canPost={!!professional} currentProfessionalId={professional?.id ?? null} currentUserId={user?.id ?? null} serviceOptions={serviceOptions} />;
}
