import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewBooking, notifyBookingStatusChange } from "@/lib/notifications";

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

    const { scheduledDate, scheduledTime, clientPhone } = body;

    const { data, error } = await supabase.from("bookings").insert({
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
    }).select("id").single();

    if (error) {
      console.error("[POST /api/bookings]", error);
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

    const { data } = await supabase
      .from("bookings")
      .select("*, profiles:client_id(full_name, avatar_url)")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ bookings: data ?? [] });
  }

  // Client role. NOTE: professionals↔categories has no FK (category_id is plain
  // text), so an embedded categories(...) join 500s and silently drops every
  // booking. Select category_id as a column instead.
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
  const { id, status } = body;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Identify who is updating: only the professional accepting/cancelling should
  // trigger an automated client notification (not the client cancelling their own).
  const { data: actorPro } = await supabase
    .from("professionals")
    .select("id")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Professional accepted (confirmed) or cancelled → notify the client via
  // ContrataCR's own WhatsApp + email (fallback). Best-effort, never blocks.
  if (actorPro && (status === "confirmed" || status === "cancelled")) {
    await notifyBookingStatusChange(id, status);
  }

  // When a booking is marked completed, prompt the client to leave a review.
  if (status === "completed") {
    try {
      const admin = createAdminClient();
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
