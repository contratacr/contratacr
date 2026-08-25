import { NextResponse } from "next/server";
import { locationDecisions, resolveSearchResults, RESULTS_PER_PAGE, type SearchPageParams } from "@/lib/search/query-core";

// The next slice of a /buscar search, so the list can keep growing as the
// person scrolls instead of paging. It resolves the URL exactly like the page
// does (same module), so the order and the filters can never differ.

export const dynamic = "force-dynamic";

const ALLOWED = new Set<keyof SearchPageParams>([
  "categoria", "provincia", "canton", "sortBy", "q", "aseguradora", "idioma",
  "precio", "unidadPrecio", "modalidad", "lat", "lng", "ubicacion", "n", "s", "e", "w", "regression",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(RESULTS_PER_PAGE, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? String(RESULTS_PER_PAGE), 10) || RESULTS_PER_PAGE));
  const params: SearchPageParams = {};
  for (const key of ALLOWED) {
    const value = url.searchParams.get(key);
    if (value) (params as Record<string, string>)[key] = value;
  }

  try {
    const { filters, ordered } = await resolveSearchResults(params);
    const decisions = locationDecisions(params, filters);
    const slice = ordered.slice(offset, offset + limit);
    return NextResponse.json({
      total: ordered.length,
      offset,
      professionals: slice.map((professional) => ({
        professional,
        forceContactOnly: decisions.shouldShowContactOnly(professional),
        preferVideo: decisions.shouldPreferVideoLocation(professional),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[buscar/results] failed", error);
    return NextResponse.json({ error: "No se pudieron cargar más resultados." }, { status: 500 });
  }
}
