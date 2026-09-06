import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel, isHealthCategory, OTHER_CATEGORY } from "@/lib/data/categories";
import { getProvinceById, getCantonById } from "@/lib/data/cr-geography";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { syncProfessionalVerificationFromAccount } from "@/lib/verification/account-identity";
import { AUTO_CONFIRM_DAYS } from "@/lib/completion";
import { parseMoneyAmount } from "@/lib/money-limits";
import { isMinorFromDob } from "@/lib/age";
import { NAME_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";
import { recordServerInteraction } from "@/lib/analytics/server-interactions";
import { sendNotificationPush, sendNotificationPushRows } from "@/lib/push/notify";

const PROJECT_TITLE_MAX_LENGTH = 80;
const PROJECT_DESCRIPTION_MAX_LENGTH = 300;
// Una solicitud abierta que nadie tocó en este plazo se cierra sola y se le avisa
// al cliente; puede volver a publicarla con un toque.
const AUTO_CLOSE_DAYS = 30;

function deriveTitle(serviceLabel: string, description: string): string {
  const firstSentence = description.split(/[.\n!?]/)[0]?.trim() ?? "";
  const snippet = firstSentence.length > 48 ? `${firstSentence.slice(0, 45).trimEnd()}…` : firstSentence;
  const title = snippet ? `${serviceLabel}: ${snippet}` : serviceLabel;
  return title.slice(0, PROJECT_TITLE_MAX_LENGTH);
}

type ClientIdentityStatus = "verified" | "pending" | "unverified";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveCategoryIsHealth(admin: any, categoryId: string | null | undefined): Promise<boolean> {
  if (!categoryId) return false;
  const { data, error } = await admin
    .from("categories")
    .select("es_salud")
    .eq("id", categoryId)
    .maybeSingle();
  if (!error && data && typeof data.es_salud === "boolean") return data.es_salud;
  return isHealthCategory(categoryId);
}

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
    const requestedFullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const cleanTitle = typeof title === "string" ? title.trim().slice(0, PROJECT_TITLE_MAX_LENGTH) : "";
    const cleanDescription = typeof description === "string" ? description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH) : "";
    const requestedForSomeoneElse = !!body.forSomeoneElse;
    const requestedBeneficiaryName = limitTrimmedText(body.beneficiaryName, NAME_MAX_LENGTH);
    const requestedBeneficiaryDob = typeof body.beneficiaryDob === "string" ? body.beneficiaryDob : "";

    if (!cleanDescription) {
      return NextResponse.json({ error: "Contanos brevemente qué hay que hacer." }, { status: 400 });
    }
    // Category is required: it routes the project to matching professionals.
    if (!categoryId) {
      return NextResponse.json({ error: "Elige una categoria para tu solicitud." }, { status: 400 });
    }
    // The form no longer asks for a title: the service name plus the start of the
    // description reads better in every list than what people typed.
    const derivedTitle = deriveTitle(getCategoryLabel(categoryId), cleanDescription);
    const finalTitle = cleanTitle || derivedTitle;
    if (cedula && !isValidId(cedula)) {
      return NextResponse.json({ error: "Ingresa un numero de identificacion valido." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const uid = user.id;
    const admin = createAdminClient();
    const categoryIsHealth = await resolveCategoryIsHealth(admin, categoryId);
    const forSomeoneElse = categoryIsHealth && requestedForSomeoneElse;
    const beneficiaryName = forSomeoneElse ? requestedBeneficiaryName : "";
    const beneficiaryDob = forSomeoneElse ? requestedBeneficiaryDob : "";

    if (forSomeoneElse && !beneficiaryName) {
      return NextResponse.json({ error: "Ingresa el nombre de la persona." }, { status: 400 });
    }
    if (forSomeoneElse && !beneficiaryDob) {
      return NextResponse.json({ error: "Ingresa la fecha de nacimiento de la persona." }, { status: 400 });
    }

    if (cedula) {
      const { data: dupe } = await admin
        .from("profiles")
        .select("id")
        .eq("cedula", cedula)
        .neq("id", uid)
        .maybeSingle();
      if (dupe) {
        return NextResponse.json({ error: "Esta identificacion ya esta registrada en ContrataCR." }, { status: 409 });
      }
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("full_name, email, phone, role, cedula, client_identity_status, client_identity_verified_at, client_identity_provider")
      .eq("id", uid)
      .maybeSingle();

    let clientIdentityStatus: ClientIdentityStatus =
      (existingProfile?.client_identity_status as ClientIdentityStatus | null) ?? "unverified";
    let officialName: string | null = null;
    let identityProvider: string | null = existingProfile?.client_identity_provider ?? null;
    let identityVerifiedAt: string | null = existingProfile?.client_identity_verified_at ?? null;
    if (cedula) {
      const idType = detectIdType(cedula);
      if (idType === "cedula") {
        const result = await getIdentityVerifier().lookup(cedula);
        if (result.unavailable) {
          return NextResponse.json({ error: "No pudimos consultar el padrón en este momento. Intenta de nuevo en unos minutos." }, { status: 503 });
        }
        identityProvider = result.provider;
        if (result.found) {
          clientIdentityStatus = "verified";
          officialName = result.fullName ?? null;
          identityVerifiedAt = new Date().toISOString();
        } else {
          clientIdentityStatus = "unverified";
          identityVerifiedAt = null;
        }
      } else {
        clientIdentityStatus = "pending";
        identityVerifiedAt = null;
      }
    }

    // Ensure the profiles row exists before inserting (client_id FK requires it).
    // Client identity verification uses the same padron-backed verifier as the
    // professional flow, but stores a client-specific status on profiles and a
    // project snapshot so Oportunidades can show it without exposing the ID.
    await admin.from("profiles").upsert({
      id: uid,
      email: user.email ?? "",
      full_name: officialName ||
                 existingProfile?.full_name ||
                 requestedFullName ||
                 (user.user_metadata?.full_name as string) ||
                 (user.user_metadata?.name as string) ||
                 user.email?.split("@")[0] || "",
      role: existingProfile?.role || (user.user_metadata?.role as string) || "client",
      onboarding_completed: true,
      ...(cedula ? { cedula } : {}),
      client_identity_status: clientIdentityStatus,
      client_identity_verified_at: clientIdentityStatus === "verified" ? identityVerifiedAt : null,
      client_identity_provider: identityProvider,
    }, { onConflict: "id", ignoreDuplicates: false });

    // Creating a project without submitting a new identity document must not
    // demote a separately verified professional profile on a dual-role account.
    // Synchronize the professional badge only when this request actually
    // revalidated (or rejected) a supplied account identity.
    if (cedula) {
      await syncProfessionalVerificationFromAccount(admin, uid, clientIdentityStatus, identityProvider);
    }

    if (officialName) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(uid);
        await admin.auth.admin.updateUserById(uid, {
          user_metadata: { ...(authUser?.user?.user_metadata ?? {}), full_name: officialName },
        });
      } catch { /* profiles is the source of truth; auth metadata sync is best-effort */ }
    }

    const baseProject = {
      client_id: uid,
      category_id: categoryId ?? null,
      title: finalTitle,
      description: cleanDescription,
      provincia_id: provinciaId ?? null,
      canton_id: cantonId ?? null,
      budget_min: parseMoneyAmount(budgetMin),
      budget_max: parseMoneyAmount(budgetMax),
      timeline: timeline ?? null,
      client_identity_status: clientIdentityStatus,
      status: "open",
    };
    const projectSnapshots = {
      client_name_snapshot:
        officialName ||
        existingProfile?.full_name ||
        requestedFullName ||
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email?.split("@")[0] ||
        "Cliente",
      client_email_snapshot: existingProfile?.email || user.email || null,
      client_phone_snapshot: existingProfile?.phone ?? null,
      ...writeSourceColumns(req),
    };
    const patientFields = categoryIsHealth
      ? {
          for_someone_else: forSomeoneElse,
          beneficiary_name: forSomeoneElse ? beneficiaryName : null,
          beneficiary_dob: forSomeoneElse ? beneficiaryDob : null,
          beneficiary_is_minor: forSomeoneElse && beneficiaryDob ? isMinorFromDob(beneficiaryDob) : false,
        }
      : {};

    let { data, error } = await supabase.from("projects").insert({ ...baseProject, ...projectSnapshots, ...patientFields }).select("id, created_at").single();
    if (error && /client_.*snapshot|created_source|created_app|created_supabase|for_someone_else|beneficiary_|column|schema cache|PGRST204|could not find/i.test(error.message)) {
      // Keep project publishing working if production schema has not received the
      // latest migration yet. Once migrations are applied, snapshots persist.
      ({ data, error } = await supabase.from("projects").insert(baseProject).select("id, created_at").single());
    }

    if (error) {
      console.error("[POST /api/projects] Supabase error:", error.message, error.details);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const projectId = data?.id;
    if (!projectId) {
      return NextResponse.json({ error: "No se pudo crear la solicitud." }, { status: 500 });
    }
    const projectCreatedAt = data?.created_at ?? null;

    await auditUserAction(admin, req, {
      actorUserId: uid,
      actorRole: existingProfile?.role ?? "client",
      action: "project.create",
      entityTable: "projects",
      entityId: projectId,
      entityOwnerUserId: uid,
      afterData: {
        title: finalTitle,
        category_id: categoryId ?? null,
        provincia_id: provinciaId ?? null,
        canton_id: cantonId ?? null,
        budget_min: parseMoneyAmount(budgetMin),
        budget_max: parseMoneyAmount(budgetMax),
        timeline: timeline ?? null,
        status: "open",
      },
      metadata: { client_identity_status: clientIdentityStatus },
    });

    await recordServerInteraction(admin, req, {
      type: "project_published",
      viewerUserId: uid,
      source: "project",
      categoryId: categoryId ?? null,
      metadata: {
        project_id: projectId,
        has_location: Boolean(provinciaId),
      },
    });

    let notifiedCount = 0;
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

        notifiedCount = recipients.length;
        if (recipients.length > 0) {
          const label = getCategoryLabel(categoryId);
          const rows = recipients.map((profileId) => ({
            user_id: profileId,
            type: "new_project",
            title: "Nueva solicitud de un cliente",
            message: `Un cliente publico "${finalTitle}" en ${label}. Respondele y, si le interesa, te escribe.`,
            data: {
              link: "/es/dashboard/profesional?tab=proposals",
              project_id: projectId,
              project_created_at: projectCreatedAt,
              project_title: finalTitle,
              category_id: categoryId,
            },
          }));
          await admin.from("notifications").insert(rows);
          await Promise.all(rows.map((row) => sendNotificationPush({
            userId: row.user_id,
            title: row.title,
            message: row.message,
            data: row.data,
          })));
        }
      } catch (notifyErr) {
        console.error("[POST /api/projects] notify pros failed:", notifyErr);
      }
    }

    return NextResponse.json({ id: projectId, notifiedCount, success: true, clientIdentityStatus });
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (role === "client") {
    // Use the admin client (scoped to this client's id) so a freshly created
    // project always shows up immediately, regardless of RLS read timing.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("projects")
      .select(`*, proposals(id, status)`)
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/projects] client error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const confirmed = await autoCloseStale(admin, await autoConfirmStale(admin, data ?? []));
    return NextResponse.json({ projects: await enrichProjects(confirmed.filter((project) => !project.archived_by_client)) });
  }

  // Professional: browse open projects that match ANY of their professions.
  // Filtering is enforced SERVER-SIDE from the pro's own record (never trusting a
  // client-supplied category) so a project is only ever visible to professionals
  // in that profession. Uncategorized projects stay visible to everyone.
  const admin = createAdminClient();
  const { data: proRow } = await admin
    .from("professionals")
    .select("category_id, professions")
    .eq("profile_id", user.id)
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

  let query = admin
    .from("projects")
    .select(`*, profiles:client_id(full_name, avatar_url), proposals(id)`)
    .eq("status", "open")
    // No self-service: never list the pro's OWN projects in the "propose" feed.
    .neq("client_id", user.id)
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
  // A professional browsing open projects gets the brief, never the client's
  // contact details or the beneficiary's identity: those are shared through
  // the proposal and chat flows once the client chooses to engage.
  const briefs = (data ?? []).map((row) => {
    const {
      client_name_snapshot: _name, client_email_snapshot: _email, client_phone_snapshot: _phone,
      beneficiary_name: _beneficiary, beneficiary_dob: _dob,
      created_source_host: _host, created_app_environment: _env, created_supabase_project_ref: _ref,
      ...brief
    } = row as Record<string, unknown>;
    void _name; void _email; void _phone; void _beneficiary; void _dob; void _host; void _env; void _ref;
    return brief;
  });
  return NextResponse.json({ projects: await enrichProjects(briefs) });
}

// Lazy auto-confirm: if the pro marked work done > AUTO_CONFIRM_DAYS and the client
// never confirmed, the project auto-completes (anti-stall, both sides protected).
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

// Abiertas sin actividad por AUTO_CLOSE_DAYS → canceladas (el cliente puede volver
// a publicar). Solo las filas que cambian aquí reciben el aviso, así no se repite.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoCloseStale(admin: any, rows: any[]): Promise<any[]> {
  const cutoff = Date.now() - AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000;
  const stale = rows.filter((r) => r.status === "open" && new Date(r.updated_at ?? r.created_at).getTime() < cutoff);
  if (stale.length === 0) return rows;
  const now = new Date().toISOString();
  await admin.from("projects").update({ status: "cancelled", updated_at: now }).in("id", stale.map((s) => s.id));
  const notifications = stale.map((r) => ({
    user_id: r.client_id,
    type: "project_cancelled",
    title: "Cerramos tu solicitud por inactividad",
    message: `"${r.title}" llevaba ${AUTO_CLOSE_DAYS} días sin movimiento. Si todavía la necesitás, podés volver a publicarla con un toque.`,
    data: { link: "/es/dashboard/profesional?tab=sent_projects", project_id: r.id, project_title: r.title, project_action: "auto_closed" },
  }));
  try {
    await admin.from("notifications").insert(notifications);
    await sendNotificationPushRows(notifications);
  } catch (e) {
    console.error("[autoCloseStale] notify failed:", e);
  }
  for (const r of stale) { r.status = "cancelled"; r.updated_at = now; }
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const uid = user.id;
  const admin = createAdminClient();

  if (action === "archive") {
    const { data: project } = await admin.from("projects").select("client_id, status, title").eq("id", id).maybeSingle();
    if (!project || project.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (project.status !== "cancelled") return NextResponse.json({ error: "Solo puedes archivar solicitudes canceladas." }, { status: 409 });
    const { error } = await admin.from("projects").update({ archived_by_client: true }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditUserAction(admin, req, {
      actorUserId: uid,
      actorRole: "client",
      action: "project.archive",
      entityTable: "projects",
      entityId: id,
      entityOwnerUserId: project.client_id,
      beforeData: { status: project.status, archived_by_client: false, title: project.title },
      afterData: { status: project.status, archived_by_client: true, title: project.title },
    });
    return NextResponse.json({ success: true });
  }

  // ── Client closes the request: "Ya lo resolví" (+ optionally who helped) ──
  if (action === "resolve") {
    const professionalId = typeof body.professionalId === "string" && body.professionalId ? body.professionalId : null;
    const { data: project } = await admin
      .from("projects")
      .select("id, client_id, accepted_professional_id, title, status")
      .eq("id", id)
      .maybeSingle();
    if (!project || project.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (project.status === "completed") return NextResponse.json({ success: true });
    if (project.status === "cancelled") return NextResponse.json({ error: "La solicitud está cancelada." }, { status: 409 });

    let chosenProfessionalId: string | null = null;
    if (professionalId) {
      // Only someone who actually replied can be credited (that is what a review hangs on).
      const { data: reply } = await admin
        .from("proposals")
        .select("id, professional_id")
        .eq("project_id", id)
        .eq("professional_id", professionalId)
        .maybeSingle();
      if (reply) {
        chosenProfessionalId = reply.professional_id;
        await admin.from("proposals").update({ status: "accepted" }).eq("id", reply.id);
      }
    }
    const now = new Date().toISOString();
    const { error } = await admin
      .from("projects")
      .update({ status: "completed", completed_at: now, updated_at: now, accepted_professional_id: chosenProfessionalId })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditUserAction(admin, req, {
      actorUserId: uid,
      actorRole: "client",
      action: "project.resolve",
      entityTable: "projects",
      entityId: id,
      entityOwnerUserId: project.client_id,
      beforeData: { status: project.status, accepted_professional_id: project.accepted_professional_id, title: project.title },
      afterData: { status: "completed", accepted_professional_id: chosenProfessionalId, title: project.title },
    });
    if (chosenProfessionalId) {
      const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", chosenProfessionalId).maybeSingle();
      if (pro?.profile_id) {
        const notification = {
          user_id: pro.profile_id,
          type: "project_completed",
          title: "El cliente te eligió",
          message: `El cliente cerró "${project.title}" y marcó que lo resolviste vos. ¡Buen trabajo!`,
          data: { link: "/es/dashboard/profesional?tab=proposals", project_id: id, project_title: project.title },
        };
        await admin.from("notifications").insert(notification);
        await sendNotificationPush({ userId: notification.user_id, title: notification.title, message: notification.message, data: notification.data });
      }
    }
    return NextResponse.json({ success: true, professionalId: chosenProfessionalId });
  }

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
    await auditUserAction(admin, req, {
      actorUserId: uid,
      actorRole: "professional",
      action: "project.mark_work_done",
      entityTable: "projects",
      entityId: id,
      entityOwnerUserId: project.client_id,
      beforeData: { status: project.status, accepted_professional_id: project.accepted_professional_id, title: project.title },
      afterData: { status: "awaiting_confirmation", accepted_professional_id: project.accepted_professional_id, title: project.title },
    });
    // Notify the client to confirm.
    const notification = {
      user_id: project.client_id,
      type: "project_work_done",
      title: "Confirma la finalización del trabajo",
      message: `El profesional marcó "${project.title}" como realizado. Confirma para finalizarlo. Si no respondes en ${AUTO_CONFIRM_DAYS} días se confirma automáticamente.`,
      data: {
        link: "/es/dashboard/profesional?tab=sent_projects",
        project_id: id,
        project_title: project.title,
        auto_confirm_days: AUTO_CONFIRM_DAYS,
      },
    };
    await admin.from("notifications").insert(notification);
    await sendNotificationPush({
      userId: notification.user_id,
      title: notification.title,
      message: notification.message,
      data: notification.data,
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
    await auditUserAction(admin, req, {
      actorUserId: uid,
      actorRole: "client",
      action: "project.confirm_completion",
      entityTable: "projects",
      entityId: id,
      entityOwnerUserId: project.client_id,
      beforeData: { status: project.status, accepted_professional_id: project.accepted_professional_id, title: project.title },
      afterData: { status: "completed", accepted_professional_id: project.accepted_professional_id, title: project.title },
    });
    // Notify the professional.
    if (project.accepted_professional_id) {
      const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", project.accepted_professional_id).maybeSingle();
      if (pro?.profile_id) {
        const notification = {
          user_id: pro.profile_id,
          type: "project_completed",
          title: "Oportunidad finalizada",
          message: `El cliente confirmó la finalización de "${project.title}". Buen trabajo.`,
          data: {
            link: "/es/dashboard/profesional?tab=proposals",
            project_id: id,
            project_title: project.title,
          },
        };
        await admin.from("notifications").insert(notification);
        await sendNotificationPush({
          userId: notification.user_id,
          title: notification.title,
          message: notification.message,
          data: notification.data,
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
  // Authorize against the row, then persist with the service-role client (an
  // RLS-bound update could silently affect 0 rows, like the bookings bug).
  const { data: ownRow } = await admin.from("projects").select("client_id, status, title").eq("id", id).maybeSingle();
  if (!ownRow || ownRow.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (status === "open" && ownRow.status !== "cancelled") {
    return NextResponse.json({ error: "Solo puedes volver a publicar solicitudes canceladas." }, { status: 409 });
  }
  if (status === "open") {
    await admin.from("proposals").delete().eq("project_id", id);
  }
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "open") {
    patch.accepted_professional_id = null;
    patch.work_done_at = null;
    patch.completed_at = null;
    patch.archived_by_client = false;
  }
  const { error } = await admin
    .from("projects")
    .update(patch)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditUserAction(admin, req, {
    actorUserId: uid,
    actorRole: "client",
    action: status === "open" ? "project.reopen" : "project.cancel",
    entityTable: "projects",
    entityId: id,
    entityOwnerUserId: ownRow.client_id,
    beforeData: { status: ownRow.status, title: ownRow.title },
    afterData: { status, title: ownRow.title },
  });
  if (status === "cancelled") {
    await notifyAssignedPro(admin, id, "cancelled");
  }
  return NextResponse.json({ success: true });
}

// Notify only professionals still affected by the cancellation/deletion. Declined
// proposals already received their outcome, so notifying them again is just noise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAssignedPro(admin: any, projectId: string, kind: "cancelled" | "deleted") {
  try {
    const { data: project } = await admin
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return;

    const { data: proposals } = await admin
      .from("proposals")
      .select("professional_id, status")
      .eq("project_id", projectId)
      .in("status", ["pending", "accepted"]);
    if (!proposals || proposals.length === 0) return;

    const professionalIds = new Set<string>();
    for (const proposal of proposals ?? []) {
      if (proposal.professional_id) professionalIds.add(proposal.professional_id);
    }
    if (professionalIds.size === 0) return;

    const { data: pros } = await admin
      .from("professionals")
      .select("profile_id")
      .in("id", [...professionalIds]);
    const profileIds: Array<string | null | undefined> = (pros ?? [])
      .map((pro: { profile_id?: string | null }) => pro.profile_id);
    const recipients: string[] = [...new Set(
      profileIds.filter((profileId): profileId is string => typeof profileId === "string" && profileId.length > 0),
    )];
    if (recipients.length === 0) return;

    const notifications = recipients.map((userId) => ({
      user_id: userId,
      type: kind === "deleted" ? "project_deleted" : "project_cancelled",
      title: kind === "deleted" ? "Solicitud eliminada" : "Solicitud cancelada",
      message: `El cliente ${kind === "deleted" ? "eliminó" : "canceló"} la solicitud "${project.title}". Ya no está activa.`,
      data: {
        link: "/es/dashboard/profesional?tab=proposals",
        project_id: projectId,
        project_title: project.title,
        project_action: kind,
      },
    }));
    await admin.from("notifications").insert(notifications);
    await sendNotificationPushRows(notifications);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  // Authorize against the row, then delete with the service-role client — the
  // RLS-bound delete could silently affect 0 rows (same class as the bookings bug).
  const { data: ownRow } = await admin.from("projects").select("client_id, status, title").eq("id", id).maybeSingle();
  if (!ownRow) return NextResponse.json({ success: true }); // already gone
  if (ownRow.client_id !== user.id) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (ownRow.status !== "cancelled") {
    return NextResponse.json({ error: "Solo puedes eliminar solicitudes canceladas." }, { status: 409 });
  }

  // Notify the affected professionals before the row (and its proposals) cascade away.
  await notifyAssignedPro(admin, id, "deleted");

  // Remove dependent proposals first (in case the FK isn't ON DELETE CASCADE).
  await admin.from("proposals").delete().eq("project_id", id);
  const { error } = await admin.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditUserAction(admin, req, {
    actorUserId: user.id,
    actorRole: "client",
    action: "project.delete",
    entityTable: "projects",
    entityId: id,
    entityOwnerUserId: ownRow.client_id,
    beforeData: { status: ownRow.status, title: ownRow.title },
    afterData: { deleted: true },
  });
  return NextResponse.json({ success: true });
}
