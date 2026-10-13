import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { peticionAutomatizada } from "@/lib/analytics/trafico-automatizado";
import { requestAnalyticsPlatform } from "@/lib/analytics/platform";

const schema = z.object({
  session: z.string().uuid(), screen: z.string().uuid(),
  path: z.string().max(240).regex(/^\/(?!\/)[^?#]*$/),
  tab: z.string().max(40).regex(/^[a-z_-]*$/).optional(),
  firstUse: z.boolean().optional(),
});
export async function POST(req: NextRequest) {
  if (peticionAutomatizada(req)) return new NextResponse(null, { status: 204 });
  const limited = enforceRateLimit(req, "analytics-usage", 90, 60_000);
  if (limited) return limited;
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid usage event" }, { status: 400 });
  const sid = req.cookies.get("cc_analytics_sid")?.value || randomUUID();
  const visitor = createHash("sha256").update(sid).digest("hex");
  const { data: { user } } = await (await createClient()).auth.getUser();
  const runtime = requestAnalyticsPlatform(req).runtime;
  const { error } = await createAdminClient().rpc("record_app_usage", {
    p_visitor: visitor, p_user_id: user?.id ?? null, p_session: input.data.session,
    p_screen: input.data.screen, p_runtime: runtime,
    p_path: input.data.path, p_tab: input.data.tab ?? null,
    p_first_use: runtime !== "web" && input.data.firstUse === true,
  });
  if (error) return NextResponse.json({ error: "Could not record usage" }, { status: 503 });
  const response = new NextResponse(null, { status: 204 });
  if (!req.cookies.has("cc_analytics_sid")) response.cookies.set("cc_analytics_sid", sid, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000,
  });
  return response;
}
