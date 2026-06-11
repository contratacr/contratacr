import { NextRequest, NextResponse } from "next/server";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { isValidId } from "@/lib/cedula";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/cedula/[id]
// Looks up a cédula in the self-hosted TSE padrón (the source of truth) and
// returns the OFFICIAL full name for the user to confirm. This powers the
// auto-fill + confirm verification flow.
//
// PRIVACY: this returns a person's official name, so it is gated to
// AUTHENTICATED users only and rate-limited per IP — it must not be an open
// name-by-cédula lookup that anyone can scrape/enumerate. All callers (booking
// + registration identity confirm) already have a session.
//
// INTEGRITY GUARD: there is NO permissive fallback. A cédula that is not in the
// padrón returns { found: false } (404) — it must never resolve to a name and so
// can never be auto-verified.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = enforceRateLimit(req, "cedula", 20, 60_000);
  if (rl) return rl;

  const user = await safeGetUser(await createClient());
  if (!user) return NextResponse.json({ found: false, error: "No autorizado" }, { status: 401 });

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
    // dob is null for the padrón (electoral roll has no birth date); isAdult is
    // true because the roll only contains citizens 18+.
    return NextResponse.json({
      found: true,
      fullName: result.fullName,
      dob: result.dob,
      isAdult: result.isAdult,
      source: result.provider,
    });
  }

  // Not in the padrón (DIMEX/NITE/foreigners, newly issued, stale roll) → manual
  // entry + pendiente de revisión downstream. Never invent a name.
  return NextResponse.json(
    { found: false, error: "Cédula no encontrada en el padrón." },
    { status: 404 }
  );
}
