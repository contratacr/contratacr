import { OG_TAMANO, OG_TIPO, tarjetaDeFicha } from "@/lib/seo/tarjeta-de-ficha";
import { claveDeTramo, rangoDePrefijo } from "@/lib/marketplace-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslations } from "next-intl/server";

export const size = OG_TAMANO;
export const contentType = OG_TIPO;
export const revalidate = 3600;

type Fila = { id: string; title?: string | null; location_label?: string | null; salary_min?: number | null; salary_max?: number | null; currency?: string | null; show_salary?: boolean | null };

async function cargar(tramo: string): Promise<Fila | null> {
  const clave = claveDeTramo(tramo);
  if (!clave.id && !clave.prefijo) return null;
  let consulta = createAdminClient().from("job_posts").select("id, title, location_label, salary_min, salary_max, currency, show_salary").eq("status", "published");
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
    precio: salario(fila),
  });
}

// El salario solo si quien publicó decidió mostrarlo.
function salario(fila: Fila | null): string | null {
  if (!fila?.show_salary || !(fila.salary_min || fila.salary_max)) return null;
  const s = fila.currency === "USD" ? "$" : "₡";
  const f = (n: number) => `${s}${Math.round(n).toLocaleString("es-CR").replace(/\s/g, ".")}`;
  if (fila.salary_min && fila.salary_max && fila.salary_max !== fila.salary_min) return `${f(fila.salary_min)} – ${f(fila.salary_max)}`;
  return f((fila.salary_min || fila.salary_max)!);
}
