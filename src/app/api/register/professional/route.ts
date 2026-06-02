import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId,
      category,
      province,
      canton,
      whatsapp,
      bio,
      yearsExperience,
      hourlyRate,
      fullName,
    } = body;

    if (!userId || !category || !province || !canton || !whatsapp || !bio) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify the profile exists (created by trigger)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found. Make sure you run migration 003 first." },
        { status: 404 }
      );
    }

    // Build slug from full name + random suffix
    const baseName = (fullName || "profesional")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseName}-${Math.random().toString(36).slice(2, 10)}`;

    const { error: proError } = await supabase.from("professionals").insert({
      profile_id: userId,
      category_id: category,
      bio,
      whatsapp,
      provincia_id: province,
      canton_id: canton,
      years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
      hourly_rate: hourlyRate ? parseInt(hourlyRate, 10) : null,
      slug,
    });

    if (proError) {
      return NextResponse.json({ error: proError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
