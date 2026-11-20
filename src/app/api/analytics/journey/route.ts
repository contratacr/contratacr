import { requestStatisticsAllowed } from "@/lib/privacy/measurement-request";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { analyticsActor } from "@/lib/analytics/admin-activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestAnalyticsPlatform } from "@/lib/analytics/platform";
import { peticionAutomatizada } from "@/lib/analytics/trafico-automatizado";
import { cleanJourney } from "@/lib/analytics/journey-contract";
export async function POST(req: NextRequest) {
  if (!requestStatisticsAllowed(req)) return new NextResponse(null, { status: 204 });
  if (req.headers.get("origin") !== new URL(req.url).origin) return new NextResponse(null, { status: 403 });
  if (peticionAutomatizada(req)) return new NextResponse(null, { status: 204 });
  const limited = enforceRateLimit(req, "analytics-journey", 30, 60_000);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") || 0) > 12000) return new NextResponse(null, { status: 413 });
  const raw = await req.text();
  if (raw.length > 12000) return new NextResponse(null, { status: 413 });
  let input;
  try { input = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); }
  if (!Array.isArray(input.events) || !input.events.length || input.events.length > 20) return new NextResponse(null, { status: 400 });
  const events = input.events.map(cleanJourney);
  if (events.some((event: unknown) => !event)) return new NextResponse(null, { status: 400 });
  const actor = await analyticsActor();
  if (actor.excluded) return new NextResponse(null, { status: 204 });
  const sid = req.cookies.get("cc_analytics_sid")?.value || randomUUID();
  const visitor = createHash("sha256").update(sid).digest("hex");
  const runtime = requestAnalyticsPlatform(req).runtime;
  const { error } = await createAdminClient().from("app_journey_events").upsert(events.map((event: NonNullable<ReturnType<typeof cleanJourney>>) => ({
    event_id: event.id, action: event.action, target: event.target, section: event.section, value: event.value,
    viewer_user_id: actor.id, visitor_hash: visitor, runtime,
  })), { onConflict: "event_id", ignoreDuplicates: true });
  if (error) return new NextResponse(null, { status: 503 });
  const response = new NextResponse(null, { status: 204 });
  if (!req.cookies.has("cc_analytics_sid")) response.cookies.set("cc_analytics_sid", sid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000 });
  return response;
}
