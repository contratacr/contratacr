import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contactCookieValue, hashContactToken, setContactCookie } from "@/lib/contact-followup";

const DIA_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_DELAY_MS = 5 * DIA_MS;
// Los frenos para que la pregunta no canse. Se pregunta a los 5 días y, si la
// respuesta es «Aún no», UNA vez más a los 5 días; un segundo «Aún no» la
// cierra. Antes se reprogramaba sin límite: quien nunca contestaba «Sí» o «No»
// la veía cada 5 días para siempre.
const ULTIMA_PREGUNTA_MS = 10 * DIA_MS;
// Pasado un mes del contacto ya nadie se acuerda: la pregunta solo estorba.
const CADUCA_MS = 30 * DIA_MS;
// «Aún no» también quiere decir «ahora no me pregunten»: las demás pendientes
// esperan al menos un día, así nunca sale más de una tarjeta por día.
const RESPIRO_MS = DIA_MS;

async function currentUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  const token = contactCookieValue(request);
  const tokenHash = hashContactToken(token);
  const userId = await currentUserId();
  const db = createAdminClient();

  if (userId) {
    await db
      .from("whatsapp_contact_followups")
      .update({ client_id: userId, updated_at: new Date().toISOString() })
      .eq("anonymous_token_hash", tokenHash)
      .is("client_id", null);
  }

  let query = db
    .from("whatsapp_contact_followups")
    .select("id, professional_id, professional_name, service_name, contact_method, status, contacted_at", { count: "exact" })
    .in("status", userId ? ["contacted", "hire_intent"] : ["contacted"])
    .lte("follow_up_at", new Date().toISOString())
    .gte("contacted_at", new Date(Date.now() - CADUCA_MS).toISOString())
    .order("contacted_at", { ascending: false })
    .limit(1);

  query = userId ? query.eq("client_id", userId) : query.eq("anonymous_token_hash", tokenHash).is("client_id", null);
  const { data, error, count } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const response = NextResponse.json({
    followUp: data ?? null,
    pendingCount: count ?? (data ? 1 : 0),
    authenticated: Boolean(userId),
  });
  setContactCookie(response, token);
  return response;
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");
  if (!id || !["hired", "not_now", "not_hired"].includes(action)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  const token = contactCookieValue(request);
  const tokenHash = hashContactToken(token);
  const userId = await currentUserId();
  const db = createAdminClient();
  const { data: followUp } = await db
    .from("whatsapp_contact_followups")
    .select("id, client_id, anonymous_token_hash, professional_id, professional_name, service_name, contact_method, status, contacted_at")
    .eq("id", id)
    .maybeSingle();

  const ownsFollowUp = followUp && (
    (userId && followUp.client_id === userId) ||
    (!followUp.client_id && followUp.anonymous_token_hash === tokenHash)
  );
  if (!ownsFollowUp) return NextResponse.json({ error: "Seguimiento no encontrado." }, { status: 404 });

  if (action === "not_now") {
    const ahora = Date.now();
    const edad = ahora - new Date(String(followUp.contacted_at)).getTime();
    // Segunda vez que dice «Aún no»: se cierra, no se vuelve a preguntar.
    const cambios = edad >= ULTIMA_PREGUNTA_MS
      ? { status: "dismissed", responded_at: new Date(ahora).toISOString(), updated_at: new Date(ahora).toISOString() }
      : { follow_up_at: new Date(ahora + FOLLOW_UP_DELAY_MS).toISOString(), updated_at: new Date(ahora).toISOString() };
    const { error } = await db.from("whatsapp_contact_followups").update(cambios).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Las demás pendientes de esta misma persona esperan al menos un día.
    let otras = db
      .from("whatsapp_contact_followups")
      .update({ follow_up_at: new Date(ahora + RESPIRO_MS).toISOString(), updated_at: new Date(ahora).toISOString() })
      .neq("id", id)
      .in("status", ["contacted", "hire_intent"])
      .lte("follow_up_at", new Date(ahora + RESPIRO_MS).toISOString());
    otras = followUp.client_id
      ? otras.eq("client_id", followUp.client_id)
      : otras.eq("anonymous_token_hash", tokenHash).is("client_id", null);
    await otras;
    return NextResponse.json({ ok: true, closed: edad >= ULTIMA_PREGUNTA_MS });
  }

  if (action === "not_hired") {
    const { error } = await db.from("whatsapp_contact_followups").update({
      status: "dismissed",
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!userId) {
    // Sin cuenta también se puede reseñar: para llegar aquí hubo que contactar a
    // ESE profesional desde ESTE dispositivo, y la reseña queda amarrada al
    // seguimiento. Medido: de 24 avisos a gente sin cuenta, el muro dejó CERO
    // reseñas. El nombre se pide en el formulario.
    const { error } = await db.from("whatsapp_contact_followups").update({
      status: "hired",
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const response = NextResponse.json({
      ok: true,
      review: {
        contactId: followUp.id,
        professionalId: followUp.professional_id,
        professionalName: followUp.professional_name,
        needsName: true,
      },
    });
    setContactCookie(response, token);
    return response;
  }

  const { error } = await db.from("whatsapp_contact_followups").update({
    client_id: userId,
    status: "hired",
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    review: {
      contactId: followUp.id,
      professionalId: followUp.professional_id,
      professionalName: followUp.professional_name,
    },
  });
}
