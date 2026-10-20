import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { OPTIONAL_CONSENT_VERSION } from "@/lib/privacy/optional-consent";
/** Withdrawal also cancels this browser/account's unsent CAPI envelopes. */
export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  const limited = enforceRateLimit(req, "advertising-withdrawal", 20, 60_000);
  if (limited) return limited;
  try {
    const body = await req.json();
    if (body.accepted !== false || body.version !== OPTIONAL_CONSENT_VERSION) return NextResponse.json({ error: "INVALID_CHOICE" }, { status: 400, headers });
    const actors = new Set<string>();
    for (const piece of (req.headers.get("cookie") ?? "").split(";")) {
      const [key, ...value] = piece.trim().split("=");
      if (["cc_analytics_sid", "ccr_whatsapp_contact"].includes(key) && value.length) actors.add(decodeURIComponent(value.join("=")).slice(0, 500));
    }
    const db = await createClient();
    const user = await safeGetUser(db);
    if (user) actors.add(user.id);
    if (actors.size) {
      const hashes = [...actors].map(value => createHash("sha256").update(value).digest("hex"));
      const { error } = await createAdminClient().from("growth_conversion_events").update({ status: "suppressed", payload: null, locked_at: null }).in("actor_hash", hashes).in("status", ["pending", "sending"]);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch { return NextResponse.json({ error: "WITHDRAWAL_UNAVAILABLE" }, { status: 503, headers }); }
}
