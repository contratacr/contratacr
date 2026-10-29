import { NextRequest, NextResponse } from "next/server";
import { analyticsActor } from "@/lib/analytics/admin-activity";
import { COOKIE_ADMIN_EXCLUDED, peticionAutomatizada } from "@/lib/analytics/trafico-automatizado";

const headers = { "Cache-Control": "private, no-store" };
/** Configure optional native advertising independently of usage statistics. No event or visitor ID is recorded. */
export async function GET(req: NextRequest) {
  if (req.cookies.get("ccr_ads_consent_v2")?.value !== "accepted" || req.cookies.get(COOKIE_ADMIN_EXCLUDED)?.value === "1" || peticionAutomatizada(req)) {
    return NextResponse.json({ excluded: true, schemaReady: false }, { headers });
  }
  const actor = await analyticsActor();
  return NextResponse.json({ excluded: actor.excluded, schemaReady: process.env.META_IOS_SKAN_SCHEMA_READY === "true" }, { headers });
}
/** Removing HttpOnly identifiers requires a server response. No database deletion is implied. */
export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  const response = new NextResponse(null, { status: 204, headers });
  response.cookies.set("cc_analytics_sid", "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  return response;
}
