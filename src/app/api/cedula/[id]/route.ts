import { NextRequest, NextResponse } from "next/server";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { isValidId } from "@/lib/cedula";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/cedula/[id]
// Looks up a cédula in the self-hosted TSE padrón (the source of truth) and
// returns the OFFICIAL full name for the user to CONFIRM. Powers the
// auto-fill + confirm verification flow.
//
// AUTH — intentionally NOT session-gated. The primary caller is professional
// registration (email/password): the lookup runs at step 0, BEFORE the account
// exists, so there is no session yet. A prior RLS-hardening pass gated this
// route to authenticated users, which made EVERY registration lookup return 401
// and showed valid people "cédula no encontrada" — the exact regression this
// reverts. (Do NOT re-add an auth gate here; see WARNING in contratacr-context.md.)
//
// PRIVACY is preserved a different way: the padrón TABLE stays private — it is
// read ONLY server-side via the SECURITY DEFINER `padron_lookup` RPC
// (service-role), never exposed to the client. Abuse is bounded by a per-IP rate
// limit; the endpoint returns at most ONE name for ONE valid-format cédula (no
// bulk/enumerable listing), and that name is the same public datum the TSE's own
// consulta returns.
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

  if (result.unavailable) {
    return NextResponse.json(
      {
        found: false,
        unavailable: true,
        error: "No pudimos consultar el padrón en este momento.",
      },
      { status: 503 }
    );
  }

  if (result.found && result.fullName) {
    // dob is ALWAYS null (the padrón has no birth date — the unused fecha_nacimiento
    // column was dropped in migration 066; DOB is collected manually). isAdult is true
    // because the electoral roll only contains citizens 18+. Both kept for the contract.
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
