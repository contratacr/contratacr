import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // The database function removes the public profile first and the Auth user
  // second, in one transaction. This avoids leaving a half-deleted account when
  // one of the profile cascades rejects a direct Auth admin deletion.
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("[account-delete] Transaction failed", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { code: "ACCOUNT_DELETE_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
