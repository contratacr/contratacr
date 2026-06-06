import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      category,
      serviceType,
      province,
      canton,
      address,
      whatsapp,
      bio,
      yearsExperience,
      hourlyRate,
      lat,
      lng,
      // email/fullName/cedula/photoUrl come from the body but we verify userId from session
      email: bodyEmail,
      fullName: bodyFullName,
      cedula: bodyCedula,
      photoUrl,
    } = body;

    if (!category || !province || !canton || !whatsapp || !bio) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // ── 1. Identify the user ──────────────────────────────────────────────────
    //    Two cases:
    //    A) Authenticated (OAuth / already-logged-in): read from session cookies.
    //    B) New email/password signup: signUp() creates auth.users but the
    //       session only starts AFTER email confirmation, so there are no cookies
    //       yet. Validate the userId from the POST body via admin.getUserById().
    const sessionClient = await createServerClient();
    const { data: { user: sessionUser } } = await sessionClient.auth.getUser();

    const supabase = createAdminClient();

    let userId: string;
    let email: string;
    let fullName: string;

    if (sessionUser) {
      // Case A — authenticated user
      userId = sessionUser.id;
      email = bodyEmail ?? sessionUser.email ?? "";
      fullName = bodyFullName ?? (sessionUser.user_metadata?.full_name as string) ?? "";
    } else {
      // Case B — new signup without a session yet; validate via admin API
      const bodyUserId: string | undefined = body.userId;
      if (!bodyUserId) {
        return NextResponse.json(
          { error: "Usuario inválido. Intentá de nuevo." },
          { status: 401 }
        );
      }
      const { data: adminLookup, error: adminError } =
        await supabase.auth.admin.getUserById(bodyUserId);
      if (adminError || !adminLookup.user) {
        return NextResponse.json(
          { error: "No se encontró el usuario. Intentá de nuevo." },
          { status: 401 }
        );
      }
      userId = adminLookup.user.id;
      email = bodyEmail ?? adminLookup.user.email ?? "";
      fullName = bodyFullName ?? (adminLookup.user.user_metadata?.full_name as string) ?? "";
    }

    const cedula = bodyCedula ?? null;

    // ── 2. Check cedula duplicate ─────────────────────────────────────────────
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

    // ── 3. Upsert profile ─────────────────────────────────────────────────────
    //    Uses service_role so it bypasses RLS; FK is satisfied because userId
    //    was just confirmed valid by auth.getUser() above.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName,
          cedula: cedula || null,
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

    // ── 4. Check if professional already exists ───────────────────────────────
    const { data: existingPro } = await supabase
      .from("professionals")
      .select("id, slug")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingPro) {
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
          ...(lat != null ? { lat: Number(lat) } : {}),
          ...(lng != null ? { lng: Number(lng) } : {}),
        })
        .eq("id", existingPro.id);

      return NextResponse.json({ ok: true, slug: existingPro.slug });
    }

    // ── 5. Build slug ─────────────────────────────────────────────────────────
    const baseName = (fullName || "profesional")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseName}-${Math.random().toString(36).slice(2, 10)}`;

    // ── 6. Insert professional ────────────────────────────────────────────────
    const { error: proError } = await supabase.from("professionals").insert({
      profile_id: userId,
      category_id: category,
      professions: [category],
      // Private until the pro publishes a schedule (then it auto-flips public).
      availability_public: false,
      bio,
      whatsapp,
      provincia_id: province,
      canton_id: canton,
      years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
      hourly_rate: hourlyRate ? parseInt(hourlyRate, 10) : null,
      service_type: serviceType ?? "mobile",
      address: address ?? null,
      slug,
      ...(lat != null ? { lat: Number(lat) } : {}),
      ...(lng != null ? { lng: Number(lng) } : {}),
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
