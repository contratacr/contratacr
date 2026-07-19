import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";

// Per-finished-job reviews: a review is tied to a specific completed booking
// (solicitud) OR project (proyecto). A client can review EACH finished item with
// the same professional separately. The profile aggregates them.
export async function POST(req: Request) {
  const { professionalId, rating, comment, bookingId, projectId, contactId } = await req.json();

  if (!professionalId || !rating) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  // Ratings are half-steps in [0.5, 5] (e.g. 4.5). Reject anything else.
  const r = Number(rating);
  if (!(r >= 0.5 && r <= 5 && r * 2 === Math.floor(r * 2))) {
    return NextResponse.json({ error: "Calificación inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  // Self-interaction guard.
  const { data: targetPro } = await supabase
    .from("professionals").select("profile_id, slug").eq("id", professionalId).maybeSingle();
  if (targetPro?.profile_id === user.id) {
    return NextResponse.json({ error: "No puedes dejarte una reseña a ti mismo." }, { status: 400 });
  }

  // ── Verified-review gate, tied to the SPECIFIC finished item when given ──────
  // Also snapshot the job title so each per-job review shows its context.
  let allowed = false;
  let jobTitle: string | null = null;
  if (contactId) {
    const { data: contact } = await createAdminClient()
      .from("whatsapp_contact_followups")
      .select("id, service_name")
      .eq("id", contactId)
      .eq("client_id", user.id)
      .eq("professional_id", professionalId)
      .eq("status", "hired")
      .maybeSingle();
    allowed = !!contact;
    if (contact?.service_name) jobTitle = String(contact.service_name).slice(0, 80);
  } else if (bookingId) {
    const { data: b } = await supabase
      .from("bookings").select("id, service_description")
      .eq("id", bookingId).eq("client_id", user.id).eq("professional_id", professionalId)
      .eq("status", "completed").maybeSingle();
    allowed = !!b;
    if (b?.service_description) jobTitle = String(b.service_description).slice(0, 80);
  } else if (projectId) {
    const { data: pj } = await supabase
      .from("projects").select("id, title")
      .eq("id", projectId).eq("client_id", user.id).eq("accepted_professional_id", professionalId)
      .eq("status", "completed").maybeSingle();
    allowed = !!pj;
    if (pj?.title) jobTitle = String(pj.title).slice(0, 80);
  } else {
    // Legacy: any completed booking/project between this client and pro.
    const { data: cb } = await supabase
      .from("bookings").select("id").eq("client_id", user.id).eq("professional_id", professionalId).eq("status", "completed").limit(1).maybeSingle();
    allowed = !!cb;
    if (!allowed) {
      const { data: cp } = await supabase
        .from("projects").select("id").eq("client_id", user.id).eq("accepted_professional_id", professionalId).eq("status", "completed").limit(1).maybeSingle();
      allowed = !!cp;
    }
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "Solo puedes dejar una reseña después de completar este servicio con el profesional." },
      { status: 403 }
    );
  }

  // One review per finished item (or per pair when no item id). EDIT if it exists.
  let existingQuery = supabase.from("reviews").select("id").eq("client_id", user.id).eq("professional_id", professionalId);
  if (contactId) existingQuery = existingQuery.eq("whatsapp_contact_id", contactId);
  else if (bookingId) existingQuery = existingQuery.eq("booking_id", bookingId);
  else if (projectId) existingQuery = existingQuery.eq("project_id", projectId);
  const { data: existing } = await existingQuery.limit(1).maybeSingle();

  if (existing) {
    let { error } = await supabase
      .from("reviews").update({ rating, comment, edited_at: new Date().toISOString() }).eq("id", existing.id);
    if (error && /edited_at|column|schema cache|PGRST204/i.test(error.message)) {
      ({ error } = await supabase.from("reviews").update({ rating, comment }).eq("id", existing.id));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditUserAction(createAdminClient(), req, {
      actorUserId: user.id,
      actorRole: "client",
      action: "review.edit",
      entityTable: "reviews",
      entityId: existing.id,
      entityOwnerUserId: user.id,
      afterData: { professional_id: professionalId, rating, comment, booking_id: bookingId ?? null, project_id: projectId ?? null, whatsapp_contact_id: contactId ?? null },
    });
    return NextResponse.json({ ok: true, edited: true });
  }

  const row: Record<string, unknown> = {
    professional_id: professionalId,
    client_id: user.id,
    client_name_snapshot: profile?.full_name ?? (user.user_metadata?.full_name as string) ?? null,
    client_email_snapshot: profile?.email ?? user.email ?? null,
    rating,
    comment,
    ...writeSourceColumns(req),
  };
  if (bookingId) row.booking_id = bookingId;
  if (projectId) row.project_id = projectId;
  if (contactId) row.whatsapp_contact_id = contactId;
  if (jobTitle) row.job_title = jobTitle;
  let { data: insertedReview, error } = await supabase.from("reviews").insert(row).select("id").single();
  // Retry without the new columns if not migrated yet (migrations 035/036).
  if (!contactId && error && /client_.*snapshot|created_source|created_app|created_supabase|booking_id|project_id|job_title|column|schema cache|PGRST204/i.test(error.message)) {
    ({ data: insertedReview, error } = await supabase.from("reviews").insert({ professional_id: professionalId, client_id: user.id, rating, comment }).select("id").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (contactId) {
    await createAdminClient().from("whatsapp_contact_followups").update({
      status: "reviewed",
      updated_at: new Date().toISOString(),
    }).eq("id", contactId).eq("client_id", user.id);
  }
  await auditUserAction(createAdminClient(), req, {
    actorUserId: user.id,
    actorRole: "client",
    action: "review.create",
    entityTable: "reviews",
    entityId: insertedReview?.id,
    entityOwnerUserId: user.id,
    afterData: { professional_id: professionalId, rating, comment, booking_id: bookingId ?? null, project_id: projectId ?? null, whatsapp_contact_id: contactId ?? null, job_title: jobTitle },
  });
  if (targetPro?.profile_id && targetPro?.slug && insertedReview?.id) {
    const stars = Number(rating).toLocaleString("es-CR", { maximumFractionDigits: 1 });
    const clientName = profile?.full_name?.split(" ")[0] || "Un cliente";
    const admin = createAdminClient();
    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: targetPro.profile_id,
      type: "review_received",
      title: "Nueva reseña recibida",
      message: `${clientName} te dejó una reseña de ${stars} estrellas.`,
      data: {
        link: `/es/profesionales/${targetPro.slug}`,
        professional_id: professionalId,
        review_id: insertedReview.id,
      },
    });
    if (notificationError) {
      console.error("[reviews] failed to notify professional:", notificationError.message);
    }
  }
  return NextResponse.json({ ok: true, edited: false });
}

// GET: the user's existing review for an item (?bookingId / ?projectId), for a pro
// (?professionalId, legacy), or all of the user's reviews (?mine=1) so the panel
// can mark which finished items are already reviewed.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId");
  const projectId = url.searchParams.get("projectId");
  const professionalId = url.searchParams.get("professionalId");
  const contactId = url.searchParams.get("contactId");
  const mine = url.searchParams.get("mine");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ review: null, reviews: [] });

  if (mine) {
    // Best-effort: include booking_id/project_id when migrated.
    const full = await supabase
      .from("reviews").select("id, rating, comment, edited_at, professional_id, booking_id, project_id").eq("client_id", user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reviews: any[] = full.data ?? [];
    if (full.error && /booking_id|project_id|column/i.test(full.error.message)) {
      const legacy = await supabase.from("reviews").select("id, rating, comment, professional_id").eq("client_id", user.id);
      reviews = legacy.data ?? [];
    }
    return NextResponse.json({ reviews });
  }

  let q = supabase.from("reviews").select("id, rating, comment, edited_at").eq("client_id", user.id);
  if (contactId) q = q.eq("whatsapp_contact_id", contactId);
  else if (bookingId) q = q.eq("booking_id", bookingId);
  else if (projectId) q = q.eq("project_id", projectId);
  else if (professionalId) q = q.eq("professional_id", professionalId);
  else return NextResponse.json({ review: null });

  const { data } = await q.limit(1).maybeSingle();
  return NextResponse.json({ review: data ?? null });
}
