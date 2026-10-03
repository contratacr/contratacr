import { OG_TAMANO, OG_TIPO, fotoParaTarjeta, tarjetaDeFicha } from "@/lib/seo/tarjeta-de-ficha";
import { claveDeTramo, rangoDePrefijo } from "@/lib/marketplace-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslations } from "next-intl/server";

export const size = OG_TAMANO;
export const contentType = OG_TIPO;
export const revalidate = 3600;

type Fila = { id: string; title?: string | null; service_label?: string | null; location_label?: string | null; image_urls?: string[] | null; price_now?: number | null; price_before?: number | null; currency?: string | null };

async function cargar(tramo: string): Promise<Fila | null> {
  const clave = claveDeTramo(tramo);
  if (!clave.id && !clave.prefijo) return null;
  let consulta = createAdminClient().from("professional_offers").select("id, title, service_label, location_label, image_urls, price_now, price_before, currency").eq("status", "published");
  if (clave.id) consulta = consulta.eq("id", clave.id);
  else { const { desde, hasta } = rangoDePrefijo(clave.prefijo!); consulta = consulta.gte("id", desde).lte("id", hasta); }
  const { data } = await consulta.limit(1).maybeSingle();
  return (data as Fila | null) ?? null;
}

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "tarjetaSocial" });
  const fila = await cargar(id);
  const dinero = (n?: number | null) => (n ? `${fila?.currency === "USD" ? "$" : "₡"}${Math.round(n).toLocaleString("es-CR").replace(/\s/g, ".")}` : null);
  return tarjetaDeFicha({
    pie: t("pie"),
    etiqueta: t("promocion"),
    titulo: fila?.title ?? "ContrataCR",
    detalle: [fila?.service_label, fila?.location_label].filter(Boolean).join(" · "),
    imagen: fotoParaTarjeta(fila?.image_urls?.[0]),
    precio: dinero(fila?.price_now),
    precioAntes: fila?.price_before && fila.price_before > (fila.price_now ?? 0) ? dinero(fila.price_before) : null,
  });
}
