import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { professionalId, rating, comment } = await req.json();

  if (!professionalId || !rating) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Verified-review gate ──────────────────────────────────────────────────
  // Only clients with a COMPLETED booking with this professional can review.
  const { data: completedBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("client_id", user.id)
    .eq("professional_id", professionalId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (!completedBooking) {
    return NextResponse.json(
      { error: "Solo podés dejar una reseña después de completar un servicio con este profesional." },
      { status: 403 }
    );
  }

  // Prevent duplicate reviews from the same client for the same professional.
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("client_id", user.id)
    .eq("professional_id", professionalId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Ya dejaste una reseña para este profesional." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("reviews").insert({
    professional_id: professionalId,
    client_id: user.id,
    rating,
    comment,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
