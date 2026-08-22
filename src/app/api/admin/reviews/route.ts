import { NextResponse } from "next/server";
import { getCategoryLabel } from "@/lib/data/categories";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateReviewText } from "@/lib/moderation/reviews";
import { auditUserAction } from "@/lib/audit/user-action";

type ReviewRow = {
  id: string;
  professional_id: string | null;
  client_id: string | null;
  rating: number;
  comment: string | null;
  job_title?: string | null;
  booking_id?: string | null;
  project_id?: string | null;
  whatsapp_contact_id?: string | null;
  created_at: string;
  edited_at?: string | null;
  client_name_snapshot?: string | null;
  client_email_snapshot?: string | null;
  moderation_status?: "published" | "hidden";
  moderation_reason?: string | null;
  moderated_at?: string | null;
};

export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? "50") || 50));

  const db = createAdminClient();
  const full = await db
    .from("reviews")
    .select("id, professional_id, client_id, rating, comment, job_title, booking_id, project_id, whatsapp_contact_id, created_at, edited_at, client_name_snapshot, client_email_snapshot, moderation_status, moderation_reason, moderated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  let rows = (full.data ?? []) as ReviewRow[];
  let error = full.error;
  if (error && /job_title|booking_id|project_id|whatsapp_contact_id|client_.*snapshot|edited_at|column|schema cache|PGRST204/i.test(error.message)) {
    const fallback = await db
      .from("reviews")
      .select("id, professional_id, client_id, rating, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    rows = (fallback.data ?? []) as ReviewRow[];
    error = fallback.error;
  }

  if (error) {
    console.error("[admin/reviews] list error:", error.message);
    return NextResponse.json({ error: "No se pudo cargar reseñas." }, { status: 500 });
  }

  const professionalIds = [...new Set(rows.map((row) => row.professional_id).filter(Boolean))] as string[];
  const clientIds = [...new Set(rows.map((row) => row.client_id).filter(Boolean))] as string[];

  const [professionalsRes, clientsRes] = await Promise.all([
    professionalIds.length
      ? db.from("professionals").select("id, business_name, slug, category_id, profiles(full_name)").in("id", professionalIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? db.from("profiles").select("id, full_name, email, avatar_url").in("id", clientIds)
      : Promise.resolve({ data: [] }),
  ]);

  const professionalMap = new Map((professionalsRes.data ?? []).map((item) => [item.id, item]));
  const clientMap = new Map((clientsRes.data ?? []).map((item) => [item.id, item]));

  const enriched = rows.map((row) => {
    const professional = row.professional_id ? professionalMap.get(row.professional_id) : null;
    const client = row.client_id ? clientMap.get(row.client_id) : null;
    const moderation = validateReviewText(row.comment ?? "");
    const source = row.whatsapp_contact_id
      ? "WhatsApp"
      : row.booking_id
        ? "Solicitud"
        : row.project_id
          ? "Proyecto"
          : "Perfil";

    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment ?? "",
      jobTitle: row.job_title ?? null,
      createdAt: row.created_at,
      editedAt: row.edited_at ?? null,
      source,
      needsReview: !moderation.ok,
      moderationStatus: row.moderation_status ?? "published",
      moderationReason: row.moderation_reason ?? null,
      moderatedAt: row.moderated_at ?? null,
      professional: {
        id: row.professional_id,
        name: professional?.business_name || (professional?.profiles as { full_name?: string | null } | null)?.full_name || "Profesional",
        slug: professional?.slug ?? null,
        profession: professional?.category_id ? getCategoryLabel(professional.category_id) : null,
      },
      client: {
        id: row.client_id,
        name: client?.full_name || row.client_name_snapshot || "Cliente",
        email: client?.email || row.client_email_snapshot || null,
        avatarUrl: client?.avatar_url ?? null,
      },
    };
  });

  const filtered = q
    ? enriched.filter((row) =>
        `${row.comment} ${row.professional.name} ${row.client.name} ${row.client.email ?? ""} ${row.source}`
          .toLowerCase()
          .includes(q)
      )
    : enriched;

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return NextResponse.json({
    reviews: filtered.slice(start, start + pageSize),
    counts: {
      total,
      needsReview: filtered.filter((row) => row.needsReview).length,
      profile: filtered.filter((row) => row.source === "Perfil").length,
      hidden: filtered.filter((row) => row.moderationStatus === "hidden").length,
    },
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

async function parseModerationRequest(req: Request) {
  const body = await req.json().catch(() => null) as { id?: unknown; action?: unknown; reason?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  return { id, action: body?.action, reason };
}

export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, action, reason } = await parseModerationRequest(req);
  if (!id || (action !== "hide" && action !== "restore") || reason.length < 3) {
    return NextResponse.json({ error: "Indica la reseña, la acción y un motivo." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: before, error: readError } = await db
    .from("reviews")
    .select("id, client_id, professional_id, moderation_status, moderation_reason")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Reseña no encontrada." }, { status: 404 });

  const after = {
    moderation_status: action === "hide" ? "hidden" : "published",
    moderation_reason: reason,
    moderated_at: new Date().toISOString(),
    moderated_by: admin.id,
  };
  const { error } = await db.from("reviews").update(after).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditUserAction(db, req, {
    actorUserId: admin.id,
    actorRole: "admin",
    action: action === "hide" ? "review.hide" : "review.restore",
    entityTable: "reviews",
    entityId: id,
    entityOwnerUserId: before.client_id,
    beforeData: before,
    afterData: after,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, reason } = await parseModerationRequest(req);
  if (!id || reason.length < 3) {
    return NextResponse.json({ error: "Indica la reseña y el motivo de eliminación." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: before, error: readError } = await db.from("reviews").select("*").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Reseña no encontrada." }, { status: 404 });

  const { error } = await db.from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditUserAction(db, req, {
    actorUserId: admin.id,
    actorRole: "admin",
    action: "review.delete",
    entityTable: "reviews",
    entityId: id,
    entityOwnerUserId: before.client_id,
    beforeData: before,
    afterData: { deletion_reason: reason },
  });
  return NextResponse.json({ ok: true });
}
