import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicQuote, type PublicQuoteData } from "@/components/quotes/public-quote";
import { proDisplayName } from "@/lib/utils";
import { enlacePerfil } from "@/lib/profile-url";
import { whatsappDigits, type Quote } from "@/lib/quotes";

/**
 * La cotización que recibe el cliente por WhatsApp: contratacr.com/cotizacion/<código>.
 * Se lee con la llave de servicio (el código es la llave) y no se indexa.
 */
type Props = { params: Promise<{ locale: string; code: string }> };

export const dynamic = "force-dynamic";

async function cargar(code: string): Promise<PublicQuoteData | null> {
  if (!/^[a-z0-9]{8,20}$/i.test(code)) return null;
  const admin = createAdminClient();
  const { data: q } = await admin.from("quotes")
    .select("id, professional_id, client_id, client_name, client_phone, public_code, booking_id, project_id, proposal_id, title, items, tax_mode, subtotal, tax_amount, total, notes, valid_until, status, accepted_at, declined_at, created_at")
    .eq("public_code", code.toLowerCase()).maybeSingle();
  if (!q) return null;
  const { data: pro } = await admin.from("professionals")
    .select("slug, business_name, whatsapp, verification_status, category_id, professions, profiles(full_name, avatar_url)")
    .eq("id", q.professional_id).maybeSingle();
  const perfil = (pro?.profiles ?? null) as { full_name?: string | null; avatar_url?: string | null } | null;
  const nombre = pro?.business_name?.trim() || proDisplayName(perfil?.full_name ?? "");
  return {
    quote: q as Quote,
    pro: {
      name: nombre,
      avatarUrl: perfil?.avatar_url ?? null,
      verified: pro?.verification_status === "verified",
      whatsapp: whatsappDigits(pro?.whatsapp ?? null),
      profileUrl: pro?.slug ? enlacePerfil(pro.slug) : null,
      categoryId: (pro?.professions?.[0] ?? pro?.category_id ?? null) as string | null,
    },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const datos = await cargar(code);
  const t = await getTranslations("quotes");
  return {
    title: datos ? t("publicMetaTitle", { name: datos.pro.name }) : t("publicNotFound"),
    robots: { index: false, follow: false },
  };
}

export default async function PublicQuotePage({ params }: Props) {
  const { locale, code } = await params;
  const datos = await cargar(code);
  return <PublicQuote locale={locale} data={datos} />;
}
