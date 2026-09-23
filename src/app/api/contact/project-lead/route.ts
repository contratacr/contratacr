import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { nombreDeSaludo } from "@/lib/nombres";
import { TABLERO_PUBLICO_DESDE } from "@/lib/queries/proyectos-publicos";

/**
 * El WhatsApp del cliente que publicó un proyecto, para el profesional que
 * quiere responderle.
 *
 * Esta es la ÚNICA puerta de contacto del app que pide cuenta, y pide una
 * cuenta profesional. La razón no es cobrar registros —eso ya se midió y cuesta
 * clientes—: es que aquí el número es el de un vecino que pidió un trabajo, no
 * el de un negocio que se anuncia. Quien responde una oferta de trabajo ya está
 * registrado, así que el roce cae del lado que no nos cuesta clientes.
 *
 * El número nunca viaja con la página del tablero; sale de aquí, de a uno, con
 * tope por hora.
 */
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "contacto-proyecto", 15, 3_600_000);
  if (limited) return limited;

  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return NextResponse.json({ error: "Proyecto inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Necesitas una cuenta profesional." }, { status: 401 });

  const db = createAdminClient();
  const { data: pro } = await db
    .from("professionals")
    .select("id, business_name, is_banned, profiles(full_name)")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!pro || (pro as { is_banned?: boolean | null }).is_banned) {
    return NextResponse.json({ error: "Necesitas una cuenta profesional." }, { status: 403 });
  }

  // Las mismas dos condiciones que el tablero: publicado después de que el
  // tablero existe, y sin que el cliente haya quitado el permiso.
  const traer = (extra: string) => db
    .from("projects")
    .select(`id, title, status, client_id, created_at, client_phone_snapshot${extra}`)
    .eq("id", projectId)
    .maybeSingle();
  let hayColumna = true;
  let respuesta = await traer(", allow_direct_contact") as { data: unknown; error: { code?: string } | null };
  if (respuesta.error?.code === "42703") {
    hayColumna = false;
    respuesta = await traer("") as { data: unknown; error: { code?: string } | null };
  }
  const fila = respuesta.data as {
    title?: string; status?: string; client_id?: string; created_at?: string;
    allow_direct_contact?: boolean | null; client_phone_snapshot?: string | null;
  } | null;
  // EXACTAMENTE la regla del tablero, ni una condición más. Antes aquí se
  // exigían las dos cosas —permiso Y fecha— mientras el tablero pedía una sola,
  // así que un proyecto anterior al 15 de septiembre que su dueño sacó al
  // tablero a mano SE VEÍA pero su botón de WhatsApp fallaba siempre. Y como
  // ese rechazo compartía el 404 con «no dejó WhatsApp», la pantalla le echaba
  // la culpa al teléfono del cliente. La fecha solo manda donde la columna no
  // existe todavía, que es como se comportaba antes de la migración 207.
  const admitido = hayColumna
    ? fila?.allow_direct_contact === true
    : String(fila?.created_at ?? "") >= TABLERO_PUBLICO_DESDE;
  if (!fila || fila.status !== "open" || !admitido) {
    return NextResponse.json({ error: "Este proyecto ya no recibe mensajes.", code: "no_publicado" }, { status: 404 });
  }
  // Nadie se escribe a sí mismo: un profesional también puede publicar proyectos.
  if (fila.client_id === user.id) {
    return NextResponse.json({ error: "Este proyecto es tuyo." }, { status: 409 });
  }
  // El proyecto guarda el teléfono del momento de publicarlo; si cambió después,
  // manda el del perfil, que es el que la persona mantiene al día.
  const { data: perfil } = await db.from("profiles").select("phone").eq("id", fila.client_id ?? "").maybeSingle();
  let telefono = (perfil as { phone?: string | null } | null)?.phone || fila.client_phone_snapshot || "";
  // Y si la cuenta no guardó teléfono —proyectos viejos, cuentas creadas con
  // Google—, el de su ficha profesional: quien publica un proyecto puede tener
  // también perfil de profesional, y ahí el WhatsApp es obligatorio.
  if (telefono.replace(/\D/g, "").length < 8) {
    const { data: comoPro } = await db.from("professionals").select("whatsapp").eq("profile_id", fila.client_id ?? "").maybeSingle();
    telefono = (comoPro as { whatsapp?: string | null } | null)?.whatsapp || telefono;
  }
  const crudo = telefono.replace(/\D/g, "");
  if (crudo.length < 8) return NextResponse.json({ error: "Este cliente no dejó un WhatsApp.", code: "sin_whatsapp" }, { status: 404 });
  const numero = crudo.length === 8 ? `506${crudo}` : crudo;

  const perfilPro = pro as { business_name?: string | null; profiles?: { full_name?: string | null } | null };
  const negocio = (perfilPro.business_name ?? "").trim();
  const quien = nombreDeSaludo(negocio || perfilPro.profiles?.full_name, !!negocio) || "un profesional";
  // A quien publicó se le dice por su primer nombre, no por los cuatro del
  // padrón y en mayúsculas.
  const { data: cliente } = await db.from("profiles").select("full_name").eq("id", fila.client_id ?? "").maybeSingle();
  const saludo = nombreDeSaludo((cliente as { full_name?: string | null } | null)?.full_name);
  const texto = `Hola${saludo ? ` ${saludo}` : ""}, soy ${quien}. Vi tu proyecto "${(fila.title ?? "").slice(0, 60)}" en ContrataCR y puedo ayudarte. ¿Lo conversamos?`;
  return NextResponse.json(
    { href: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
