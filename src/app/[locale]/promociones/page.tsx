import { OffersBoard } from "@/components/offers/offers-board";
import { type ProfessionalOffer } from "@/lib/offers";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { getLocale } from "next-intl/server";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { crTodayISO } from "@/lib/time-cr";
import { contactFlagsFor, profesionalesBloqueados } from "@/lib/contact-flags";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const locale = await getLocale();
  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));

  if (!hasSupabaseServerConfig()) {
    return <OffersBoard offers={[]} canPost={false} currentProfessionalId={null} currentUserId={null} serviceOptions={serviceOptions} />;
  }

  try {
    return await OffersPageContent(serviceOptions);
  } catch (error) {
    console.error("Could not initialize offers page", error);
    return <OffersBoard offers={[]} canPost={false} currentProfessionalId={null} currentUserId={null} serviceOptions={serviceOptions} />;
  }
}

async function OffersPageContent(serviceOptions: Array<{ value: string; label: string }>) {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const today = crTodayISO();
  // A la página NO baja ningún número ni correo, solo banderas (ver
  // contactFlagsFor). Antes las columnas de contacto se ocultaban al invitado,
  // y con eso el invitado se quedaba sin NINGÚN botón de contacto.
  const professionalColumns = "slug,business_name,profiles(full_name)";
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

  if (offersError) {
    console.error("Could not load published offers", offersError.message);
  }

  const idsProfesionales = ((data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.professional_id ?? ""));
  const [banderas, bloqueados] = await Promise.all([contactFlagsFor(idsProfesionales), profesionalesBloqueados(idsProfesionales)]);

  const offers = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => !bloqueados.has(String(row.professional_id ?? "")))
    .map((row) => {
    const professional = row.professionals as { slug?: string; business_name?: string; profiles?: { full_name?: string } | null } | null;
    return {
      ...row,
      title: repairVisibleText(String(row.title ?? "")),
      description: repairVisibleText(String(row.description ?? "")),
      service_label: row.service_label ? repairVisibleText(String(row.service_label)) : null,
      location_label: row.location_label ? repairVisibleText(String(row.location_label)) : null,
      image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
      professional_name: repairVisibleText(professional?.business_name || professional?.profiles?.full_name || "Profesional en ContrataCR"),
      professional_slug: professional?.slug ?? null,
      // El WhatsApp propio de la promoción manda sobre el de la cuenta.
      professional_has_whatsapp: !!String(row.contact_whatsapp ?? "").trim() || !!banderas[String(row.professional_id ?? "")]?.hasWhatsapp,
      professional_allow_phone_call: !!banderas[String(row.professional_id ?? "")]?.allowPhoneCall,
    } as ProfessionalOffer;
  });

  return <OffersBoard offers={offers} canPost={!!professional} currentProfessionalId={professional?.id ?? null} currentUserId={user?.id ?? null} serviceOptions={serviceOptions} />;
}
