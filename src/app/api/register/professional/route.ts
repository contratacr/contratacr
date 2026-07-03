import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { runIdentityVerification } from "@/lib/verification/run-verification";
import { reconcileProfileEmail } from "@/lib/auth/reconcile-profile-email";
import { parseMoneyAmount } from "@/lib/money-limits";
import { LONG_TEXT_MAX_LENGTH, NAME_MAX_LENGTH, PROFILE_BIO_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";
import { anyVideoConsultCategory, getCategoryLabel } from "@/lib/data/categories";

type SeedService = {
  id: string;
  name: string;
  category: string;
  active: boolean;
  priceType: "a_convenir";
  price: string;
};

function uniqueServices(category: string, professions: unknown): string[] {
  const selected = Array.isArray(professions) && professions.length > 0 ? [category, ...professions] : [category];
  return [...new Set(selected.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

function isCountryCoverageArea(area: unknown): boolean {
  if (!area || typeof area !== "object") return false;
  const item = area as { level?: string; cantonId?: string };
  return (item.level ?? (item.cantonId ? "canton" : "provincia")) === "country";
}

function seedServicesFromProfessions(professions: string[]): SeedService[] {
  return professions.map((categoryId, index) => ({
    id: `svc_${Date.now()}_${index}_${crypto.randomUUID().slice(0, 8)}`,
    name: getCategoryLabel(categoryId),
    category: categoryId,
    active: true,
    priceType: "a_convenir",
    price: "Consultar precio",
  }));
}

function hasStoredServices(services: unknown): boolean {
  return Array.isArray(services) && services.length > 0;
}

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
    const safeBio = limitTrimmedText(bio, PROFILE_BIO_MAX_LENGTH);
    const businessName = limitTrimmedText(bodyBusinessName, NAME_MAX_LENGTH) || null;
    // Workplaces: [{ id, name, address, lat, lng, provinciaId, cantonId, distrito }]
    // — fixed-location pins (single source of truth). Coverage = travel areas.
    const workplaces = Array.isArray(bodyWorkplaces) ? bodyWorkplaces : [];
    const rawCoverageAreas = Array.isArray(bodyCoverage) ? bodyCoverage : [];
    const searchProvincias = Array.isArray(bodySearchProv) ? bodySearchProv : [];
    const searchCantones = Array.isArray(bodySearchCant) ? bodySearchCant : [];
    const coverageProvincias = Array.isArray(bodyCoverageProv) ? bodyCoverageProv : [];
    const noCrId = !!bodyNoCrId;
    const idDocNote = limitTrimmedText(bodyIdDocNote, LONG_TEXT_MAX_LENGTH) || null;
    const professions = uniqueServices(category, bodyProfessions);
    const supportsCountryCoverage = anyVideoConsultCategory(professions);
    const coverageCountry = supportsCountryCoverage && !!bodyCoverageCountry;
    const coverageAreas = rawCoverageAreas.filter((area) => !isCountryCoverageArea(area) || coverageCountry);
    const seededServices = seedServicesFromProfessions(professions);

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
      // Public agenda by default → contact via both WhatsApp + schedule.
      contact_preference: "ambas",
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
      fullName = limitTrimmedText(bodyFullName ?? (sessionUser.user_metadata?.full_name as string) ?? "", NAME_MAX_LENGTH);
    } else {
      // Case B — new signup without a session yet; validate via admin API
      const bodyUserId: string | undefined = body.userId;
      if (!bodyUserId) {
        return NextResponse.json(
          { error: "Usuario inválido. Intenta de nuevo." },
          { status: 401 }
        );
      }
      const { data: adminLookup, error: adminError } =
        await supabase.auth.admin.getUserById(bodyUserId);
      if (adminError || !adminLookup.user) {
        return NextResponse.json(
          { error: "Este correo ya está registrado. Inicia sesión." },
          { status: 409 }
        );
      }
      userId = adminLookup.user.id;
      email = bodyEmail ?? adminLookup.user.email ?? "";
      fullName = limitTrimmedText(bodyFullName ?? (adminLookup.user.user_metadata?.full_name as string) ?? "", NAME_MAX_LENGTH);
    }

    const rawBodyCedula = typeof bodyCedula === "string" ? bodyCedula.replace(/\D/g, "") : null;
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("cedula, client_identity_status")
      .eq("id", userId)
      .maybeSingle();
    const existingCedula = typeof existingProfile?.cedula === "string" ? existingProfile.cedula : null;
    const cedula = rawBodyCedula || existingCedula || null;

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
          { error: "Esta identificación ya está registrada. Inicia sesión o recupera tu cuenta.", code: "cedula_taken" },
          { status: 409 }
        );
      }
    }

    // ── 3. Upsert profile ─────────────────────────────────────────────────────
    //    Uses service_role so it bypasses RLS; FK is satisfied because userId
    //    was just confirmed valid by auth.getUser() above.
    const profileRow = {
      id: userId,
      email,
      full_name: fullName,
      role: "professional",
      onboarding_completed: true,
      ...(photoUrl ? { avatar_url: photoUrl } : {}),
      ...(cedula ? { cedula } : {}),
    };

    let { error: profileError } = await supabase.from("profiles").upsert(profileRow, { onConflict: "id" });

    // SELF-HEAL a STALE email collision: the email is free in Auth but a leftover profiles
    // row still holds it from a past email change. Reconcile that row against Auth and RETRY
    // (frees an old email even if the sync trigger/mirror never ran). See register/client.
    if (profileError && /profiles_email_key|idx_profiles_email_unique/i.test(profileError.message)) {
      const freed = await reconcileProfileEmail(supabase, email);
      if (freed) {
        ({ error: profileError } = await supabase.from("profiles").upsert(profileRow, { onConflict: "id" }));
      }
    }

    if (profileError) {
      console.error("[register/professional] profile upsert error:", profileError);
      const dupEmail = /profiles_email_key|idx_profiles_email_unique/i.test(profileError.message);
      const friendly = dupEmail
        ? "Este correo ya está registrado. Inicia sesión."
        : /duplicate key|cedula/i.test(profileError.message)
          ? "Esta identificación ya está registrada. Inicia sesión o recupera tu cuenta."
          : "No pudimos crear tu cuenta. Intenta de nuevo en unos minutos.";
      return NextResponse.json({ error: friendly, ...(dupEmail ? { code: "email_taken" } : {}) }, { status: dupEmail ? 409 : 500 });
    }

    // ONE account, ONE phone (shared across both modes): the contact number entered
    // here also becomes the ACCOUNT phone (`profiles.phone`), so it pre-fills in
    // "Busco servicios" (seeking) mode too — not just the offering profile's
    // `professionals.whatsapp`. Only backfill when the account has NO phone yet, so
    // we never clobber a number the user already saved as a client/seeker.
    if (whatsapp) {
      await supabase.from("profiles").update({ phone: whatsapp }).eq("id", userId).is("phone", null);
    }

    // ── 4. Check if professional already exists ───────────────────────────────
    const { data: existingPro } = await supabase
      .from("professionals")
      .select("id, slug, services")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingPro) {
      const baseUpdate = {
        category_id: category,
        professions,
        ...(hasStoredServices((existingPro as { services?: unknown }).services) ? {} : { services: seededServices }),
        bio: safeBio,
        whatsapp,
        years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
        hourly_rate: parseMoneyAmount(hourlyRate),
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
        return NextResponse.json({ error: "No pudimos actualizar tu perfil. Intenta de nuevo." }, { status: 500 });
      }

      // Fire automatic identity verification (best-effort; never blocks).
      // Registration → in-app notification only (no email); re-saves notify only
      // when the status actually changes (no duplicate "identidad verificada").
      try { await runIdentityVerification(existingPro.id, { notifyChannel: "in_app" }); } catch (e) { console.error("[register] auto-verify:", e); }

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
    const baseInsert = {
      profile_id: userId,
      category_id: category,
      professions,
      services: seededServices,
      // Availability is PUBLIC by default (privada OFF): a new pro is reachable and
      // can publish hours right away. They can turn "Disponibilidad privada" on
      // anytime to hide the agenda and go WhatsApp-only.
      availability_public: true,
      bio: safeBio,
      whatsapp,
      years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
      hourly_rate: parseMoneyAmount(hourlyRate),
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
          : "No pudimos crear tu perfil profesional. Revisa tus datos e intenta de nuevo.";
      return NextResponse.json({ error: friendly }, { status: 500 });
    }

    // Fire automatic identity verification against the padrón (best-effort).
    // First-ever run for this brand-new pro: in-app notification only (no email),
    // and `isInitial` so the result still shows once even if status is unchanged.
    try {
      const { data: newPro } = await supabase.from("professionals").select("id").eq("profile_id", userId).maybeSingle();
      if (newPro) await runIdentityVerification(newPro.id, { notifyChannel: "in_app", isInitial: true });
    } catch (e) {
      console.error("[register] auto-verify:", e);
    }

    return NextResponse.json({ ok: true, slug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
