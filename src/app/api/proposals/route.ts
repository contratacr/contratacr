import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    // No self-service: a professional cannot send a proposal to their OWN project.
    const { data: project } = await createAdminClient()
      .from("projects").select("client_id").eq("id", projectId).maybeSingle();
    if (project?.client_id === session.user.id) {
      return NextResponse.json({ error: "No puedes enviar una propuesta a tu propia solicitud." }, { status: 400 });
    }

    const { data, error } = await supabase.from("proposals").insert({
      project_id: projectId,
      professional_id: pro.id,
      price: price ? parseInt(price, 10) : null,
      message,
      status: "pending",
    }).select("id").single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya enviaste una propuesta para esta solicitud" }, { status: 409 });
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

    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich each proposal with its project (title, STATUS, client) via the
    // service-role client. The projects RLS only lets the OWNER (or "open"
    // projects) be read, so the embedded join returned NULL/stale status once the
    // project moved to in_progress — which hid the pro's "Marcar trabajo realizado"
    // button and stuck the project at "Aceptada". Reading via admin fixes that.
    // Client name + photo are always shown; the PHONE only on accepted proposals.
    const admin = createAdminClient();
    const projIds = [...new Set((data ?? []).map((p) => p.project_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projMap: Record<string, any> = {};
    if (projIds.length > 0) {
      const { data: projs } = await admin
        .from("projects")
        .select("id, title, status, client_id, category_id, profiles:client_id(full_name, avatar_url, phone)")
        .in("id", projIds);
      for (const pj of projs ?? []) projMap[pj.id] = pj;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = (data ?? []).map((p: any) => {
      const pj = projMap[p.project_id];
      if (pj) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prof = pj.profiles as any;
        const profiles = p.status === "accepted"
          ? prof
          : prof ? { full_name: prof.full_name, avatar_url: prof.avatar_url } : prof;
        p.projects = { title: pj.title, status: pj.status, category_id: pj.category_id ?? null, profiles };
      } else {
        p.projects = null;
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
    const { id, status, price, message } = body;
    if (!id) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // ── Professional edits their OWN pending proposal (price / message) ──────
    if (status === undefined && (price !== undefined || message !== undefined)) {
      const { data: pro } = await supabase.from("professionals").select("id").eq("profile_id", session.user.id).maybeSingle();
      if (!pro) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      const { data: prop } = await supabase.from("proposals").select("status, professional_id").eq("id", id).maybeSingle();
      if (!prop || prop.professional_id !== pro.id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      if (prop.status !== "pending") return NextResponse.json({ error: "Solo puedes editar una propuesta pendiente." }, { status: 409 });
      const patch: Record<string, unknown> = {};
      if (price !== undefined) patch.price = price ? parseInt(String(price), 10) : null;
      if (message !== undefined) patch.message = message;
      // Persist with the service-role client: the RLS-bound update can silently
      // affect 0 rows if no UPDATE policy covers the professional (edits were lost).
      const admin = createAdminClient();
      const { error: e } = await admin.from("proposals").update(patch).eq("id", id);
      if (e) return NextResponse.json({ error: e.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (!status) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

    // Persist via service-role so the status change isn't silently dropped by RLS.
    const adminStatus = createAdminClient();
    const { error } = await adminStatus
      .from("proposals")
      .update({ status })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Reverting an accepted decision (→ pending/declined): reopen the project and
    // clear the accepted professional so the client can choose again.
    if (status === "pending" || status === "declined") {
      try {
        const admin = createAdminClient();
        const { data: prop } = await admin.from("proposals").select("project_id, professional_id").eq("id", id).maybeSingle();
        if (prop?.project_id) {
          const { data: project } = await admin.from("projects").select("accepted_professional_id, status").eq("id", prop.project_id).maybeSingle();
          if (project?.accepted_professional_id === prop.professional_id) {
            await admin.from("projects").update({ status: "open", accepted_professional_id: null }).eq("id", prop.project_id);
          }
        }
      } catch (e) {
        console.error("[PATCH /api/proposals] revert side-effects failed:", e);
      }
    }

    // On accept: move the project into "in_progress" and record the accepted
    // professional so the completion flow knows who can mark work done.
    if (status === "accepted") {
      try {
        const admin = createAdminClient();
        const { data: prop } = await admin
          .from("proposals")
          .select("project_id, professional_id, projects:project_id(title)")
          .eq("id", id)
          .maybeSingle();
        if (prop?.project_id) {
          await admin
            .from("projects")
            .update({ status: "in_progress", accepted_professional_id: prop.professional_id })
            .eq("id", prop.project_id);
          const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", prop.professional_id).maybeSingle();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const title = (prop.projects as any)?.title ?? "tu propuesta";
          if (pro?.profile_id) {
            await admin.from("notifications").insert({
              user_id: pro.profile_id,
              type: "project_proposal_accepted",
              title: "¡Tu propuesta fue aceptada!",
              message: `El cliente aceptó tu propuesta para "${title}". Coordina el trabajo y márcalo como realizado al terminar.`,
              data: { link: "/es/dashboard/profesional?tab=proposals", project_id: prop.project_id },
            });
          }
        }
      } catch (e) {
        console.error("[PATCH /api/proposals] accept side-effects failed:", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/proposals]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// Professional cancels (deletes) their OWN pending proposal.
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: pro } = await supabase.from("professionals").select("id").eq("profile_id", session.user.id).maybeSingle();
  if (!pro) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { data: prop } = await supabase.from("proposals").select("status, professional_id").eq("id", id).maybeSingle();
  if (!prop || prop.professional_id !== pro.id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (prop.status !== "pending") return NextResponse.json({ error: "Solo puedes cancelar una propuesta pendiente." }, { status: 409 });

  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
