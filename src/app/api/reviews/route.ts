import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";
import { recordServerInteraction } from "@/lib/analytics/server-interactions";
import { validateReviewText } from "@/lib/moderation/reviews";

// Authenticated users can review a professional directly from the profile.
// If the review comes from a real booking/project/WhatsApp follow-up, we keep
// that context, but a completed item is no longer required.
export async function POST(req: NextRequest) {
  const { professionalId, rating, comment, bookingId, projectId, contactId } = await req.json();

  if (!professionalId || !rating) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }

  const r = Number(rating);
  if (!(r >= 0.5 && r <= 5 && r * 2 === Math.floor(r * 2))) {
    return NextResponse.json({ error: "Calificación inválida." }, { status: 400 });
  }

  const reviewText = validateReviewText(comment);
  if (!reviewText.ok) {
    return NextResponse.json({ error: reviewText.error }, { status: 400 });
  }
  const cleanComment = reviewText.comment;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const { data: targetPro } = await supabase
    .from("professionals")
    .select("profile_id, slug")
    .eq("id", professionalId)
    .maybeSingle();

  if (!targetPro) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  if (targetPro.profile_id === user.id) {
    return NextResponse.json({ error: "No puedes dejarte una reseña a ti mismo." }, { status: 400 });
  }

  let jobTitle: string | null = null;
  let reviewBookingId: string | null = null;
  let reviewProjectId: string | null = null;
  let reviewContactId: string | null = null;

  if (contactId) {
    const { data: contact } = await createAdminClient()
      .from("whatsapp_contact_followups")
      .select("id, service_name")
      .eq("id", contactId)
      .eq("client_id", user.id)
      .eq("professional_id", professionalId)
      .maybeSingle();
    if (contact) {
      reviewContactId = contactId;
      if (contact.service_name) jobTitle = String(contact.service_name).slice(0, 80);
    }
  } else if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, service_description")
      .eq("id", bookingId)
      .eq("client_id", user.id)
      .eq("professional_id", professionalId)
      .maybeSingle();
    if (booking) {
      reviewBookingId = bookingId;
      if (booking.service_description) jobTitle = String(booking.service_description).slice(0, 80);
    }
  } else if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", projectId)
      .eq("client_id", user.id)
      .eq("accepted_professional_id", professionalId)
      .maybeSingle();
    if (project) {
      reviewProjectId = projectId;
      if (project.title) jobTitle = String(project.title).slice(0, 80);
    }
  }

  let existingQuery = supabase
    .from("reviews")
    .select("id")
    .eq("client_id", user.id)
    .eq("professional_id", professionalId);

  if (reviewContactId) existingQuery = existingQuery.eq("whatsapp_contact_id", reviewContactId);
  else if (reviewBookingId) existingQuery = existingQuery.eq("booking_id", reviewBookingId);
  else if (reviewProjectId) existingQuery = existingQuery.eq("project_id", reviewProjectId);

  const { data: existing } = await existingQuery.limit(1).maybeSingle();

  if (existing) {
    let { error } = await supabase
      .from("reviews")
      .update({ rating, comment: cleanComment, edited_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error && /edited_at|column|schema cache|PGRST204/i.test(error.message)) {
      ({ error } = await supabase
        .from("reviews")
        .update({ rating, comment: cleanComment })
        .eq("id", existing.id));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await auditUserAction(createAdminClient(), req, {
      actorUserId: user.id,
      actorRole: "client",
      action: "review.edit",
      entityTable: "reviews",
      entityId: existing.id,
      entityOwnerUserId: user.id,
      afterData: {
        professional_id: professionalId,
        rating,
        comment: cleanComment,
        booking_id: reviewBookingId,
        project_id: reviewProjectId,
        whatsapp_contact_id: reviewContactId,
      },
    });

    return NextResponse.json({ ok: true, edited: true });
  }

  const row: Record<string, unknown> = {
    professional_id: professionalId,
    client_id: user.id,
    client_name_snapshot: profile?.full_name ?? (user.user_metadata?.full_name as string) ?? null,
    client_email_snapshot: profile?.email ?? user.email ?? null,
    rating,
    comment: cleanComment,
    ...writeSourceColumns(req),
  };
  if (reviewBookingId) row.booking_id = reviewBookingId;
  if (reviewProjectId) row.project_id = reviewProjectId;
  if (reviewContactId) row.whatsapp_contact_id = reviewContactId;
  if (jobTitle) row.job_title = jobTitle;

  let { data: insertedReview, error } = await supabase.from("reviews").insert(row).select("id").single();
  if (
    !reviewContactId &&
    error &&
    /client_.*snapshot|created_source|created_app|created_supabase|booking_id|project_id|job_title|column|schema cache|PGRST204/i.test(error.message)
  ) {
    ({ data: insertedReview, error } = await supabase
      .from("reviews")
      .insert({ professional_id: professionalId, client_id: user.id, rating, comment: cleanComment })
      .select("id")
      .single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (reviewContactId) {
    await createAdminClient()
      .from("whatsapp_contact_followups")
      .update({ status: "reviewed", updated_at: new Date().toISOString() })
      .eq("id", reviewContactId)
      .eq("client_id", user.id);
  }

  await auditUserAction(createAdminClient(), req, {
    actorUserId: user.id,
    actorRole: "client",
    action: "review.create",
    entityTable: "reviews",
    entityId: insertedReview?.id,
    entityOwnerUserId: user.id,
    afterData: {
      professional_id: professionalId,
      rating,
      comment: cleanComment,
      booking_id: reviewBookingId,
      project_id: reviewProjectId,
      whatsapp_contact_id: reviewContactId,
      job_title: jobTitle,
    },
  });

  if (targetPro.profile_id && targetPro.slug && insertedReview?.id) {
    const stars = Number(rating).toLocaleString("es-CR", { maximumFractionDigits: 1 });
    const clientName = profile?.full_name?.split(" ")[0] || "Un cliente";
    const admin = createAdminClient();
    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: targetPro.profile_id,
      type: "review_received",
      title: "Nueva reseña recibida",
      message: `${clientName} te dejó una reseña de ${stars} estrellas.`,
      data: {
        link: `/es/profesionales/${targetPro.slug}?tab=resenas#resenas`,
        professional_id: professionalId,
        review_id: insertedReview.id,
      },
    });
    if (notificationError) {
      console.error("[reviews] failed to notify professional:", notificationError.message);
    }
  }

  await recordServerInteraction(createAdminClient(), req, {
    type: "review_created",
    professionalId,
    viewerUserId: user.id,
    source: reviewBookingId ? "booking" : reviewProjectId ? "project" : reviewContactId ? "whatsapp_followup" : "profile",
    metadata: {
      booking_id: reviewBookingId,
      project_id: reviewProjectId,
      whatsapp_contact_id: reviewContactId,
      rating: r,
    },
  });

  return NextResponse.json({ ok: true, edited: false });
}

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
    const full = await supabase
      .from("reviews")
      .select("id, rating, comment, edited_at, professional_id, booking_id, project_id")
      .eq("client_id", user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reviews: any[] = full.data ?? [];
    if (full.error && /booking_id|project_id|column/i.test(full.error.message)) {
      const legacy = await supabase
        .from("reviews")
        .select("id, rating, comment, professional_id")
        .eq("client_id", user.id);
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
