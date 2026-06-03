import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Client role
  const { data } = await supabase
    .from("bookings")
    .select("*, professionals(slug, profiles(full_name, avatar_url), categories(id, icon))")
    .eq("client_id", session.user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ bookings: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status } = body;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
