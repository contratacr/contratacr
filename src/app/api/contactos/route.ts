import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";

// GET /api/contactos — quién buscó a este profesional sin tener cuenta.
//
// Cada fila es una persona que dejó su nombre y su teléfono para que le
// devuelvan la llamada. Solo las ve el dueño de la ficha: son datos de contacto
// de terceros que entregaron para ÉL, no para la plataforma.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = createAdminClient();
  const { data: profesional } = await db
    .from("professionals")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!profesional) return NextResponse.json({ contactos: [] });

  const { data, error } = await db
    .from("contact_leads")
    .select("id, name, phone, channel, category_id, created_at")
    .eq("professional_id", (profesional as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[contactos] no se pudo leer", { code: error.code });
    return NextResponse.json({ error: "No se pudieron cargar." }, { status: 500 });
  }
  return NextResponse.json({ contactos: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
