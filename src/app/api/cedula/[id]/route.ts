import { NextRequest, NextResponse } from "next/server";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { isValidId } from "@/lib/cedula";
import { enforceRateLimit } from "@/lib/rate-limit";

// Public pre-registration lookup: one identification per request, rate limited.
// Returns only the name/type, never Hacienda tax status or activities.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = enforceRateLimit(req, "cedula", 20, 60_000);
  if (rl) { rl.headers.set("Cache-Control", "no-store"); return rl; }

  const { id } = await params;
  const cedula = id.replace(/[\s-]/g, "");

  if (!/^[\d\s-]+$/.test(id) || !cedula) {
    return NextResponse.json({ found: false, error: "Formato inválido" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!isValidId(cedula)) {
    return NextResponse.json(
      {
        found: false,
        error:
          "Formato inválido. Cédula CR: 9 dígitos (inicia en 1-9). DIMEX: 11-12 dígitos. Jurídica o NITE: 10 dígitos.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await getIdentityVerifier().lookup(cedula);

  if (result.unavailable) {
    return NextResponse.json(
      {
        found: false,
        unavailable: true,
        error: "No pudimos consultar Hacienda en este momento. Intenta nuevamente más tarde.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (result.found && result.fullName) {
    return NextResponse.json({
      found: true,
      fullName: result.fullName,
      dob: result.dob,
      isAdult: result.isAdult,
      source: result.provider,
      idType: result.idType,
      review: result.idType === "juridica",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  // Not in the Hacienda (DIMEX/NITE/foreigners, newly issued, stale roll) → manual
  // entry + pendiente de revisión downstream. Never invent a name.
  return NextResponse.json(
    { found: false, error: "No encontramos esta identificación en Hacienda. Puedes solicitar revisión manual desde Verificación." },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}
