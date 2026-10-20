import { NextResponse } from "next/server";
import { analyticsActor } from "@/lib/analytics/admin-activity";
import { growthContext } from "@/lib/analytics/growth-server";
import { META_MEASUREMENT_VERSION } from "@/lib/analytics/meta-minimal";
import { sendMetaConversion, metaTestEventCode } from "@/lib/analytics/meta-delivery";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
  if (req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "INVALID_ORIGIN" }, 403);
  const limited = enforceRateLimit(req, "minimal-meta", 15, 60_000);
  if (limited) return limited;
  const context = growthContext(req);
  if (!context.allowed) return reply({ skipped: true });
  const actor = await analyticsActor();
  if (actor.excluded) return reply({ skipped: true });
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1980721055914350";
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;
  if (process.env.META_CAPI_ENABLED !== "true" || !token || !/^v\d+\.\d+$/.test(version ?? "") || !/^\d+$/.test(pixelId)) return reply({ error: "MEASUREMENT_UNAVAILABLE" }, 503);
  try {
    const raw = await req.text();
    if (raw.length > 300) return reply({ error: "INVALID_EVENT" }, 400);
    const body = JSON.parse(raw);
    if (!["PageView", "CompleteRegistration"].includes(body.event) || !/^[a-f0-9-]{36}$/.test(body.id ?? "")) return reply({ error: "INVALID_EVENT" }, 400);
    if (body.event === "CompleteRegistration" && !actor.id) return reply({ skipped: true });
    const result = await sendMetaConversion({
      event_name: body.event, event_id: body.id, event_time: Math.floor(Date.now()/1000),
      action_source: "website", event_source_url: "https://contratacr.com/",
      user_data: context.userData, custom_data: { measurement_version: META_MEASUREMENT_VERSION },
    }, { pixelId, token, version: version!, testCode: metaTestEventCode(process.env.META_CAPI_TEST_EVENT_CODE) });
    return result === "sent" ? reply({ ok: true }) : reply({ error: "MEASUREMENT_UNAVAILABLE" }, 503);
  } catch { return reply({ error: "INVALID_EVENT" }, 400); }
}
