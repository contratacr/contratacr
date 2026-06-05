import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      .select(`
        *,
        categories(name, icon),
        provincias(name),
        cantones(name),
        proposals(id, status)
      `)
      .eq("client_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/projects] client error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ projects: data ?? [] });
  }

  // Professional: browse open projects in their category
  let query = supabase
    .from("projects")
    .select(`
      *,
      categories(name, icon),
      provincias(name),
      cantones(name),
      profiles:client_id(full_name),
      proposals(id)
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(30);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/projects] pro error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: data ?? [] });
}
