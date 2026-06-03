import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fullName, phone, provinciaId, cantonId, userId: bodyUserId } = body;

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
          ...(phone ? { phone } : {}),
          ...(provinciaId ? { provincia_id: provinciaId } : {}),
          ...(cantonId ? { canton_id: cantonId } : {}),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
