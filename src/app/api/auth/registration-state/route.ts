import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { pendingRegistrationPath, registrationComplete } from "@/lib/auth/registration-state";
import { withPromiseTimeout } from "@/lib/promise-timeout";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

// Reconcile cached browser pages against the current server-side account.
// Return only routing state, never the private profile or provider metadata.
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await safeGetUser(supabase);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
    const { data: profile, error } = await withPromiseTimeout(supabase.rpc("get_my_profile"), 6_000, "registration-state-timeout");
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
    return NextResponse.json({
      complete: registrationComplete(user.user_metadata, profile?.onboarding_completed),
      destination: pendingRegistrationPath(user.user_metadata),
    }, { headers });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  }
}
