import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { attributionColumnsFromBody } from "@/lib/analytics/attribution-server";

// Accounts created outside the register endpoints (Google/Apple sign-in, the
// onboarding role cards, the native app) get their profile from the auth
// trigger and never pass through /api/register/*. The browser still holds the
// first-touch attribution, so once a session exists it claims it here.
// Only fills empty columns, and only on accounts younger than 3 days — an old
// account logging in from a fresh device must not be re-attributed.
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "attribution-claim", 20, 600000);
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => ({}));
    const attribution = attributionColumnsFromBody(body?.attribution);
    if (!attribution) return NextResponse.json({ ok: true, claimed: false });

    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ ok: true, claimed: false });

    const admin = createAdminClient();
    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data, error } = await admin
      .from("profiles")
      .update(attribution)
      .eq("id", user.id)
      .is("acquisition_source", null)
      .gte("created_at", since)
      .select("id");
    if (error) return NextResponse.json({ ok: true, claimed: false });
    return NextResponse.json({ ok: true, claimed: (data?.length ?? 0) > 0 });
  } catch {
    return NextResponse.json({ ok: true, claimed: false });
  }
}
