import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// El teléfono y el correo de un profesional, para quien lo pide desde una ficha.
//
// Ya NO exige cuenta: el muro costaba tres de cada cuatro contactos (9,0% →
// 2,3% medido en producción) y no traía registros. Lo que protege contra el
// raspado es que estos datos no viajan en el listado ni en la API de resultados
// —ahí van solo banderas— más el tope de abajo: un humano pide uno o dos
// contactos, un raspador pide cincuenta.
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, "contact-reveal", 15, 3_600_000);
  if (limited) return limited;
  const professionalId = new URL(req.url).searchParams.get("professionalId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(professionalId)) {
    return NextResponse.json({ error: "Profesional inválido." }, { status: 400 });
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from("professionals")
    .select("id, whatsapp, call_phone, contact_email, allow_phone_call, is_banned")
    .eq("id", professionalId)
    .maybeSingle();
  // A banned profile is out of search AND out of reach: no contact reveal.
  if (error || !data || (data as { is_banned?: boolean | null }).is_banned) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  const row = data as { whatsapp?: string | null; call_phone?: string | null; contact_email?: string | null; allow_phone_call?: boolean | null };
  const digits = ((row.call_phone || row.whatsapp) ?? "").replace(/\D/g, "");
  const tel = row.allow_phone_call && digits ? `tel:+${digits.length === 8 ? `506${digits}` : digits}` : null;
  const email = (row.contact_email ?? "").trim() || null;
  return NextResponse.json({ tel, email }, { headers: { "Cache-Control": "no-store" } });
}
