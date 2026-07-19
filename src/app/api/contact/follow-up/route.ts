import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contactCookieValue, hashContactToken, setContactCookie } from "@/lib/contact-followup";

const FOLLOW_UP_DELAY_MS = 5 * 24 * 60 * 60 * 1000;

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
    .select("id, professional_id, professional_name, service_name, contact_method, status, contacted_at")
    .in("status", userId ? ["contacted", "hire_intent"] : ["contacted"])
    .lte("follow_up_at", new Date().toISOString())
    .order("contacted_at", { ascending: false })
    .limit(1);

  query = userId ? query.eq("client_id", userId) : query.eq("anonymous_token_hash", tokenHash).is("client_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const response = NextResponse.json({ followUp: data ?? null, authenticated: Boolean(userId) });
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
    .select("id, client_id, anonymous_token_hash, professional_id, professional_name, service_name, contact_method, status")
    .eq("id", id)
    .maybeSingle();

  const ownsFollowUp = followUp && (
    (userId && followUp.client_id === userId) ||
    (!followUp.client_id && followUp.anonymous_token_hash === tokenHash)
  );
  if (!ownsFollowUp) return NextResponse.json({ error: "Seguimiento no encontrado." }, { status: 404 });

  if (action === "not_now") {
    const { error } = await db.from("whatsapp_contact_followups").update({
      follow_up_at: new Date(Date.now() + FOLLOW_UP_DELAY_MS).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
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
    const { error } = await db.from("whatsapp_contact_followups").update({
      status: "hire_intent",
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const response = NextResponse.json({ authRequired: true }, { status: 401 });
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
