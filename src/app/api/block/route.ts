import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * BLOQUEAR / DESBLOQUEAR A UN USUARIO (6-oct-2026, regla 1.2 de Apple).
 * GET  → los ids que esta cuenta tiene bloqueados.
 * POST → bloquea: guarda el bloqueo, cierra la conversación entre los dos y
 *        deja un reporte para que el equipo lo revise (en 24 h).
 * DELETE → desbloquea.
 * La persona bloqueada nunca se entera: para ella simplemente ya no hay
 * contacto. Quien bloquea deja de ver su perfil y sus publicaciones al instante.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data } = await supabase.from("user_blocks").select("blocked_id, created_at").eq("blocker_id", user.id).order("created_at", { ascending: false });
  const ids = (data ?? []).map((f) => (f as { blocked_id: string }).blocked_id);
  // Los nombres, para la lista de «Usuarios bloqueados» del panel.
  const admin = createAdminClient();
  const { data: perfiles } = ids.length ? await admin.from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] };
  const { data: pros } = ids.length ? await admin.from("professionals").select("profile_id, slug, business_name").in("profile_id", ids) : { data: [] };
  const porId = new Map((perfiles ?? []).map((p) => [String((p as { id: string }).id), p as { id: string; full_name?: string | null; avatar_url?: string | null }]));
  const proPorId = new Map((pros ?? []).map((p) => [String((p as { profile_id: string }).profile_id), p as { slug?: string | null; business_name?: string | null }]));
  return NextResponse.json({
    blocked: ids.map((id) => ({ id, name: proPorId.get(id)?.business_name || porId.get(id)?.full_name || "Usuario", avatarUrl: porId.get(id)?.avatar_url ?? null, slug: proPorId.get(id)?.slug ?? null })),
  });
}

export async function POST(req: Request) {
  const limitado = enforceRateLimit(req, "bloquear", 20, 60 * 60 * 1000);
  if (limitado) return limitado;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { profileId?: string; professionalId?: string; slug?: string; projectId?: string; reason?: string };
  const admin = createAdminClient();
  let profileId = typeof body.profileId === "string" && UUID.test(body.profileId) ? body.profileId : null;
  if (!profileId && typeof body.professionalId === "string" && UUID.test(body.professionalId)) {
    const { data } = await admin.from("professionals").select("profile_id").eq("id", body.professionalId).maybeSingle();
    profileId = (data as { profile_id?: string } | null)?.profile_id ?? null;
  }
  // Desde una publicación: el empleo y la promoción traen el slug del
  // profesional; el proyecto, su id (el cliente que lo pidió).
  if (!profileId && typeof body.slug === "string" && /^[a-z0-9-]{1,120}$/i.test(body.slug)) {
    const { data } = await admin.from("professionals").select("profile_id").eq("slug", body.slug).maybeSingle();
    profileId = (data as { profile_id?: string } | null)?.profile_id ?? null;
  }
  if (!profileId && typeof body.projectId === "string" && UUID.test(body.projectId)) {
    const { data } = await admin.from("projects").select("client_id").eq("id", body.projectId).maybeSingle();
    profileId = (data as { client_id?: string } | null)?.client_id ?? null;
  }
  if (!profileId) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (profileId === user.id) return NextResponse.json({ error: "No puedes bloquearte a ti mismo." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const { error } = await admin.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: profileId, reason: reason || null }, { onConflict: "blocker_id,blocked_id" });
  if (error) return NextResponse.json({ error: "No se pudo bloquear." }, { status: 500 });

  // La conversación entre los dos, si existe, queda bloqueada por quien bloquea.
  await admin.from("direct_conversations")
    .update({ status: "blocked", blocked_by: user.id })
    .or(`and(client_id.eq.${user.id},professional_profile_id.eq.${profileId}),and(client_id.eq.${profileId},professional_profile_id.eq.${user.id})`)
    .neq("status", "blocked");

  // Aviso al equipo: un bloqueo es una señal de abuso y se revisa en 24 h.
  const { data: pro } = await admin.from("professionals").select("id, slug, business_name, profiles(full_name)").eq("profile_id", profileId).maybeSingle();
  const p = pro as { id?: string; slug?: string | null; business_name?: string | null; profiles?: { full_name?: string | null } | { full_name?: string | null }[] } | null;
  const perfil = Array.isArray(p?.profiles) ? p?.profiles[0] : p?.profiles;
  const { data: bloqueado } = await admin.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
  await admin.from("reports").insert({
    kind: "block",
    blocked_profile_id: profileId,
    professional_id: p?.id ?? null,
    professional_slug: p?.slug ?? null,
    professional_name: p?.business_name || perfil?.full_name || (bloqueado as { full_name?: string } | null)?.full_name || null,
    reason: reason ? `Bloqueo de usuario: ${reason}` : "Bloqueo de usuario (sin motivo escrito).",
    reporter_email: user.email ?? null,
  });
  return NextResponse.json({ ok: true, blockedId: profileId });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", id);
  await admin.from("direct_conversations").update({ status: "open", blocked_by: null })
    .or(`and(client_id.eq.${user.id},professional_profile_id.eq.${id}),and(client_id.eq.${id},professional_profile_id.eq.${user.id})`)
    .eq("status", "blocked").eq("blocked_by", user.id);
  return NextResponse.json({ ok: true });
}
