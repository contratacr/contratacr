import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serviceSuggestionEditorLink } from "@/lib/service-suggestion-request";

export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const [{ data: requests, error }, { data: pro, error: professionalError }] = await Promise.all([
    db.from("service_suggestion_requests").select("suggestion_id,dismissed").eq("profile_id", user.id),
    db.from("professionals").select("professions,category_id,services").eq("profile_id", user.id).maybeSingle(),
  ]);
  if (error || professionalError) return NextResponse.json({ error: "No se pudieron consultar las solicitudes" }, { status: 503 });
  if (!requests?.length) return NextResponse.json({ invitations: [] }, { headers: { "Cache-Control": "no-store" } });
  const { data: suggestions, error: suggestionError } = await db.from("category_suggestions")
    .select("id,status,approved,resolved_category_id").in("id", requests.map(r => r.suggestion_id));
  if (suggestionError) return NextResponse.json({ error: "No se pudieron consultar las solicitudes" }, { status: 503 });
  const resolved = (suggestions ?? []).filter(s => s.status === "approved" || s.approved === true || (s.status === "rejected" && s.resolved_category_id))
    .map(s => ({ suggestionId: s.id, categoryId: s.resolved_category_id || s.id, dismissed: requests.find(r => r.suggestion_id === s.id)?.dismissed }));
  const ids = [...new Set(resolved.map(s => s.categoryId))];
  if (!ids.length) return NextResponse.json({ invitations: [] }, { headers: { "Cache-Control": "no-store" } });
  const { data: categories, error: categoryError } = await db.from("categories").select("id,name,name_en,is_hidden,is_active").in("id", ids);
  if (categoryError) return NextResponse.json({ error: "No se pudieron consultar los servicios" }, { status: 503 });
  const offered = new Set([pro?.category_id, ...(pro?.professions ?? []), ...((pro?.services ?? []) as { category?: string }[]).map(s => s.category)]);
  const invitations = resolved.flatMap(r => {
    const c = categories?.find(c => c.id === r.categoryId && !c.is_hidden && c.is_active !== false);
    return c && !offered.has(c.id) ? [{ ...r, name: c.name, nameEn: c.name_en, link: serviceSuggestionEditorLink(c.id) }] : [];
  });
  return NextResponse.json({ invitations }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.suggestionId !== "string") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { error } = await createAdminClient().from("service_suggestion_requests").update({ dismissed: true })
    .eq("profile_id", user.id).eq("suggestion_id", body.suggestionId);
  return NextResponse.json(error ? { error: "No se pudo guardar" } : { ok: true }, { status: error ? 503 : 200 });
}
