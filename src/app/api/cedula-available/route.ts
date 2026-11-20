import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/cedula-available?cedula=123456789 → { taken: boolean }
// `taken` is true when the cédula is already linked to ANOTHER account. Used at
// booking to warn EARLY (the moment the cédula validates) instead of failing on
// the DB unique constraint only after the user presses confirm. Only the boolean
// is returned — no account details are ever leaked.
export async function GET(req: Request) {
  // Public endpoint: bound abuse and enumeration per client IP.
  const limited = enforceRateLimit(req, "cedula-available", 30, 60000);
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const cedula = (searchParams.get("cedula") ?? "").replace(/\D/g, "");
  if (!cedula) return NextResponse.json({ taken: false });

  // Exclude the requester's own account so editing your own cédula isn't "taken".
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();

  const db = createAdminClient();
  let q = db.from("profiles").select("id").eq("cedula", cedula);
  if (user) q = q.neq("id", user.id);
  const { data } = await q.limit(1).maybeSingle();

  return NextResponse.json({ taken: !!data });
}
