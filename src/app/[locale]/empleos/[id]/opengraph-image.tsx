import { OG_TAMANO, OG_TIPO, tarjetaDeFicha } from "@/lib/seo/tarjeta-de-ficha";
import { claveDeTramo, rangoDePrefijo } from "@/lib/marketplace-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslations } from "next-intl/server";

export const size = OG_TAMANO;
export const contentType = OG_TIPO;
export const revalidate = 3600;

type Fila = { id: string; title?: string | null; location_label?: string | null };

async function cargar(tramo: string): Promise<Fila | null> {
  const clave = claveDeTramo(tramo);
  if (!clave.id && !clave.prefijo) return null;
  let consulta = createAdminClient().from("job_posts").select("id, title, location_label").eq("status", "published");
  if (clave.id) consulta = consulta.eq("id", clave.id);
  else { const { desde, hasta } = rangoDePrefijo(clave.prefijo!); consulta = consulta.gte("id", desde).lte("id", hasta); }
  const { data } = await consulta.limit(1).maybeSingle();
  return (data as Fila | null) ?? null;
}

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "tarjetaSocial" });
  const fila = await cargar(id);
  return tarjetaDeFicha({
    pie: t("pie"),
    etiqueta: t("empleo"),
    titulo: fila?.title ?? "ContrataCR",
    detalle: fila?.location_label ?? "",
  });
}
