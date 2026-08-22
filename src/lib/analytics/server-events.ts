import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InteractionEventType } from "@/lib/analytics/interaction-events";

// Best-effort first-party analytics written from server code (pages and
// route handlers). Never throws, never awaits the database on the request
// path longer than the insert itself, and never records anything that could
// identify a person beyond what the event needs: free text is capped, the
// visitor is a hash of the analytics session cookie, and the platform comes
// from the cookie the native shell sets.

export const ANALYTICS_SESSION_COOKIE = "cc_analytics_sid";
export const PLATFORM_COOKIE = "ccr_platform";

export type ServerInteraction = {
  type: InteractionEventType;
  source: "search" | "jobs" | "offers" | "assistant" | "api";
  locale?: string | null;
  professionalId?: string | null;
  categoryId?: string | null;
  viewerUserId?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function clean(value: unknown, max = 100): string | number | boolean | null {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value === null) return value;
  return null;
}

export async function readPlatform(): Promise<"web" | "native"> {
  try {
    const jar = await cookies();
    return jar.get(PLATFORM_COOKIE)?.value === "native" ? "native" : "web";
  } catch {
    return "web";
  }
}

export async function recordServerInteraction(event: ServerInteraction): Promise<void> {
  try {
    const jar = await cookies();
    const sessionId = jar.get(ANALYTICS_SESSION_COOKIE)?.value || randomUUID();
    const platform = jar.get(PLATFORM_COOKIE)?.value === "native" ? "native" : "web";
    const metadata: Record<string, string | number | boolean | null> = { platform };
    for (const [key, value] of Object.entries(event.metadata ?? {}).slice(0, 10)) {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40);
      const safeValue = clean(value);
      if (safeKey && safeValue !== null && safeValue !== undefined) metadata[safeKey] = safeValue;
    }
    const db = createAdminClient();
    const { error } = await db.from("interaction_events").insert({
      event_type: event.type,
      professional_id: event.professionalId ?? null,
      viewer_user_id: event.viewerUserId ?? null,
      visitor_hash: createHash("sha256").update(sessionId).digest("hex"),
      source: event.source,
      locale: event.locale === "en" ? "en" : "es",
      category_id: event.categoryId ? String(event.categoryId).slice(0, 100) : null,
      metadata,
    });
    if (error) console.warn("[analytics] server event not recorded", event.type, error.message);
  } catch (error) {
    console.warn("[analytics] server event failed", event.type, error instanceof Error ? error.message : error);
  }
}
