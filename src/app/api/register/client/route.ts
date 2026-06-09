import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fullName, phone, provinciaId, cantonId, cedula, userId: bodyUserId } = body;

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
          ...(provinciaId ? { provincia_id: provinciaId } : {}),
          ...(cantonId ? { canton_id: cantonId } : {}),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      // Never surface raw DB constraint errors. A duplicate cédula → friendly message.
      const dupCedula = /profiles_cedula_key|cedula/i.test(profileError.message);
      const dupEmail = /profiles_email|email/i.test(profileError.message) && /duplicate|unique/i.test(profileError.message);
      if (dupCedula) {
        return NextResponse.json({ error: "Esta cédula ya está registrada.", code: "cedula_taken" }, { status: 409 });
      }
      if (dupEmail) {
        return NextResponse.json({ error: "Este correo ya está registrado. Inicia sesión.", code: "email_taken" }, { status: 409 });
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
