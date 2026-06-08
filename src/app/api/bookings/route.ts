import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewBooking, notifyBookingStatusChange } from "@/lib/notifications";

// Lazy auto-confirm: a booking the pro marked "trabajo realizado" auto-completes
// 7 days after work_done_at if the client never confirmed. Best-effort.
async function autoConfirmStale(admin: ReturnType<typeof createAdminClient>, filter: { professional_id?: string; client_id?: string }) {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let q = admin.from("bookings").update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("status", "awaiting_confirmation").lt("work_done_at", cutoff);
    if (filter.professional_id) q = q.eq("professional_id", filter.professional_id);
    if (filter.client_id) q = q.eq("client_id", filter.client_id);
    await q;
  } catch { /* column may not be migrated yet */ }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { professionalId, clientCedula, clientName, clientEmail, serviceDescription, preferredDateText } = body;

    if (!professionalId || !serviceDescription) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();

    // Check if an authenticated user session exists to link the booking
    const { data: { session } } = await supabase.auth.getSession();

    // Self-interaction guard: a professional cannot request a service from themselves.
    if (session?.user) {
      const admin = createAdminClient();
      const { data: targetPro } = await admin
        .from("professionals")
        .select("profile_id")
        .eq("id", professionalId)
        .maybeSingle();
      if (targetPro?.profile_id === session.user.id) {
        return NextResponse.json({ error: "No podés solicitarte un servicio a vos mismo." }, { status: 400 });
      }
    }

    const {
      scheduledDate, scheduledTime, clientPhone, clientDob,
      forSomeoneElse, beneficiaryName, beneficiaryCedula, beneficiaryDob, beneficiaryPhone, beneficiaryIsMinor,
    } = body;

    const baseBooking = {
      professional_id: professionalId,
      client_id: session?.user?.id ?? null,
      client_cedula: clientCedula ?? null,
      client_name: clientName,
      client_email: clientEmail ?? null,
      client_phone: clientPhone ?? null,
      service_description: serviceDescription,
      preferred_date_text: preferredDateText ?? null,
      scheduled_date: scheduledDate ?? null,
      scheduled_time: scheduledTime ?? null,
      status: "pending",
    };
    // Beneficiary fields (booking for someone else) — optional; retried-away if
    // the columns aren't migrated yet (migration 032).
    const beneficiaryFields = {
      for_someone_else: !!forSomeoneElse,
      beneficiary_name: beneficiaryName ?? null,
      beneficiary_cedula: beneficiaryCedula ?? null,
      beneficiary_dob: beneficiaryDob ?? null,
      beneficiary_phone: beneficiaryPhone ?? null,
      beneficiary_is_minor: !!beneficiaryIsMinor,
      // Client DOB — sent only for HEALTH-category services (data minimization).
      client_dob: clientDob ?? null,
    };

    let { data, error } = await supabase.from("bookings").insert({ ...baseBooking, ...beneficiaryFields }).select("id").single();
    if (error && /for_someone_else|beneficiary_|client_dob|column|schema cache|PGRST204|could not find/i.test(error.message)) {
      ({ data, error } = await supabase.from("bookings").insert(baseBooking).select("id").single());
    }

    if (error) {
      console.error("[POST /api/bookings]", error);
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }

    // Notify the professional (in-app + email + optional WhatsApp). Best-effort.
    await notifyNewBooking({
      professionalId,
      bookingId: data.id,
      clientName: clientName || "Un cliente",
      serviceDescription,
      whenText: preferredDateText ?? null,
    });

    // If email provided and no session, send magic link to create / sign in account
    if (clientEmail && !session?.user) {
      await supabase.auth.signInWithOtp({
        email: clientEmail,
        options: {
          data: { cedula: clientCedula, full_name: clientName },
        },
      });
    }

    return NextResponse.json({ id: data.id, success: true });
  } catch (err) {
    console.error("[POST /api/bookings] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");

  // Public: taken slots for a professional (date + time only, no PII).
  // Lets the booking calendar hide slots already booked by other clients.
  const takenForPro = searchParams.get("takenFor");
  if (takenForPro) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("bookings")
      .select("scheduled_date, scheduled_time")
      .eq("professional_id", takenForPro)
      .in("status", ["pending", "confirmed", "in_progress"])
      .not("scheduled_date", "is", null)
      .not("scheduled_time", "is", null);
    return NextResponse.json({
      // Normalize time to HH:MM (Postgres `time` may return HH:MM:SS).
      taken: (data ?? []).map((b) => `${b.scheduled_date} ${String(b.scheduled_time).slice(0, 5)}`),
    });
  }

  const supabase = await createClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (role === "professional") {
    // Get professional ID for this user
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", session.user.id)
      .single();

    if (!pro) return NextResponse.json({ bookings: [] });

    await autoConfirmStale(createAdminClient(), { professional_id: pro.id });

    const { data } = await supabase
      .from("bookings")
      .select("*, profiles:client_id(full_name, avatar_url, is_flagged)")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ bookings: data ?? [] });
  }

  // Client role.
  await autoConfirmStale(createAdminClient(), { client_id: session.user.id });
  // NOTE: professionals↔categories has no FK (category_id is plain text), so an
  // embedded categories(...) join 500s and silently drops every booking. Select
  // category_id as a column instead.
  const { data, error } = await supabase
    .from("bookings")
    .select("*, professionals(slug, category_id, profiles(full_name, avatar_url))")
    .eq("client_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/bookings] client error:", error.message);
    return NextResponse.json({ error: error.message, bookings: [] }, { status: 500 });
  }
  return NextResponse.json({ bookings: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, cancelReason } = body;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Identify who is updating (professional vs client) to set ownership fields and
  // notify the OTHER party on every state change.
  const { data: actorPro } = await supabase
    .from("professionals")
    .select("id")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  // Authorize against the actual row, then persist with the service-role client.
  // (The RLS-bound update could silently affect 0 rows if no UPDATE policy covers
  // the professional — which is exactly why confirm/complete wasn't persisting.)
  const admin = createAdminClient();
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id, professional_id, client_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!bookingRow) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

  const isOwnerPro = !!actorPro && bookingRow.professional_id === actorPro.id;
  const isOwnerClient = bookingRow.client_id === session.user.id;
  if (!isOwnerPro && !isOwnerClient) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status, updated_at: now };
  // Lifecycle timestamps + cancellation ownership (migration 033).
  if (status === "awaiting_confirmation") update.work_done_at = now;
  if (status === "completed") update.completed_at = now;
  if (status === "cancelled") {
    update.cancelled_by = isOwnerPro ? "professional" : "client";
    if (typeof cancelReason === "string" && cancelReason.trim()) update.cancel_reason = cancelReason.trim();
  }

  let { error } = await admin.from("bookings").update(update).eq("id", id);
  // Retry without the new lifecycle columns if not migrated yet.
  if (error && /work_done_at|completed_at|cancelled_by|cancel_reason|column|schema cache|PGRST204/i.test(error.message)) {
    ({ error } = await admin.from("bookings").update({ status, updated_at: now }).eq("id", id));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the OTHER party on every state change (best-effort, never blocks).
  if (status === "confirmed" || status === "cancelled") {
    await notifyBookingStatusChange(id, status);
  }
  // In-app notification to the other side for the new lifecycle states.
  try {
    const otherUserId = isOwnerPro ? bookingRow.client_id : null;
    const labelMap: Record<string, { title: string; message: string }> = {
      awaiting_confirmation: { title: "El profesional marcó el trabajo como realizado", message: "Confirmá la finalización para cerrar la solicitud (se confirma sola en 7 días)." },
      in_progress: { title: "Tu solicitud está en progreso", message: "El profesional marcó tu solicitud en progreso." },
    };
    if (isOwnerPro && otherUserId && labelMap[status]) {
      await admin.from("notifications").insert({ user_id: otherUserId, type: "booking_update", title: labelMap[status].title, message: labelMap[status].message });
    }
    // Client confirmed completion → notify the professional.
    if (isOwnerClient && status === "completed") {
      const { data: pr } = await admin.from("professionals").select("profile_id").eq("id", bookingRow.professional_id).maybeSingle();
      if (pr?.profile_id) {
        await admin.from("notifications").insert({ user_id: pr.profile_id, type: "booking_update", title: "El cliente confirmó la finalización", message: "La solicitud quedó finalizada." });
      }
    }
  } catch (e) { console.error("[PATCH /api/bookings] notify:", e); }

  // When a booking is marked completed, prompt the client to leave a review.
  if (status === "completed") {
    try {
      const { data: booking } = await admin
        .from("bookings")
        .select("client_id, professional_id, professionals(slug, profiles(full_name))")
        .eq("id", id)
        .maybeSingle();

      if (booking?.client_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pro = booking.professionals as any;
        const proName = pro?.profiles?.full_name ?? "el profesional";
        await admin.from("notifications").insert({
          user_id: booking.client_id,
          type: "review_request",
          title: "¿Cómo te fue?",
          message: `Tu servicio con ${proName} se marcó como completado. Dejá una reseña para ayudar a otros clientes.`,
        });
      }
    } catch (err) {
      console.error("[PATCH /api/bookings] review prompt failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}
