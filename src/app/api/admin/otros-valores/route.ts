import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllAdminRows } from "@/lib/admin/read-all-rows";
import { OTRA_ASEGURADORA, OTRO_IDIOMA, esValorLibre, textoDeValorLibre } from "@/lib/data/otros-valores";

// GET /api/admin/otros-valores — idiomas y aseguradoras que los profesionales
// escribieron a mano («otro:» / «otra:»), agrupados, con cuántas personas los
// tienen y un perfil de ejemplo. Sirve para decidir si pasan a la lista oficial.
// Solo para administradores.
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await readAllAdminRows<{ id: string; slug: string | null; business_name: string | null; languages: string[] | null; insurance_networks: string[] | null }>(
    (from, to) => db
      .from("professionals")
      .select("id, slug, business_name, languages, insurance_networks")
      .order("id")
      .range(from, to),
  );
  if (error) return NextResponse.json({ error: "No se pudo cargar la lista completa." }, { status: 500 });

  type Grupo = { texto: string; cantidad: number; ejemplo: { slug: string | null; nombre: string | null } };
  const agrupar = (valores: (row: (typeof data extends (infer R)[] | null ? R : never)) => string[], prefijo: string) => {
    const mapa = new Map<string, Grupo>();
    for (const fila of data ?? []) {
      for (const valor of valores(fila)) {
        if (!esValorLibre(valor, prefijo)) continue;
        const texto = textoDeValorLibre(valor, prefijo);
        const clave = texto.toLowerCase();
        const actual = mapa.get(clave);
        if (actual) actual.cantidad += 1;
        else mapa.set(clave, { texto, cantidad: 1, ejemplo: { slug: fila.slug, nombre: fila.business_name } });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => b.cantidad - a.cantidad || a.texto.localeCompare(b.texto));
  };

  return NextResponse.json({
    idiomas: agrupar((f) => f.languages ?? [], OTRO_IDIOMA),
    aseguradoras: agrupar((f) => f.insurance_networks ?? [], OTRA_ASEGURADORA),
  });
}
