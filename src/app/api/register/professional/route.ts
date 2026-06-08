import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { runIdentityVerification } from "@/lib/verification/run-verification";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      category,
      professions: bodyProfessions,
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
      businessName: bodyBusinessName,
      workplaces: bodyWorkplaces,
      coverageAreas: bodyCoverage,
      searchProvincias: bodySearchProv,
      searchCantones: bodySearchCant,
      coverageProvincias: bodyCoverageProv,
      coverageCountry: bodyCoverageCountry,
      noCrId: bodyNoCrId,
      idDocNote: bodyIdDocNote,
    } = body;

    // Bio and location are now optional; only a category + WhatsApp are required.
    if (!category || !whatsapp) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }
    const safeBio = typeof bio === "string" ? bio : "";
    const businessName = bodyBusinessName || null;
    // Workplaces: [{ id, name, address, lat, lng, provinciaId, cantonId, distrito }]
    // — fixed-location pins (single source of truth). Coverage = travel areas.
    const workplaces = Array.isArray(bodyWorkplaces) ? bodyWorkplaces : [];
    const coverageAreas = Array.isArray(bodyCoverage) ? bodyCoverage : [];
    const searchProvincias = Array.isArray(bodySearchProv) ? bodySearchProv : [];
    const searchCantones = Array.isArray(bodySearchCant) ? bodySearchCant : [];
    const coverageProvincias = Array.isArray(bodyCoverageProv) ? bodyCoverageProv : [];
    const coverageCountry = !!bodyCoverageCountry;
    const noCrId = !!bodyNoCrId;
    const idDocNote = typeof bodyIdDocNote === "string" ? bodyIdDocNote : null;

    // Optional columns (migrations 019/021/022/030) — if the DB hasn't been
    // migrated yet, retry the write without them instead of failing registration.
    const optionalProFields: Record<string, unknown> = {
      business_name: businessName,
      workplaces,
      coverage_areas: coverageAreas,
      search_provincias: searchProvincias,
      search_cantones: searchCantones,
      coverage_provincias: coverageProvincias,
      coverage_country: coverageCountry,
      no_cr_id: noCrId,
      id_document_note: idDocNote,
      ...(noCrId ? { verification_status: "pending" } : {}),
    };
    const isUnknownColumn = (msg?: string) =>
      !!msg && /account_type|business_name|affiliations|workplaces|coverage_areas|search_provincias|search_cantones|coverage_provincias|coverage_country|no_cr_id|id_document_note|languages|contact_preference|schema cache|PGRST204|could not find/i.test(msg);

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
          { error: "Este correo ya está registrado. Iniciá sesión." },
          { status: 409 }
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
      console.error("[register/professional] profile upsert error:", profileError);
      const friendly = /duplicate key|cedula/i.test(profileError.message)
        ? "Esta cédula o correo ya está registrado en ContrataCR."
        : "No pudimos crear tu cuenta. Intentá de nuevo en unos minutos.";
      return NextResponse.json({ error: friendly }, { status: 500 });
    }

    // ── 4. Check if professional already exists ───────────────────────────────
    const { data: existingPro } = await supabase
      .from("professionals")
      .select("id, slug")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingPro) {
      const baseUpdate = {
        category_id: category,
        bio: safeBio,
        whatsapp,
        years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
        hourly_rate: hourlyRate ? parseInt(hourlyRate, 10) : null,
        service_type: serviceType ?? "mobile",
        address: address ?? null,
        ...(province ? { provincia_id: province } : {}),
        ...(canton ? { canton_id: canton } : {}),
        ...(lat != null ? { lat: Number(lat) } : {}),
        ...(lng != null ? { lng: Number(lng) } : {}),
      };
      let { error: updErr } = await supabase
        .from("professionals")
        .update({ ...baseUpdate, ...optionalProFields })
        .eq("id", existingPro.id);
      if (updErr && isUnknownColumn(updErr.message)) {
        ({ error: updErr } = await supabase.from("professionals").update(baseUpdate).eq("id", existingPro.id));
      }
      if (updErr) {
        console.error("[register/professional] update error:", updErr);
        return NextResponse.json({ error: "No pudimos actualizar tu perfil. Intentá de nuevo." }, { status: 500 });
      }

      // Fire automatic identity verification (best-effort; never blocks).
      try { await runIdentityVerification(existingPro.id); } catch (e) { console.error("[register] auto-verify:", e); }

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
    const professions: string[] = Array.isArray(bodyProfessions) && bodyProfessions.length > 0
      ? [...new Set([category, ...bodyProfessions].filter(Boolean))]
      : [category];

    const baseInsert = {
      profile_id: userId,
      category_id: category,
      professions,
      // Private until the pro publishes a schedule (then it auto-flips public).
      availability_public: false,
      bio: safeBio,
      whatsapp,
      years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
      hourly_rate: hourlyRate ? parseInt(hourlyRate, 10) : null,
      service_type: serviceType ?? "mobile",
      address: address ?? null,
      slug,
      ...(province ? { provincia_id: province } : {}),
      ...(canton ? { canton_id: canton } : {}),
      ...(lat != null ? { lat: Number(lat) } : {}),
      ...(lng != null ? { lng: Number(lng) } : {}),
    };

    let { error: proError } = await supabase.from("professionals").insert({ ...baseInsert, ...optionalProFields });
    if (proError && isUnknownColumn(proError.message)) {
      ({ error: proError } = await supabase.from("professionals").insert(baseInsert));
    }

    if (proError) {
      console.error("[register/professional] insert error:", proError);
      const friendly =
        /duplicate key|already exists/i.test(proError.message)
          ? "Ya existe un perfil profesional para esta cuenta."
          : "No pudimos crear tu perfil profesional. Revisá tus datos e intentá de nuevo.";
      return NextResponse.json({ error: friendly }, { status: 500 });
    }

    // Fire automatic identity verification against the padrón (best-effort).
    try {
      const { data: newPro } = await supabase.from("professionals").select("id").eq("profile_id", userId).maybeSingle();
      if (newPro) await runIdentityVerification(newPro.id);
    } catch (e) {
      console.error("[register] auto-verify:", e);
    }

    return NextResponse.json({ ok: true, slug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
