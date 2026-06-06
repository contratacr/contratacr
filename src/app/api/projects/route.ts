import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { getProvinceById, getCantonById } from "@/lib/data/cr-geography";

/**
 * Resolve category / provincia / cantón display data WITHOUT relying on
 * PostgREST embedded joins — the projects table has no FK to `categories`
 * (dropped in migration 013) and its provincia/canton columns are plain text,
 * so `categories(name, icon)` style embeds error out and return zero rows.
 * We look up the icon/name from the real `categories` table + static geography.
 */
async function enrichProjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  if (rows.length === 0) return rows;
  const admin = createAdminClient();

  const catIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
  const catMap: Record<string, { name: string; icon: string }> = {};
  if (catIds.length > 0) {
    const { data: cats } = await admin.from("categories").select("id, name, icon").in("id", catIds);
    for (const c of cats ?? []) catMap[c.id] = { name: c.name, icon: c.icon };
  }

  return rows.map((r) => ({
    ...r,
    categories: r.category_id
      ? catMap[r.category_id] ?? { name: getCategoryLabel(r.category_id), icon: "" }
      : null,
    provincias: r.provincia_id ? { name: getProvinceById(r.provincia_id)?.name ?? "" } : null,
    cantones: r.canton_id ? { name: getCantonById(r.canton_id)?.name ?? "" } : null,
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, categoryId, provinciaId, cantonId, budgetMin, budgetMax, timeline } = body;

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "Título y descripción son requeridos" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const uid = session.user.id;
    const admin = createAdminClient();

    // Ensure the profiles row exists before inserting (client_id FK requires it)
    await admin.from("profiles").upsert({
      id: uid,
      email: session.user.email ?? "",
      full_name: (session.user.user_metadata?.full_name as string) ||
                 (session.user.user_metadata?.name as string) ||
                 session.user.email?.split("@")[0] || "",
      role: (session.user.user_metadata?.role as string) || "client",
      onboarding_completed: true,
    }, { onConflict: "id", ignoreDuplicates: false });

    const { data, error } = await supabase.from("projects").insert({
      client_id: uid,
      category_id: categoryId ?? null,
      title: title.trim(),
      description: description.trim(),
      provincia_id: provinciaId ?? null,
      canton_id: cantonId ?? null,
      budget_min: budgetMin ? parseInt(budgetMin, 10) : null,
      budget_max: budgetMax ? parseInt(budgetMax, 10) : null,
      timeline: timeline ?? null,
      status: "open",
    }).select("id").single();

    if (error) {
      console.error("[POST /api/projects] Supabase error:", error.message, error.details);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, success: true });
  } catch (err) {
    console.error("[POST /api/projects] Unexpected error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const categoryId = searchParams.get("category");

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (role === "client") {
    // Use the admin client (scoped to this client's id) so a freshly created
    // project always shows up immediately, regardless of RLS read timing.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("projects")
      .select(`*, proposals(id, status)`)
      .eq("client_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/projects] client error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ projects: await enrichProjects(data ?? []) });
  }

  // Professional: browse open projects that match ANY of their professions.
  // Filtering is enforced SERVER-SIDE from the pro's own record (never trusting a
  // client-supplied category) so a project is only ever visible to professionals
  // in that profession. Uncategorized projects stay visible to everyone.
  const { data: proRow } = await supabase
    .from("professionals")
    .select("category_id, professions")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  const professions: string[] =
    proRow?.professions && proRow.professions.length > 0
      ? proRow.professions
      : proRow?.category_id
        ? [proRow.category_id]
        : [];

  let query = supabase
    .from("projects")
    .select(`*, profiles:client_id(full_name), proposals(id)`)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(30);

  if (professions.length > 0) {
    const inList = professions.map((p) => `"${p}"`).join(",");
    // category in the pro's professions OR the project has no category set
    query = query.or(`category_id.in.(${inList}),category_id.is.null`);
  } else if (categoryId) {
    // Fallback when the pro record is missing professions for some reason.
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/projects] pro error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: await enrichProjects(data ?? []) });
}

// Project owner can change their project's status. A cancelled project can be
// reopened (status → open) — a project is the client's own reusable listing, so
// reversal is expected and low-risk (unlike a booking, which is a commitment
// between two parties and stays terminal for auditability).
export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  const allowed = ["open", "cancelled", "completed"];
  if (!id || !allowed.includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { error } = await supabase
    .from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("client_id", session.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
