import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel, isHealthCategory, OTHER_CATEGORY } from "@/lib/data/categories";
import { getProvinceById, getCantonById } from "@/lib/data/cr-geography";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { syncProfessionalVerificationFromAccount } from "@/lib/verification/account-identity";
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
  // El título es la primera frase de lo que pidió; el servicio ya va aparte en
  // la tarjeta, y anteponerlo repetía la categoría y la descripción dos veces.
  const firstSentence = description.split(/[.\n!?]/)[0]?.trim() ?? "";
  if (firstSentence.length < 6) return serviceLabel.slice(0, PROJECT_TITLE_MAX_LENGTH);
  const snippet = firstSentence.length > 60 ? `${firstSentence.slice(0, 57).replace(/\s+\S*$/, "").trimEnd()}…` : firstSentence;
  return (snippet.charAt(0).toUpperCase() + snippet.slice(1)).slice(0, PROJECT_TITLE_MAX_LENGTH);
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
    const { title, description, categoryId, provinciaId, cantonId, budgetMin, budgetMax, timeline, phone } = body;
    const cedula = cleanId(typeof body.cedula === "string" ? body.cedula : "");
    const requestedFullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const cleanTitle = typeof title === "string" ? title.trim().slice(0, PROJECT_TITLE_MAX_LENGTH) : "";
    const cleanDescription = typeof description === "string" ? description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH) : "";
    const requestedForSomeoneElse = !!body.forSomeoneElse;
    const requestedBeneficiaryName = limitTrimmedText(body.beneficiaryName, NAME_MAX_LENGTH);
    const requestedBeneficiaryDob = typeof body.beneficiaryDob === "string" ? body.beneficiaryDob : "";

    if (!cleanDescription) {
      return NextResponse.json({ error: "Cuéntanos brevemente qué hay que hacer." }, { status: 400 });
    }
    // Category is required: it routes the project to matching professionals.
    if (!categoryId) {
      return NextResponse.json({ error: "Elige una categoria para tu proyecto." }, { status: 400 });
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

    // Sin WhatsApp el proyecto nace muerto: nadie tiene por dónde responder. Si
    // la cuenta no tiene número, el formulario lo pide y aquí se guarda.
    const telefonoGuardado = String(existingProfile?.phone ?? "").trim();
    const telefonoNuevo = String(phone ?? "").replace(/[^\d+]/gu, "").trim();
    const telefonoFinal = telefonoGuardado || telefonoNuevo;
    if (telefonoFinal.replace(/\D/gu, "").length < 8) {
      return NextResponse.json({ error: "Necesitamos tu WhatsApp para que te puedan responder." }, { status: 400 });
    }
    if (!telefonoGuardado && telefonoNuevo) {
      await admin.from("profiles").update({ phone: telefonoNuevo }).eq("id", uid);
    }

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
      // Publicar un proyecto ES pedir que lo contacten: no hay permiso que
      // preguntar. Lo que sí se exige es un número al que responder.
      allow_direct_contact: true,
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
      client_phone_snapshot: telefonoFinal,
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

    // Del intento más completo al mínimo; gana el primero que entra. La columna
    // allow_direct_contact llega con la migración 207 y los retratos del cliente
    // con otras anteriores: publicar no puede depender de que la base ya las
    // tenga. El 18-sep el código salió antes que la 207 y NADIE pudo publicar
    // un proyecto: el único reintento volvía a mandar la misma columna. Sin
    // ella el tablero funciona igual (filtra por fecha y su ausencia vale «sí»).
    const { allow_direct_contact: _sinColumna, ...sinPermiso } = baseProject;
    void _sinColumna;
    const intentos: Array<Record<string, unknown>> = [
      { ...baseProject, ...projectSnapshots, ...patientFields },
      { ...sinPermiso, ...projectSnapshots, ...patientFields },
      baseProject,
      sinPermiso,
    ];
    const insertar = (fila: Record<string, unknown>) => supabase.from("projects").insert(fila).select("id, created_at").single();
    let { data, error } = await insertar(intentos[0]);
    for (const fila of intentos.slice(1)) {
      if (!error) break;
      console.error("[POST /api/projects] intento fallido", error.message);
      ({ data, error } = await insertar(fila));
    }

    if (error) {
      console.error("[POST /api/projects] Supabase error:", error.message, error.details);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const projectId = data?.id;
    if (!projectId) {
      return NextResponse.json({ error: "No se pudo crear el proyecto." }, { status: 500 });
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
            title: "Nuevo proyecto",
            // «Respóndele y, si le interesa, te escribe» contaba el flujo de las
            // PROPUESTAS: el profesional respondia y esperaba que el cliente lo
            // eligiera. Hoy le escribe directo por WhatsApp desde el tablero.
            // (Y «publico» iba sin tilde: el push muestra este texto tal cual.)
            message: `Un cliente publicó "${finalTitle}" en ${label}. Escríbele por WhatsApp si te interesa.`,
            data: {
              link: "/es/proyectos",
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
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/projects] client error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const confirmed = await autoCloseStale(admin, data ?? []);
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
    .select("*, profiles:client_id(full_name, avatar_url)")
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
    title: "Cerramos tu proyecto por inactividad",
    message: `"${r.title}" llevaba ${AUTO_CLOSE_DAYS} días sin movimiento. Si todavía la necesitas, puedes volver a publicarla con un toque.`,
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

  // ── El cliente corrige lo que pidió ──────────────────────────────────────
  // Empleos y promociones se editan siempre; un proyecto no se editaba NUNCA:
  // una descripción con un dato equivocado obligaba a cancelar y volver a
  // publicar, perdiendo la fecha y a quien ya lo estaba mirando.
  //
  // Se toca solo lo que el cliente escribió: servicio, descripción y zona. El
  // estado, quién está elegido y las fechas no se tocan desde aquí —para eso
  // están las otras acciones—, y el título se vuelve a derivar del servicio y
  // la descripción, igual que al publicar, para que no se quede contando otra
  // cosa.
  if (action === "edit") {
    const { data: project } = await admin
      .from("projects")
      .select("client_id, status, title, description, category_id, provincia_id, canton_id")
      .eq("id", id)
      .maybeSingle();
    if (!project || project.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH) : "";
    if (!categoryId) return NextResponse.json({ error: "Elige el servicio que necesitas." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Cuéntanos qué hay que hacer." }, { status: 400 });

    const provinciaId = typeof body.provinciaId === "string" && body.provinciaId ? body.provinciaId : null;
    const cantonId = typeof body.cantonId === "string" && body.cantonId ? body.cantonId : null;
    const cambios = {
      category_id: categoryId,
      description,
      title: deriveTitle(getCategoryLabel(categoryId), description),
      provincia_id: provinciaId,
      canton_id: cantonId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("projects").update(cambios).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditUserAction(admin, req, {
      actorUserId: uid,
      actorRole: "client",
      action: "project.edit",
      entityTable: "projects",
      entityId: id,
      entityOwnerUserId: project.client_id,
      beforeData: { title: project.title, description: project.description, category_id: project.category_id, provincia_id: project.provincia_id, canton_id: project.canton_id },
      afterData: cambios,
    });
    return NextResponse.json({ success: true });
  }

  if (action === "archive") {
    const { data: project } = await admin.from("projects").select("client_id, status, title").eq("id", id).maybeSingle();
    if (!project || project.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (project.status !== "cancelled") return NextResponse.json({ error: "Solo puedes archivar proyectos cancelados." }, { status: 409 });
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
  // ── El cliente elige con quién sigue, SIN cerrar la solicitud ────────────
  // Antes solo se podía elegir al marcarla resuelta, así que un profesional
  // elegido siempre tenía el proyecto ya cerrado: nunca llegaba a cotizar ni a
  // coordinar desde el app.
  // CHOOSE / RESOLVE / WORK_DONE / CONFIRM: se retiraron con las propuestas.
  // Un proyecto ya no tiene profesional aceptado —se contesta por WhatsApp,
  // como un empleo o una promocion—, asi que no hay a quien elegir, nada que
  // marcar como realizado y nada que confirmar. Las columnas siguen en la base
  // con lo que ya se escribio; simplemente nadie vuelve a escribirlas.

  // ── Client status changes (cancel / reopen) ─────────────────────────────
  const allowed = ["open", "cancelled"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  // Authorize against the row, then persist with the service-role client (an
  // RLS-bound update could silently affect 0 rows, like the bookings bug).
  const { data: ownRow } = await admin.from("projects").select("client_id, status, title").eq("id", id).maybeSingle();
  if (!ownRow || ownRow.client_id !== uid) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  // CERRADO ES CERRADO, venga de donde venga. Antes solo se podia volver a
  // publicar un proyecto «cancelado»: los «completed» de la epoca de las
  // propuestas se quedaban sin salida y su fila del panel sin menu, mientras
  // un empleo cerrado siempre se puede republicar. Ahora las tres secciones se
  // comportan igual.
  if (status === "open" && ownRow.status !== "cancelled" && ownRow.status !== "completed") {
    return NextResponse.json({ error: "Este proyecto ya esta publicado." }, { status: 409 });
  }
  if (status === "open") {
    // Las propuestas viejas no vuelven con el proyecto: se respondieron en otra
    // epoca y quien las mando ya no tiene donde verlas.
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
  }
  return NextResponse.json({ success: true });
}

// Client deletes their own project.
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
  // Igual que en Empleos y Promociones: se borra lo que ya esta cerrado, sea
  // porque se cerro o porque se dio por terminado en su dia. Lo publicado no,
  // que para eso esta «Cerrar proyecto».
  if (ownRow.status !== "cancelled" && ownRow.status !== "completed") {
    return NextResponse.json({ error: "Primero cierra el proyecto." }, { status: 409 });
  }

  // Las propuestas historicas se van con el proyecto (por si la FK no fuera
  // ON DELETE CASCADE).
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
