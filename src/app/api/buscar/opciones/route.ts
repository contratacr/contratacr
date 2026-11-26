import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { opcionesDeFiltro } from "@/lib/search/opciones-de-filtro";

// Los idiomas y aseguradoras que tienen al menos un profesional publicado, para
// que los filtros de /buscar no ofrezcan opciones que no devuelven a nadie. Es
// información pública y sale del cache de 10 minutos, no de una consulta por visita.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limitado = await enforceRateLimit(request, "buscar-opciones", 60, 60_000);
  if (limitado) return limitado;
  try {
    const opciones = await opcionesDeFiltro();
    return NextResponse.json(opciones, { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } });
  } catch {
    // Sin respuesta el filtro vuelve a ofrecer la lista completa, no se rompe.
    return NextResponse.json({ error: "No disponible" }, { status: 503 });
  }
}
