import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicQuote, type PublicQuoteData } from "@/components/quotes/public-quote";
import { proDisplayName } from "@/lib/utils";
import { enlacePerfil } from "@/lib/profile-url";
import { codigoDeEnlace, whatsappDigits, type Quote } from "@/lib/quotes";
import { getCategoryGroupId, getCategoryGroupLabel, getCategoryLabel } from "@/lib/data/categories";

/**
 * La cotización que recibe el cliente por WhatsApp: contratacr.com/cotizacion/<código>.
 * Se lee con la llave de servicio (el código es la llave) y no se indexa.
 */
type Props = { params: Promise<{ locale: string; code: string }> };

export const dynamic = "force-dynamic";

// Bajo el nombre va lo que ES (misma regla que la cabecera del perfil): con un
// solo oficio, el oficio; con varios del mismo rubro, el rubro; si no, nada.
function oficioDe(professions: string[] | null | undefined, categoryId: string | null | undefined, locale: string) {
  const oficios = professions?.length ? professions : (categoryId ? [categoryId] : []);
  if (oficios.length === 1) return getCategoryLabel(oficios[0], locale);
  const grupos = new Set(oficios.map((id) => getCategoryGroupId(id)).filter(Boolean) as string[]);
  return grupos.size === 1 ? getCategoryGroupLabel([...grupos][0], locale) : "";
}

async function cargar(tramo: string, locale: string): Promise<PublicQuoteData | null> {
  // El enlace es "sg-solutions-0003-k7m2xq9a"; la llave es lo último. Los
  // enlaces viejos, que eran solo el código, siguen funcionando.
  const code = codigoDeEnlace(tramo);
  if (!/^[a-z0-9]{8,20}$/i.test(code)) return null;
  const admin = createAdminClient();
  const { data: q } = await admin.from("quotes")
    .select("id, professional_id, client_id, client_name, client_phone, public_code, booking_id, project_id, proposal_id, title, items, tax_mode, subtotal, tax_amount, total, notes, valid_until, status, accepted_at, declined_at, created_at")
    .eq("public_code", code.toLowerCase()).is("deleted_at", null).maybeSingle();
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
      oficio: oficioDe(pro?.professions as string[] | null, pro?.category_id as string | null, locale),
    },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const datos = await cargar(code, locale);
  const t = await getTranslations("quotes");
  return {
    title: datos ? t("publicMetaTitle", { name: datos.pro.name }) : t("publicNotFound"),
    robots: { index: false, follow: false },
  };
}

export default async function PublicQuotePage({ params }: Props) {
  const { locale, code } = await params;
  const datos = await cargar(code, locale);
  return <PublicQuote locale={locale} data={datos} />;
}
