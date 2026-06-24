import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel, OTHER_CATEGORY } from "@/lib/data/categories";
import { getProvinceById, getCantonById } from "@/lib/data/cr-geography";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";

type ClientIdentityStatus = "verified" | "pending" | "unverified";

/**
 * Resolve category / provincia / cantón display data WITHOUT relying on
 * PostgREST embedded joins — the projects table has no FK to `categories`
 * (dropped in migration 013) and its provincia/canton columns are plain text,
 * so `categories(name)` style embeds error out and return zero rows.
 * We look up the name from the real `categories` table + static geography.
 */
async function enrichProjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  if (rows.length === 0) return rows;
  const admin = createAdminClient();

  const catIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
  const catMap: Record<string, { name: string }> = {};
  if (catIds.length > 0) {
    const { data: cats } = await admin.from("categories").select("id, name").in("id", catIds);
    for (const c of cats ?? []) catMap[c.id] = { name: c.name };
  }

  return rows.map((r) => ({
    ...r,
    categories: r.category_id
      ? catMap[r.category_id] ?? { name: getCategoryLabel(r.category_id) }
      : null,
    provincias: r.provincia_id ? { name: getProvinceById(r.provincia_id)?.name ?? "" } : null,
    cantones: r.canton_id ? { name: getCantonById(r.canton_id)?.name ?? "" } : null,
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, categoryId, provinciaId, cantonId, budgetMin, budgetMax, timeline } = body;
    const cedula = cleanId(typeof body.cedula === "string" ? body.cedula : "");

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "Titulo y descripcion son requeridos" }, { status: 400 });
    }
    // Category is required: it routes the project to matching professionals.
    if (!categoryId) {
      return NextResponse.json({ error: "Elige una categoria para tu solicitud." }, { status: 400 });
    }
    if (!cedula || !isValidId(cedula)) {
      return NextResponse.json({ error: "Ingresa un numero de identificacion valido." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const uid = session.user.id;
    const admin = createAdminClient();

    const { data: dupe } = await admin
      .from("profiles")
      .select("id")
      .eq("cedula", cedula)
      .neq("id", uid)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json({ error: "Esta identificacion ya esta registrada en ContrataCR." }, { status: 409 });
    }

    let clientIdentityStatus: ClientIdentityStatus = "unverified";
    let officialName: string | null = null;
    let identityProvider: string | null = null;
    const idType = detectIdType(cedula);
    if (idType === "cedula") {
      const result = await getIdentityVerifier().lookup(cedula);
      identityProvider = result.provider;
      if (result.found) {
        clientIdentityStatus = "verified";
        officialName = result.fullName ?? null;
      } else {
        clientIdentityStatus = "unverified";
      }
    } else {
      clientIdentityStatus = "pending";
    }

    // Ensure the profiles row exists before inserting (client_id FK requires it).
    // Client identity verification uses the same padron-backed verifier as the
    // professional flow, but stores a client-specific status on profiles and a
    // project snapshot so Oportunidades can show it without exposing the ID.
    await admin.from("profiles").upsert({
      id: uid,
      email: session.user.email ?? "",
      full_name: officialName ||
                 (session.user.user_metadata?.full_name as string) ||
                 (session.user.user_metadata?.name as string) ||
                 session.user.email?.split("@")[0] || "",
      role: (session.user.user_metadata?.role as string) || "client",
      onboarding_completed: true,
      cedula,
      client_identity_status: clientIdentityStatus,
      client_identity_verified_at: clientIdentityStatus === "verified" ? new Date().toISOString() : null,
      client_identity_provider: identityProvider,
    }, { onConflict: "id", ignoreDuplicates: false });

    if (officialName) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(uid);
        await admin.auth.admin.updateUserById(uid, {
          user_metadata: { ...(authUser?.user?.user_metadata ?? {}), full_name: officialName },
        });
      } catch { /* profiles is the source of truth; auth metadata sync is best-effort */ }
    }

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
      client_identity_status: clientIdentityStatus,
      status: "open",
    }).select("id").single();

    if (error) {
      console.error("[POST /api/projects] Supabase error:", error.message, error.details);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify every professional whose profession matches the project category.
    // "Otro" is a FREEFORM catch-all: its custom text is not reliably comparable, so it
    // must never drive matching. An "Otro" project therefore notifies no one.
    if (categoryId && categoryId !== OTHER_CATEGORY.id) {
      try {
        const { data: pros } = await admin
          .from("professionals")
          .select("profile_id")
          .or("category_id.eq." + categoryId + ",professions.cs.{" + categoryId + "}");

        const recipients = [...new Set(
          (pros ?? []).map((p) => p.profile_id).filter((id): id is string => !!id && id !== uid)
        )];

        if (recipients.length > 0) {
          const label = getCategoryLabel(categoryId);
          const rows = recipients.map((profileId) => ({
            user_id: profileId,
            type: "new_project",
            title: "Nueva oportunidad en tu categoria",
            message: `Un cliente publico "${title.trim()}" en ${label}.`,
            data: { link: "/es/dashboard/profesional?tab=proposals", project_id: data.id },
          }));
          await admin.from("notifications").insert(rows);
        }
      } catch (notifyErr) {
        console.error("[POST /api/projects] notify pros failed:", notifyErr);
      }
    }

    return NextResponse.json({ id: data.id, success: true, clientIdentityStatus });
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
    const confirmed = await autoConfirmStale(admin, data ?? []);
    return NextResponse.json({ projects: await enrichProjects(confirmed) });
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
  // "Otro" is a FREEFORM catch-all, never a match key — drop it so an "Otro" pro is not
  // auto-matched to (unrelated) "Otro" projects. Their real professions still match.
  const matchable = professions.filter((p) => p && p !== OTHER_CATEGORY.id);

  let query = supabase
    .from("projects")
    .select(`*, profiles:client_id(full_name, avatar_url), proposals(id)`)
    .eq("status", "open")
    // No self-service: never list the pro's OWN projects in the "propose" feed.
    .neq("client_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (matchable.length > 0) {
    const inList = matchable.map((p) => `"${p}"`).join(",");
    // category in the pro's REAL professions OR the project has no category set
    query = query.or(`category_id.in.(${inList}),category_id.is.null`);
  } else if (categoryId && categoryId !== OTHER_CATEGORY.id) {
    // Fallback when the pro record is missing professions for some reason.
    query = query.eq("category_id", categoryId);
  } else {
    // Pro has no matchable (non-"Otro") profession → only UNcategorized projects
    // (visible to everyone); never the "Otro" bucket.
    query = query.is("category_id", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/projects] pro error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: await enrichProjects(data ?? []) });
}

// Lazy auto-confirm: if the pro marked work done > 7 days ago and the client
// never confirmed, the project auto-completes (anti-stall, both sides protected).
const AUTO_CONFIRM_DAYS = 7;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoConfirmStale(admin: any, rows: any[]): Promise<any[]> {
  const cutoff = Date.now() - AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000;
  const stale = rows.filter(
    (r) => r.status === "awaiting_confirmation" && r.work_done_at && new Date(r.work_done_at).getTime() < cutoff
  );
  if (stale.length > 0) {
    const now = new Date().toISOString();
    await admin.from("projects").update({ status: "completed", completed_at: now }).in("id", stale.map((s) => s.id));
    for (const r of stale) { r.status = "completed"; r.completed_at = now; }
  }
  return rows;
}

// Project status transitions:
//  - client: cancel/reopen their listing, confirm completion (action="confirm")
//  - accepted professional: mark work done (action="work_done")
// Decisions on a project are the client's own listing actions, reversible where
// it makes sense; completion is two-sided (pro marks → client confirms).
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, action } = body;
  if (!id) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const uid = session.user.id;
  const admin = createAdminClient();

  // ── Pro marks "trabajo realizado" → awaiting_confirmation ───────────────
  if (action === "work_done") {
    const { data: pro } = await admin.from("professionals").select("id").eq("profile_id", uid).maybeSingle();
    if (!pro) return NextResponse.json({ error: "Solo el profesional puede marcar el trabajo." }, { status: 403 });
    const { data: project } = await admin
      .from("projects")
      .select("id, client_id, accepted_professional_id, title, status")
      .eq("id", id)
      .maybeSingle();
    if (!project || project.accepted_professional_id !== pro.id) {
      return NextResponse.json({ error: "No autorizado para esta solicitud." }, { status: 403 });
    }
    if (project.status !== "in_progress") {
      return NextResponse.json({ error: "La solicitud no está en progreso." }, { status: 409 });
    }
    await admin.from("projects").update({ status: "awaiting_confirmation", work_done_at: new Date().toISOString() }).eq("id", id);
    // Notify the client to confirm.
    await admin.from("notifications").insert({
      user_id: project.client_id,
      type: "project_work_done",
      title: "Confirma la finalización del trabajo",
      message: `El profesional marcó "${project.title}" como realizado. Confirma para finalizarlo. Si no respondes en ${AUTO_CONFIRM_DAYS} días se confirma automáticamente.`,
      data: { link: "/es/dashboard/cliente?tab=projects", project_id: id },
    });
    return NextResponse.json({ success: true });
  }

  // ── Client confirms completion → completed ──────────────────────────────
  if (action === "confirm") {
    const { data: project } = await admin
      .from("projects")
      .select("id, client_id, accepted_professional_id, title, status")
      .eq("id", id)
      .maybeSingle();
    if (!project || project.client_id !== uid) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
    await admin.from("projects").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
    // Notify the professional.
    if (project.accepted_professional_id) {
      const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", project.accepted_professional_id).maybeSingle();
      if (pro?.profile_id) {
        await admin.from("notifications").insert({
          user_id: pro.profile_id,
          type: "project_completed",
          title: "Solicitud finalizada",
          message: `El cliente confirmó la finalización de "${project.title}". ¡Buen trabajo!`,
          data: { link: "/es/dashboard/profesional?tab=proposals", project_id: id },
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  // ── Client status changes (cancel / reopen) ─────────────────────────────
  const allowed = ["open", "cancelled"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  // Notify the assigned professional when the project is cancelled.
  if (status === "cancelled") await notifyAssignedPro(admin, id, "cancelled");

  // Authorize against the row, then persist with the service-role client (an
  // RLS-bound update could silently affect 0 rows, like the bookings bug).
  const { data: ownRow } = await admin.from("projects").select("client_id").eq("id", id).maybeSingle();
  if (!ownRow || ownRow.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await admin
    .from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Notify the accepted professional that a project was cancelled/deleted, so it
// disappears from their active work.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAssignedPro(admin: any, projectId: string, kind: "cancelled" | "deleted") {
  try {
    const { data: project } = await admin
      .from("projects")
      .select("title, accepted_professional_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project?.accepted_professional_id) return;
    const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", project.accepted_professional_id).maybeSingle();
    if (!pro?.profile_id) return;
    await admin.from("notifications").insert({
      user_id: pro.profile_id,
      type: "project_completed", // reuse an allowed project type for the channel
      title: kind === "deleted" ? "Solicitud eliminada" : "Solicitud cancelada",
      message: `El cliente ${kind === "deleted" ? "eliminó" : "canceló"} la solicitud "${project.title}". Ya no está activa.`,
      data: { link: "/es/dashboard/profesional?tab=proposals" },
    });
  } catch (e) {
    console.error("[notifyAssignedPro] failed:", e);
  }
}

// Client deletes their own project (and its proposals via FK cascade).
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  // Authorize against the row, then delete with the service-role client — the
  // RLS-bound delete could silently affect 0 rows (same class as the bookings bug).
  const { data: ownRow } = await admin.from("projects").select("client_id").eq("id", id).maybeSingle();
  if (!ownRow) return NextResponse.json({ success: true }); // already gone
  if (ownRow.client_id !== session.user.id) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  // Notify the assigned pro before the row (and its proposals) cascade away.
  await notifyAssignedPro(admin, id, "deleted");

  // Remove dependent proposals first (in case the FK isn't ON DELETE CASCADE).
  await admin.from("proposals").delete().eq("project_id", id);
  const { error } = await admin.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
