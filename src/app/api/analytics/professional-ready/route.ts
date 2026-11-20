import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordProfessionalReady } from "@/lib/analytics/professional-growth";
import { enforceRateLimit } from "@/lib/rate-limit";
export async function POST(req: Request) {
  const limited = enforceRateLimit(req,"professional-ready",10,3600000);
  if (limited) return limited;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" },{ status: 401 });
  const metaConversion = await recordProfessionalReady(req,user.id);
  return NextResponse.json({ ok: true, metaConversion });
}
