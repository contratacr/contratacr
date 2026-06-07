import { NextRequest, NextResponse } from "next/server";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { isValidId } from "@/lib/cedula";

// GET /api/cedula/[id]
// Looks up a cédula in the self-hosted TSE padrón (the source of truth) and
// returns the OFFICIAL full name for the user to confirm. This powers the
// auto-fill + confirm verification flow.
//
// INTEGRITY GUARD: there is NO permissive fallback. A cédula that is not in the
// padrón returns { found: false } (404) — it must never resolve to a name and so
// can never be auto-verified.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cedula = id.replace(/\D/g, "");

  if (!cedula) {
    return NextResponse.json({ found: false, error: "Formato inválido" }, { status: 400 });
  }
  if (!isValidId(cedula)) {
    return NextResponse.json(
      {
        found: false,
        error:
          "Formato inválido. Cédula CR: 9 dígitos (inicia en 1-9). DIMEX: 11-12 dígitos. NITE: 10 dígitos.",
      },
      { status: 400 }
    );
  }

  const result = await getIdentityVerifier().lookup(cedula);

  if (result.found && result.fullName) {
    return NextResponse.json({ found: true, fullName: result.fullName, source: result.provider });
  }

  // Not in the padrón (DIMEX/NITE/foreigners, newly issued, stale roll) → manual
  // entry + pendiente de revisión downstream. Never invent a name.
  return NextResponse.json(
    { found: false, error: "Cédula no encontrada en el padrón." },
    { status: 404 }
  );
}
