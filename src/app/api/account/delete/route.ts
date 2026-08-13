import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAccountDeletion } from "@/lib/account-deletion/process";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: requestId, error: requestError } = await supabase.rpc("request_my_account_deletion");
  if (requestError || !requestId) {
    console.error("[account-delete] Request failed", {
      userId: user.id,
      code: requestError?.code,
      message: requestError?.message,
    });
    const reserved = /Regression accounts cannot be deleted/i.test(requestError?.message ?? "");
    return NextResponse.json(
      { error: reserved ? "Esta cuenta está reservada para las pruebas de regresión." : "La eliminación no está disponible todavía. Intenta más tarde." },
      { status: reserved ? 409 : 503 },
    );
  }

  const admin = createAdminClient();
  // If cleanup needs a retry, prevent new sessions while the account remains
  // hidden. The finalizer removes this Auth user once its own assets are gone.
  const { error: banError } = await admin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
  if (banError) {
    console.error("[account-delete] Could not block new sessions before cleanup", {
      requestId,
      userId: user.id,
      message: banError.message,
    });
  }

  try {
    await processAccountDeletion(requestId as string);
    return NextResponse.json({ ok: true, status: "completed" });
  } catch (error) {
    console.error("[account-delete] Queued for retry", {
      requestId,
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    // The account is already hidden and blocked. Do not tell the user the whole
    // request failed just because provider cleanup needs an administrative retry.
    if (banError) {
      return NextResponse.json(
        { error: "No pudimos bloquear la cuenta de forma segura. Intenta nuevamente." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, status: "pending" }, { status: 202 });
  }
}
