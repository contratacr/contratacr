import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // NOTE: clients do NOT send provincia/cantón (location is gathered at search /
    // service-request, not signup), and `profiles` has no provincia_id/canton_id
    // columns anyway — never write them here.
    const { fullName, phone, cedula, userId: bodyUserId } = body;

    const sessionClient = await createServerClient();
    const { data: { user: sessionUser } } = await sessionClient.auth.getUser();
    const supabase = createAdminClient();

    let userId: string;
    let email: string;
    let name: string;

    if (sessionUser) {
      userId = sessionUser.id;
      email = sessionUser.email ?? "";
      name = fullName ?? (sessionUser.user_metadata?.full_name as string) ?? "";
    } else {
      if (!bodyUserId) {
        return NextResponse.json({ error: "Usuario inválido." }, { status: 401 });
      }
      const { data: adminLookup, error: adminError } = await supabase.auth.admin.getUserById(bodyUserId);
      if (adminError || !adminLookup.user) {
        return NextResponse.json({ error: "No se encontró el usuario." }, { status: 401 });
      }
      userId = adminLookup.user.id;
      email = adminLookup.user.email ?? "";
      name = fullName ?? (adminLookup.user.user_metadata?.full_name as string) ?? "";
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: name,
          role: "client",
          onboarding_completed: true,
          ...(cedula ? { cedula: String(cedula).replace(/\D/g, "") } : {}),
          ...(phone ? { phone } : {}),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      // Log the REAL DB error (the friendly message below never leaks it) so a
      // recurring constraint is diagnosable from the server logs.
      console.error("[POST /api/register/client] profile upsert failed:", profileError);

      // A FRESH email/password signup that fails here would otherwise leave an
      // ORPHANED auth user (auth row created by signUp, no usable profile). Roll it
      // back so the user can retry cleanly — `profiles.id` cascades on delete, so
      // this also clears any partial profile. NEVER delete a logged-in user (the
      // session/OAuth path is a conversion, not a fresh signup).
      if (!sessionUser) {
        try { await supabase.auth.admin.deleteUser(userId); } catch { /* best-effort */ }
      }

      // Detect a genuine DUPLICATE by the UNIQUE constraint/index NAME only — never
      // by the bare word "cedula"/"email" (a NOT-NULL or other error mentioning the
      // column would otherwise be mislabeled as "ya está registrada").
      const dupCedula = /profiles_cedula_key|idx_profiles_cedula_unique/i.test(profileError.message);
      const dupEmail = /profiles_email_key|idx_profiles_email_unique/i.test(profileError.message);
      if (dupEmail) {
        return NextResponse.json({ error: "Este correo ya está registrado. Inicia sesión.", code: "email_taken" }, { status: 409 });
      }
      if (dupCedula) {
        return NextResponse.json({ error: "Esta cédula ya está registrada.", code: "cedula_taken" }, { status: 409 });
      }
      return NextResponse.json({ error: "No pudimos crear tu cuenta. Intenta de nuevo en unos minutos." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    const friendly = /profiles_cedula_key|duplicate key/i.test(message)
      ? "Esta cédula ya está registrada."
      : "Ocurrió un error. Intenta de nuevo.";
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
