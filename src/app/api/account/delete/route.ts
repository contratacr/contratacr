import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isMissingDeleteFunction(code?: string, message?: string) {
  return code === "PGRST202"
    || /delete_my_account|schema cache|could not find the function/i.test(message ?? "");
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // The database function removes the public profile first and the Auth user
  // second, in one transaction. This avoids leaving a half-deleted account when
  // one of the profile cascades rejects a direct Auth admin deletion.
  const { error: transactionError } = await supabase.rpc("delete_my_account");
  if (transactionError && isMissingDeleteFunction(transactionError.code, transactionError.message)) {
    // Keep account deletion available while migration 162 propagates to an
    // environment. The verified session determines the only user we may delete.
    const { error: adminError } = await createAdminClient().auth.admin.deleteUser(user.id);
    if (!adminError) return NextResponse.json({ ok: true });

    console.error("[account-delete] Admin fallback failed", {
      userId: user.id,
      message: adminError.message,
    });
    return NextResponse.json(
      { error: "No pudimos eliminar la cuenta. Intenta nuevamente." },
      { status: 500 },
    );
  }

  if (transactionError) {
    console.error("[account-delete] Transaction failed", {
      userId: user.id,
      code: transactionError.code,
      message: transactionError.message,
    });
    return NextResponse.json(
      { error: "No pudimos eliminar la cuenta. Intenta nuevamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
