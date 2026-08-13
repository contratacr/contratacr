import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMoneyAmount } from "@/lib/money-limits";
import { LONG_TEXT_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";
import { recordServerInteraction } from "@/lib/analytics/server-interactions";
import { sendNotificationPush, sendNotificationPushRows } from "@/lib/push/notify";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, price, message } = body;

    const safeMessage = limitTrimmedText(message, LONG_TEXT_MAX_LENGTH);
    if (!projectId || !safeMessage) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const admin = createAdminClient();
    const { data: pro, error: proError } = await admin
      .from("professionals")
      .select("id, profiles:profile_id(full_name, email)")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (proError) {
      console.error("[POST /api/proposals] professional lookup failed:", proError);
      return NextResponse.json({ error: "No se pudo validar tu perfil profesional." }, { status: 500 });
    }
    if (!pro) return NextResponse.json({ error: "Solo profesionales pueden enviar propuestas" }, { status: 403 });

    // No self-service: a professional cannot send a proposal to their OWN project.
    const { data: project } = await admin
      .from("projects").select("client_id, title").eq("id", projectId).maybeSingle();
    if (project?.client_id === user.id) {
      return NextResponse.json({ error: "No puedes enviar una propuesta a tu propia solicitud." }, { status: 400 });
    }

    const profile = pro.profiles as { full_name?: string | null; email?: string | null } | null;
    const proposalInsert = {
      project_id: projectId,
      professional_id: pro.id,
      professional_user_id_snapshot: user.id,
      professional_name_snapshot: profile?.full_name ?? null,
      professional_email_snapshot: profile?.email ?? user.email ?? null,
      price: parseMoneyAmount(price),
      message: safeMessage,
      status: "pending",
      ...writeSourceColumns(req),
    };
    let { data, error } = await admin.from("proposals").insert(proposalInsert).select("id").single();
    if (error && /professional_.*snapshot|created_source|created_app|created_supabase|column|schema cache|PGRST204|could not find/i.test(error.message)) {
      ({ data, error } = await admin.from("proposals").insert({
        project_id: projectId,
        professional_id: pro.id,
        price: parseMoneyAmount(price),
        message: safeMessage,
        status: "pending",
      }).select("id").single());
    }

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya enviaste una propuesta para esta solicitud" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.id) {
      return NextResponse.json({ error: "No se pudo crear la propuesta." }, { status: 500 });
    }

    await auditUserAction(admin, req, {
      actorUserId: user.id,
      actorRole: "professional",
      action: "proposal.create",
      entityTable: "proposals",
      entityId: data.id,
      entityOwnerUserId: user.id,
      afterData: {
        project_id: projectId,
        professional_id: pro.id,
        price: parseMoneyAmount(price),
        message: safeMessage,
        status: "pending",
      },
    });

    await recordServerInteraction(admin, req, {
      type: "proposal_sent",
      professionalId: pro.id,
      viewerUserId: user.id,
      source: "project",
      metadata: {
        project_id: projectId,
        proposal_id: data.id,
      },
    });

    try {
      if (project?.client_id) {
        const pushData = {
          link: "/es/dashboard/profesional?tab=sent_projects",
          project_id: projectId,
          proposal_id: data.id,
          professional_name: profile?.full_name ?? "Un profesional",
          project_title: project.title ?? "tu solicitud",
        };
        await sendNotificationPush({
          userId: project.client_id,
          title: "Nueva propuesta recibida",
          message: `${profile?.full_name ?? "Un profesional"} envio una propuesta para "${project.title ?? "tu solicitud"}".`,
          data: pushData,
        });
      }
    } catch (notifyErr) {
      console.error("[POST /api/proposals] notify proposal failed:", notifyErr);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (mine === "true") {
    // Professional: my sent proposals
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", user.id)
      .single();
    if (!pro) return NextResponse.json({ proposals: [] });

    // Ownership was verified above. Use the service client so RLS does not hide
    // declined proposals from the professional's own history.
    const admin = createAdminClient();
    const { data, error } = await admin
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
    const projIds = [...new Set((data ?? []).map((p) => p.project_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projMap: Record<string, any> = {};
    if (projIds.length > 0) {
      const { data: projs } = await admin
        .from("projects")
        .select("id, title, status, client_id, profiles:client_id(full_name, avatar_url, phone)")
        .in("id", projIds);
      for (const pj of projs ?? []) projMap[pj.id] = pj;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = (data ?? []).filter((p: any) => !p.archived_by_professional).map((p: any) => {
      const pj = projMap[p.project_id];
      if (pj) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prof = pj.profiles as any;
        const profiles = p.status === "accepted"
          ? prof
          : prof ? { full_name: prof.full_name, avatar_url: prof.avatar_url } : prof;
        p.projects = { title: pj.title, status: pj.status, profiles };
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
        id, slug, whatsapp, verification_status,
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
    const { id, status, price, message, action } = body;
    if (!id) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // ── Professional edits their OWN pending proposal (price / message) ──────
    if (action === "archive") {
      const { data: pro } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
      if (!pro) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      const admin = createAdminClient();
      const { data: prop } = await admin
        .from("proposals")
        .select("professional_id, status, projects:project_id(status)")
        .eq("id", id)
        .maybeSingle();
      if (!prop || prop.professional_id !== pro.id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectStatus = (prop.projects as any)?.status;
      if (prop.status !== "declined" && projectStatus !== "cancelled") {
        return NextResponse.json({ error: "Solo puedes archivar propuestas canceladas." }, { status: 409 });
      }
      const { error } = await admin.from("proposals").update({ archived_by_professional: true }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (status === undefined && (price !== undefined || message !== undefined)) {
      const { data: pro } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
      if (!pro) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      const { data: prop } = await supabase.from("proposals").select("status, professional_id").eq("id", id).maybeSingle();
      if (!prop || prop.professional_id !== pro.id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      if (prop.status !== "pending") return NextResponse.json({ error: "Solo puedes editar una propuesta pendiente." }, { status: 409 });
      const patch: Record<string, unknown> = {};
      if (price !== undefined) patch.price = parseMoneyAmount(price);
      if (message !== undefined) patch.message = limitTrimmedText(message, LONG_TEXT_MAX_LENGTH);
      // Persist with the service-role client: the RLS-bound update can silently
      // affect 0 rows if no UPDATE policy covers the professional (edits were lost).
      const admin = createAdminClient();
      const { error: e } = await admin.from("proposals").update(patch).eq("id", id);
      if (e) return NextResponse.json({ error: e.message }, { status: 500 });
      await auditUserAction(admin, req, {
        actorUserId: user.id,
        actorRole: "professional",
        action: "proposal.edit",
        entityTable: "proposals",
        entityId: id,
        entityOwnerUserId: user.id,
        afterData: patch,
        metadata: { professional_id: pro.id },
      });
      try {
        const { data: updated } = await admin
          .from("proposals")
          .select("project_id, projects:project_id(title, client_id)")
          .eq("id", id)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const project = (updated as any)?.projects;
        if (updated?.project_id && project?.client_id) {
          const notification = {
            user_id: project.client_id,
            type: "proposal_updated",
            title: "Propuesta actualizada",
            message: `Un profesional actualizó su propuesta para "${project.title ?? "tu solicitud"}".`,
            data: {
              link: "/es/dashboard/profesional?tab=sent_projects",
              project_id: updated.project_id,
              project_title: project.title ?? "tu solicitud",
            },
          };
          await admin.from("notifications").insert(notification);
          await sendNotificationPush({ userId: notification.user_id, ...notification });
        }
      } catch (notifyErr) {
        console.error("[PATCH /api/proposals] notify proposal update failed:", notifyErr);
      }
      return NextResponse.json({ success: true });
    }

    if (!status) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

    const adminStatus = createAdminClient();
    const { data: statusProposal } = await adminStatus
      .from("proposals")
      .select("project_id, professional_id, projects:project_id(client_id)")
      .eq("id", id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectOwnerId = (statusProposal as any)?.projects?.client_id;
    if (!statusProposal || projectOwnerId !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Persist via service-role so the status change isn't silently dropped by RLS.
    const { error } = await adminStatus
      .from("proposals")
      .update({ status })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditUserAction(adminStatus, req, {
      actorUserId: user.id,
      actorRole: "client",
      action: `proposal.status.${status}`,
      entityTable: "proposals",
      entityId: id,
      entityOwnerUserId: projectOwnerId,
      afterData: { status },
      metadata: {
        project_id: statusProposal.project_id,
        professional_id: statusProposal.professional_id,
      },
    });

    // Reverting an accepted decision (→ pending/declined): reopen the project and
    // clear the accepted professional so the client can choose again.
    if (status === "pending" || status === "declined") {
      try {
        const admin = createAdminClient();
        const { data: prop } = await admin
          .from("proposals")
          .select("project_id, professional_id, projects:project_id(title)")
          .eq("id", id)
          .maybeSingle();
        if (prop?.project_id) {
          const { data: project } = await admin.from("projects").select("accepted_professional_id, status").eq("id", prop.project_id).maybeSingle();
          if (project?.accepted_professional_id === prop.professional_id) {
            await admin.from("projects").update({ status: "open", accepted_professional_id: null }).eq("id", prop.project_id);
          }
          if (status === "declined") {
            const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", prop.professional_id).maybeSingle();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const title = (prop.projects as any)?.title ?? "tu solicitud";
            if (pro?.profile_id) {
              const notification = {
                user_id: pro.profile_id,
                type: "project_proposal_declined",
                title: "Propuesta no seleccionada",
                message: `El cliente no seleccionó tu propuesta para "${title}".`,
                data: {
                  link: "/es/dashboard/profesional?tab=proposals",
                  project_id: prop.project_id,
                  project_title: title,
                  proposal_outcome: "not_selected",
                },
              };
              await admin.from("notifications").insert(notification);
              await sendNotificationPush({ userId: notification.user_id, ...notification });
            }
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
          const { data: otherPending } = await admin
            .from("proposals")
            .select("professional_id")
            .eq("project_id", prop.project_id)
            .neq("id", id)
            .eq("status", "pending");
          await admin
            .from("projects")
            .update({ status: "in_progress", accepted_professional_id: prop.professional_id })
            .eq("id", prop.project_id);
          await admin
            .from("proposals")
            .update({ status: "declined" })
            .eq("project_id", prop.project_id)
            .neq("id", id)
            .eq("status", "pending");
          const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", prop.professional_id).maybeSingle();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const title = (prop.projects as any)?.title ?? "tu propuesta";
          const otherProfessionalIds = [...new Set((otherPending ?? []).map((p) => p.professional_id).filter(Boolean))];
          if (otherProfessionalIds.length > 0) {
            const { data: otherPros } = await admin
              .from("professionals")
              .select("profile_id")
              .in("id", otherProfessionalIds);
            const rows = (otherPros ?? []).filter((p) => p.profile_id).map((p) => ({
              user_id: p.profile_id,
              type: "project_proposal_declined",
              title: "Propuesta no seleccionada",
              message: `El cliente eligió otra propuesta para "${title}".`,
              data: {
                link: "/es/dashboard/profesional?tab=proposals",
                project_id: prop.project_id,
                project_title: title,
                proposal_outcome: "another_selected",
              },
            }));
            if (rows.length > 0) {
              await admin.from("notifications").insert(rows);
              await sendNotificationPushRows(rows);
            }
          }
          if (pro?.profile_id) {
            const notification = {
              user_id: pro.profile_id,
              type: "project_proposal_accepted",
              title: "¡Tu propuesta fue aceptada!",
              message: `El cliente aceptó tu propuesta para "${title}". Coordina el trabajo y márcalo como realizado al terminar.`,
              data: {
                link: "/es/dashboard/profesional?tab=proposals",
                project_id: prop.project_id,
                project_title: title,
              },
            };
            await admin.from("notifications").insert(notification);
            await sendNotificationPush({ userId: notification.user_id, ...notification });
            await recordServerInteraction(admin, req, {
              type: "proposal_accepted",
              professionalId: prop.professional_id,
              viewerUserId: user.id,
              source: "project",
              metadata: {
                project_id: prop.project_id,
                proposal_id: id,
              },
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: pro } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!pro) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { data: prop } = await supabase
    .from("proposals")
    .select("status, professional_id, project_id, projects(title, client_id)")
    .eq("id", id)
    .maybeSingle();
  if (!prop || prop.professional_id !== pro.id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (prop.status !== "pending") return NextResponse.json({ error: "Solo puedes cancelar una propuesta pendiente." }, { status: 409 });

  // Delete via the service-role client: an RLS-bound delete silently affects 0 rows when
  // no DELETE policy covers the professional, so "Retirar propuesta" appeared to work but
  // never persisted (same class of bug as the PATCH edit above). Ownership + pending are
  // already verified above, so this is safe.
  const admin = createAdminClient();
  const { error } = await admin.from("proposals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditUserAction(admin, req, {
    actorUserId: user.id,
    actorRole: "professional",
    action: "proposal.delete",
    entityTable: "proposals",
    entityId: id,
    entityOwnerUserId: user.id,
    beforeData: { status: prop.status, project_id: prop.project_id, professional_id: prop.professional_id },
    afterData: { deleted: true },
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = (prop as any).projects;
    if (project?.client_id) {
      const notification = {
        user_id: project.client_id,
        type: "proposal_withdrawn",
        title: "Propuesta retirada",
        message: `Un profesional retiró su propuesta para "${project.title ?? "tu solicitud"}".`,
        data: {
          link: "/es/dashboard/profesional?tab=sent_projects",
          project_id: prop.project_id,
          project_title: project.title ?? "tu solicitud",
        },
      };
      await admin.from("notifications").insert(notification);
      await sendNotificationPush({ userId: notification.user_id, ...notification });
    }
  } catch (e) {
    console.error("[DELETE /api/proposals] notify withdrawn failed:", e);
  }
  return NextResponse.json({ success: true });
}
