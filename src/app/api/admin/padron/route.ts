import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";

const headers = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!await getApiAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
  const limited = enforceRateLimit(req, "admin-padron", 20, 60_000);
  if (limited) { limited.headers.set("Cache-Control", "no-store"); return limited; }
  const body = await req.json().catch(() => null);
  const raw = typeof body?.cedula === "string" ? body.cedula.trim() : "";
  const cedula = raw.replace(/[\s-]/g, "");
  if (!/^[1-9]\d{8}$/.test(cedula)) {
    return NextResponse.json({ error: "Ingresá una cédula física costarricense de 9 dígitos. El padrón electoral no incluye cédulas jurídicas, DIMEX ni NITE." }, { status: 400, headers });
  }
  try {
    const result = await getIdentityVerifier().lookup(cedula);
    if (result.unavailable) throw new Error("Padrón unavailable");
    if (!result.found || !result.fullName) {
      return NextResponse.json({ found: false, cedula }, { status: 404, headers });
    }
    return NextResponse.json({ found: true, cedula, fullName: result.fullName }, { headers });
  } catch {
    return NextResponse.json({ error: "No pudimos consultar el padrón en este momento. Intentá nuevamente más tarde." }, { status: 503, headers });
  }
}
