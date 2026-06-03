import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, categoryId, provinciaId, cantonId, budgetMin, budgetMax, timeline } = body;

    if (!title || !description) {
      return NextResponse.json({ error: "Título y descripción son requeridos" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data, error } = await supabase.from("projects").insert({
      client_id: session.user.id,
      category_id: categoryId ?? null,
      title,
      description,
      provincia_id: provinciaId ?? null,
      canton_id: cantonId ?? null,
      budget_min: budgetMin ? parseInt(budgetMin, 10) : null,
      budget_max: budgetMax ? parseInt(budgetMax, 10) : null,
      timeline: timeline ?? null,
      status: "open",
    }).select("id").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, success: true });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
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
    const { data, error } = await supabase
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}
