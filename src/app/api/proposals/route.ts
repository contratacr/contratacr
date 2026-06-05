import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, price, message } = body;

    if (!projectId || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", session.user.id)
      .single();

    if (!pro) return NextResponse.json({ error: "Solo profesionales pueden enviar propuestas" }, { status: 403 });

    const { data, error } = await supabase.from("proposals").insert({
      project_id: projectId,
      professional_id: pro.id,
      price: price ? parseInt(price, 10) : null,
      message,
      status: "pending",
    }).select("id").single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya enviaste una propuesta para este proyecto" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, success: true });
  } catch (err) {
    console.error("[POST /api/proposals]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project");
  const mine = searchParams.get("mine");

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (mine === "true") {
    // Professional: my sent proposals
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", session.user.id)
      .single();
    if (!pro) return NextResponse.json({ proposals: [] });

    // Expose the client's phone only on accepted proposals (privacy: the pro
    // earns contact details once the client picks them).
    const { data, error } = await supabase
      .from("proposals")
      .select("*, projects:project_id(title, status, profiles:client_id(full_name, phone))")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = (data ?? []).map((p: any) => {
      if (p.status !== "accepted" && p.projects?.profiles) {
        p.projects.profiles = { full_name: p.projects.profiles.full_name };
      }
      return p;
    });
    return NextResponse.json({ proposals: safe });
  }

  if (!projectId) return NextResponse.json({ proposals: [] });

  // NOTE: professionals↔categories has no FK (category_id is plain text), so an
  // embedded `categories(...)` join here 500s and silently hides every proposal.
  // Only embed real relationships (profiles via profile_id).
  const { data, error } = await supabase
    .from("proposals")
    .select(`
      *,
      professionals:professional_id(
        id, slug, whatsapp,
        profiles(full_name, avatar_url)
      )
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { error } = await supabase
      .from("proposals")
      .update({ status })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/proposals]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
