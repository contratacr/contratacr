import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contactCookieValue, hashContactToken, setContactCookie } from "@/lib/contact-followup";
import { limitTrimmedText } from "@/lib/text-limits";

const FOLLOW_UP_DELAY_MS = 5 * 24 * 60 * 60 * 1000;
const CONTACT_METHODS = new Set(["whatsapp", "phone", "email"]);

async function currentUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const professionalId = String(body.professionalId ?? "");
  const method = CONTACT_METHODS.has(String(body.method)) ? String(body.method) : "whatsapp";
  const contextTitle = limitTrimmedText(body.contextTitle, 160);
  if (!professionalId) return NextResponse.json({ error: "Falta el profesional." }, { status: 400 });

  const db = createAdminClient();
  const { data: professional, error: professionalError } = await db
    .from("professionals")
    .select("id, business_name, profiles(full_name)")
    .eq("id", professionalId)
    .maybeSingle();
  if (professionalError) return NextResponse.json({ error: professionalError.message }, { status: 500 });
  if (!professional) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });

  const profile = Array.isArray(professional.profiles) ? professional.profiles[0] : professional.profiles;
  const professionalName = professional.business_name || profile?.full_name || "Profesional";
  const token = contactCookieValue(request);
  const tokenHash = hashContactToken(token);
  const userId = await currentUserId();
  const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let recentQuery = db
    .from("whatsapp_contact_followups")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("contact_method", method)
    .gte("contacted_at", recentSince)
    .in("status", ["contacted", "hire_intent"])
    .order("contacted_at", { ascending: false })
    .limit(1);
  recentQuery = contextTitle ? recentQuery.eq("service_name", contextTitle) : recentQuery.is("service_name", null);
  recentQuery = userId
    ? recentQuery.eq("client_id", userId)
    : recentQuery.eq("anonymous_token_hash", tokenHash).is("client_id", null);

  const { data: recent, error: recentError } = await recentQuery.maybeSingle();
  if (recentError) return NextResponse.json({ error: recentError.message }, { status: 500 });

  let contactId: string | null = null;
  if (recent?.id) {
    contactId = recent.id;
    const { error } = await db
      .from("whatsapp_contact_followups")
      .update({
        follow_up_at: new Date(Date.now() + FOLLOW_UP_DELAY_MS).toISOString(),
        status: "contacted",
        responded_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recent.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: inserted, error } = await db
      .from("whatsapp_contact_followups")
      .insert({
        professional_id: professionalId,
        client_id: userId,
        anonymous_token_hash: userId ? null : tokenHash,
        professional_name: professionalName,
        service_name: contextTitle || null,
        contact_method: method,
        follow_up_at: new Date(Date.now() + FOLLOW_UP_DELAY_MS).toISOString(),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contactId = inserted?.id ?? null;
  }

  const response = NextResponse.json({ ok: true, contactId });
  setContactCookie(response, token);
  return response;
}
