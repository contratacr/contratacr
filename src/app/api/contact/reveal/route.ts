import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";

// The call number and contact email of a professional, for signed-in viewers
// only. Public payloads (/api/professionals/[slug], /buscar) carry just flags.
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, "contact-reveal", 60, 600000);
  if (limited) return limited;
  const professionalId = new URL(req.url).searchParams.get("professionalId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(professionalId)) {
    return NextResponse.json({ error: "Profesional inválido." }, { status: 400 });
  }
  const viewer = await createClient().then((supabase) => safeGetUser(supabase)).catch(() => null);
  if (!viewer) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("professionals")
    .select("id, whatsapp, call_phone, contact_email, allow_phone_call")
    .eq("id", professionalId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });

  const row = data as { whatsapp?: string | null; call_phone?: string | null; contact_email?: string | null; allow_phone_call?: boolean | null };
  const digits = ((row.call_phone || row.whatsapp) ?? "").replace(/\D/g, "");
  const tel = row.allow_phone_call && digits ? `tel:+${digits.length === 8 ? `506${digits}` : digits}` : null;
  const email = (row.contact_email ?? "").trim() || null;
  return NextResponse.json({ tel, email }, { headers: { "Cache-Control": "no-store" } });
}
