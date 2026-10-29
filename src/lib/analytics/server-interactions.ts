import { requestStatisticsAllowed } from "@/lib/privacy/measurement-request";
import { analyticsActor } from "@/lib/analytics/admin-activity";
import { requestAnalyticsPlatform } from "./platform";
import { peticionAutomatizada } from "@/lib/analytics/trafico-automatizado";
import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { InteractionEventType } from "@/lib/analytics/interaction-events";

const SESSION_COOKIE = "cc_analytics_sid";

type AdminClient = ReturnType<typeof createAdminClient>;

type ServerInteractionInput = {
  type: InteractionEventType;
  professionalId?: string | null;
  viewerUserId?: string | null;
  source?: string;
  locale?: "es" | "en";
  categoryId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

function hashStable(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function recordServerInteraction(admin: AdminClient, req: NextRequest, input: ServerInteractionInput) {
  if (!requestStatisticsAllowed(req) || peticionAutomatizada(req)) return;
  try {
    const actor = await analyticsActor(input.viewerUserId);
    if (actor.excluded) return;
    const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
    const visitorKey = sessionId || input.viewerUserId || randomUUID();
    const { error } = await admin.from("interaction_events").insert({
      event_type: input.type,
      professional_id: input.professionalId ?? null,
      viewer_user_id: actor.id,
      visitor_hash: hashStable(visitorKey),
      source: input.source ?? "api",
      locale: input.locale ?? "es",
      category_id: input.categoryId ?? null,
      metadata: { ...input.metadata, ...requestAnalyticsPlatform(req) },
    });
    if (error) console.warn("[analytics] server interaction insert failed", error.code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Analytics must never block core marketplace actions.
    console.error("[analytics] server interaction insert failed", message);
  }
}
