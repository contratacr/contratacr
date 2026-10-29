import { requestStatisticsAllowed } from "@/lib/privacy/measurement-request";
import { META_MEASUREMENT_VERSION, minimalMetaPayload } from "./meta-minimal";
import { analyticsActor } from "@/lib/analytics/admin-activity";
import { requestAnalyticsPlatform } from "./platform";
import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { GROWTH_ACTIONS, type GrowthAction, type MetaConversion } from "./growth-contract";
import { COOKIE_ADMIN_EXCLUDED, esPeticionAutomatizada } from "./trafico-automatizado";

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function requestCookie(req: Request, name: string): string {
  const value = req.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="))?.slice(name.length + 1) ?? "";
  try { return decodeURIComponent(value); } catch { return ""; }
}
export function growthContext(req: Request, actorId?: string | null) {
  const ua = req.headers.get("user-agent") ?? "";
  const host = new URL(req.url).hostname;
  const automated = requestCookie(req, COOKIE_ADMIN_EXCLUDED) === "1" || esPeticionAutomatizada(requestCookie(req,"ccr_sin_analitica"),ua);
  const native = requestCookie(req,"ccr_platform") === "native";
  const allowed = !automated && !native && ["contratacr.com","www.contratacr.com"].includes(host)
    && requestCookie(req,"ccr_ads_consent_v2") === "accepted";
  const actor = actorId || requestCookie(req,"cc_analytics_sid") || requestCookie(req,"ccr_whatsapp_contact");
  let attribution: Record<string,string> = {};
  try {
    const parsed = JSON.parse(requestCookie(req,"ccr_action_attribution"));
    const age = Date.now()-Date.parse(parsed.capturedAt);
    if (requestStatisticsAllowed(req) && Number.isFinite(age) && age >= -60000 && age < 30*86400000) {
      attribution = Object.fromEntries(["source","medium","campaign","content","firstSource","firstCampaign"].flatMap(k => typeof parsed[k]==="string" ? [[k,parsed[k].replace(/[^a-zA-Z0-9_ .-]/g,"").slice(0,120)]] : []));
    }
  } catch { /* direct or no storage */ }
  const userData: Record<string,unknown> = { client_user_agent: ua.slice(0,500) };
  for (const name of ["_fbp","_fbc"]) {
    const value = requestCookie(req,name);
    if (/^fb\.\d+\.\d+\.[a-zA-Z0-9_-]+$/.test(value)) userData[name.slice(1)] = value;
  }
  // Account identity remains internal; never forward even its hash to Meta.
  return { automated, allowed, native, nativeAllowed: native && !automated && ["contratacr.com","www.contratacr.com"].includes(host) && requestCookie(req,"ccr_ads_consent_v2") === "accepted", actorHash: actor ? hash(actor) : null, attribution, userData };
}
/** Only invoke after a successful, authorized business action. Database conflicts are the deduplication boundary. */
export async function recordGrowthConversion(req: Request, action: GrowthAction, businessKey: string, actorId?: string | null, options: { metaAllowed?: boolean } = {}): Promise<MetaConversion | null> {
  try {
    if (!requestStatisticsAllowed(req) && requestCookie(req,"ccr_ads_consent_v2") !== "accepted") return null;
    const actor = await analyticsActor(actorId ?? undefined);
    if (actor.excluded) return null;
    const context = growthContext(req,actor.id);
    if (context.automated || !context.actorHash || !businessKey) return null;
    const contract = GROWTH_ACTIONS[action];
    const eventId = hash(`${action}:${businessKey}`);
    const conversion: MetaConversion = { eventName: contract.event, eventId, params: { action, audience: contract.audience } };
    const nativeDelivery = context.nativeAllowed && options.metaAllowed !== false;
    const allowDelivery = context.allowed && options.metaAllowed !== false;
    const directDelivery = allowDelivery && process.env.META_CAPI_ENABLED === "true";
    const payload = directDelivery ? minimalMetaPayload({
      event_name: contract.event, event_id: eventId, event_time: Math.floor(Date.now()/1000), action_source: "website",
      event_source_url: `https://contratacr.com${contract.path}`, user_data: context.userData, custom_data: { ...conversion.params, measurement_version: META_MEASUREMENT_VERSION },
    }) : null;
    const { error } = await createAdminClient().from("growth_conversion_events").insert({
      event_id: eventId, action, audience: contract.audience, actor_hash: context.actorHash,
      attribution: { ...context.attribution, ...requestAnalyticsPlatform(req) }, payload, status: payload ? "pending" : nativeDelivery ? "browser_only" : "suppressed",
    });
    if (error) {
      if (error.code !== "23505") console.warn("[growth] receipt unavailable",error.code);
      return null;
    }
    return payload || nativeDelivery ? conversion : null;
  } catch { console.warn("[growth] receipt failed"); return null; }
}
export async function recordServiceContact(req: Request, professionalId: string, actorId?: string | null) {
  const context = growthContext(req,actorId);
  if (!context.actorHash) return null;
  // One person/professional per CR day, across contact channels and concurrent requests.
  const day = new Date(Date.now()-6*3600000).toISOString().slice(0,10);
  return recordGrowthConversion(req,"service_contact",`${context.actorHash}:${professionalId}:${day}`,actorId);
}
