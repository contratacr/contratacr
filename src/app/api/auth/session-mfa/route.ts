import { NextResponse } from "next/server";
import { getSessionMfa } from "@/lib/auth/session-mfa";
export async function GET() {
  try {
    return NextResponse.json(await getSessionMfa(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo comprobar la seguridad de la sesión." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
