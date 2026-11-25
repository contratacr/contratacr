import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllAdminRows } from "@/lib/admin/read-all-rows";
import { languageOfficialId } from "@/lib/data/languages";
import { OTRA_ASEGURADORA, OTRO_IDIOMA } from "@/lib/data/otros-valores";

// QUÉ OFRECEN LOS FILTROS DE IDIOMA Y ASEGURADORA. Solo lo que tiene al menos un
// profesional publicado (el mismo criterio que la búsqueda: no baneado, no oculto
// del buscador y no rechazado). Todo lo demás sigue pudiéndose elegir en el
// perfil, pero no se ofrece como filtro porque no devolvería a nadie. Si alguien
// elige uno nuevo, aparece solo cuando se renueva el cache. Los textos escritos a
// mano («otro:», «otra:») nunca llegan aquí.
export type OpcionesDeFiltro = { languages: string[]; insurers: string[] };

const SEGUNDOS_DE_CACHE = 600;

async function leerOpciones(): Promise<OpcionesDeFiltro> {
  const db = createAdminClient();
  const { data, error } = await readAllAdminRows<{ id: string; languages: string[] | null; insurance_networks: string[] | null }>(
    (from, to) => db
      .from("professionals")
      .select("id, languages, insurance_networks")
      .eq("is_banned", false)
      .eq("oculto_del_buscador", false)
      .neq("verification_status", "rejected")
      .order("id")
      .range(from, to),
  );
  if (error || !data) throw new Error("No se pudieron leer las opciones del filtro");

  const idiomas = new Set<string>();
  const aseguradoras = new Set<string>();
  for (const fila of data) {
    // Quien no marcó nada habla español (así lo muestra la búsqueda).
    const lista = Array.isArray(fila.languages) && fila.languages.length > 0 ? fila.languages : ["es"];
    for (const valor of lista) {
      const oficial = languageOfficialId(String(valor));
      if (oficial) idiomas.add(oficial);
    }
    for (const id of fila.insurance_networks ?? []) {
      if (typeof id === "string" && !id.startsWith(OTRA_ASEGURADORA) && !id.startsWith(OTRO_IDIOMA)) aseguradoras.add(id);
    }
  }
  return { languages: Array.from(idiomas), insurers: Array.from(aseguradoras) };
}

const leerOpcionesEnCache = unstable_cache(leerOpciones, ["opciones-de-filtro-v1"], {
  revalidate: SEGUNDOS_DE_CACHE,
  tags: ["public-professionals"],
});

export async function opcionesDeFiltro(): Promise<OpcionesDeFiltro> {
  return leerOpcionesEnCache();
}
