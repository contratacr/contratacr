import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/contactos — quién está recibiendo contactos y quién no.
 *
 * Sale de `interaction_events`, que lleva registrando esto desde julio: cada
 * vez que alguien toca WhatsApp, llamar o correo en una ficha queda la huella
 * con el profesional, el servicio y la fecha. No hay datos personales de quien
 * contacta —solo una huella anónima de la visita—, así que esto responde «a
 * quién buscan» y «cuánto», no «quién buscó».
 *
 * Es la medida de si la plataforma le está entregando trabajo a la oferta, que
 * es lo único que hace que un profesional se quede.
 */
export const dynamic = "force-dynamic";

// Lo que abre una conversación con el profesional. `external_link_click` NO
// entra: son los clics a su Instagram, su Facebook y su web, que aquí se
// etiquetaban como «correo» e inflaban la tasa de contacto. El correo tiene
// ahora su propio tipo.
const CONTACTO = ["whatsapp_click", "phone_click", "email_click"];

export async function GET(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias") ?? 30) || 30, 1), 365);
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const db = createAdminClient();

  const [{ data: contactos }, { data: vistas }] = await Promise.all([
    db.from("interaction_events")
      .select("professional_id, visitor_hash, created_at, category_id, event_type, viewer_user_id")
      .in("event_type", CONTACTO)
      .gte("created_at", desde)
      .limit(5000),
    db.from("interaction_events")
      .select("professional_id, visitor_hash")
      .eq("event_type", "profile_view")
      .gte("created_at", desde)
      .limit(20000),
  ]);

  // Una ráfaga del mismo visitante no son diez clientes: se cuenta una vez por
  // visitante y profesional. Sin esto, once toques en un minuto se leían como
  // once contactos, que fue justo lo que confundió la primera medición.
  const unicos = new Map<string, { professional_id: string; created_at: string; category_id: string | null; canal: string; conCuenta: boolean }>();
  for (const fila of (contactos ?? []) as Array<{ professional_id: string; visitor_hash: string; created_at: string; category_id: string | null; event_type: string; viewer_user_id: string | null }>) {
    const clave = `${fila.visitor_hash}|${fila.professional_id}`;
    if (!unicos.has(clave)) {
      unicos.set(clave, {
        professional_id: fila.professional_id,
        created_at: fila.created_at,
        category_id: fila.category_id,
        canal: fila.event_type === "phone_click" ? "telefono" : fila.event_type === "email_click" ? "correo" : "whatsapp",
        conCuenta: !!fila.viewer_user_id,
      });
    }
  }

  const vistasPorPro = new Map<string, Set<string>>();
  for (const v of (vistas ?? []) as Array<{ professional_id: string; visitor_hash: string }>) {
    if (!v.professional_id) continue;
    const set = vistasPorPro.get(v.professional_id) ?? new Set<string>();
    set.add(v.visitor_hash);
    vistasPorPro.set(v.professional_id, set);
  }

  const porPro = new Map<string, { contactos: number; ultimo: string; canales: Record<string, number>; conCuenta: number }>();
  for (const c of unicos.values()) {
    const actual = porPro.get(c.professional_id) ?? { contactos: 0, ultimo: c.created_at, canales: {}, conCuenta: 0 };
    actual.contactos += 1;
    actual.canales[c.canal] = (actual.canales[c.canal] ?? 0) + 1;
    if (c.conCuenta) actual.conCuenta += 1;
    if (c.created_at > actual.ultimo) actual.ultimo = c.created_at;
    porPro.set(c.professional_id, actual);
  }

  const ids = [...porPro.keys()];
  const { data: pros } = ids.length
    ? await db.from("professionals").select("id, slug, business_name, profiles(full_name)").in("id", ids)
    : { data: [] };
  const nombre = new Map((pros ?? []).map((p) => {
    const fila = p as { id: string; slug: string; business_name: string | null; profiles?: { full_name?: string } | Array<{ full_name?: string }> | null };
    const perfil = Array.isArray(fila.profiles) ? fila.profiles[0] : fila.profiles;
    return [fila.id, { nombre: (fila.business_name ?? "").trim() || perfil?.full_name || fila.slug, slug: fila.slug }];
  }));

  const profesionales = [...porPro.entries()]
    .map(([id, datos]) => ({
      id,
      nombre: nombre.get(id)?.nombre ?? id,
      slug: nombre.get(id)?.slug ?? null,
      contactos: datos.contactos,
      vistas: vistasPorPro.get(id)?.size ?? 0,
      ultimo: datos.ultimo,
      canales: datos.canales,
      conCuenta: datos.conCuenta,
    }))
    .sort((a, b) => b.contactos - a.contactos);

  const totalVistas = [...vistasPorPro.values()].reduce((suma, set) => suma + set.size, 0);
  return NextResponse.json({
    dias,
    total: unicos.size,
    totalVistas,
    tasa: totalVistas ? Number(((unicos.size / totalVistas) * 100).toFixed(1)) : 0,
    profesionales,
  }, { headers: { "Cache-Control": "no-store" } });
}
