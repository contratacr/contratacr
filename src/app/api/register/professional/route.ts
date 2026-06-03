import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId,
      email,
      fullName,
      cedula,
      photoUrl,
      category,
      serviceType,
      province,
      canton,
      address,
      whatsapp,
      bio,
      yearsExperience,
      hourlyRate,
    } = body;

    if (!userId || !category || !province || !canton || !whatsapp || !bio) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ── 1. Check cedula duplicate before doing anything ──────────────────────
    if (cedula) {
      const { data: existingCedula } = await supabase
        .from("profiles")
        .select("id")
        .eq("cedula", cedula)
        .neq("id", userId)
        .maybeSingle();

      if (existingCedula) {
        return NextResponse.json(
          { error: "Esta cédula ya está registrada en ContrataCR." },
          { status: 409 }
        );
      }
    }

    // ── 2. Upsert profile (resilient: works even if trigger didn't fire) ─────
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: email ?? "",
          full_name: fullName ?? "",
          cedula: cedula ?? null,
          role: "professional",
          onboarding_completed: true,
          ...(photoUrl ? { avatar_url: photoUrl } : {}),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      return NextResponse.json(
        { error: `Error al crear perfil: ${profileError.message}` },
        { status: 500 }
      );
    }

    // ── 3. Check if professional record already exists (avoid duplicates) ────
    const { data: existingPro } = await supabase
      .from("professionals")
      .select("id, slug")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingPro) {
      // Already exists — update it instead of inserting again
      await supabase
        .from("professionals")
        .update({
          category_id: category,
          bio,
          whatsapp,
          provincia_id: province,
          canton_id: canton,
          years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
          hourly_rate: hourlyRate ? parseInt(hourlyRate, 10) : null,
          service_type: serviceType ?? "mobile",
          address: address ?? null,
        })
        .eq("id", existingPro.id);

      return NextResponse.json({ ok: true, slug: existingPro.slug });
    }

    // ── 4. Build slug ─────────────────────────────────────────────────────────
    const baseName = (fullName || "profesional")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseName}-${Math.random().toString(36).slice(2, 10)}`;

    // ── 5. Insert professional record ─────────────────────────────────────────
    const { error: proError } = await supabase.from("professionals").insert({
      profile_id: userId,
      category_id: category,
      bio,
      whatsapp,
      provincia_id: province,
      canton_id: canton,
      years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
      hourly_rate: hourlyRate ? parseInt(hourlyRate, 10) : null,
      service_type: serviceType ?? "mobile",
      address: address ?? null,
      slug,
    });

    if (proError) {
      return NextResponse.json({ error: proError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
