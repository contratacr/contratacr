import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTERACTION_EVENT_TYPES, type InteractionEventType } from "@/lib/analytics/interaction-events";

const SESSION_COOKIE = "cc_analytics_sid";
const VALID_EVENTS = new Set<string>(INTERACTION_EVENT_TYPES);
const VALID_SOURCES = new Set([
  "search",
  "profile",
  "profile_service",
  "profile_social",
  "booking",
  "project",
  "favorites",
  "api",
  "unknown",
]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 8)) {
    const safeKey = cleanText(key, 40);
    if (!safeKey) continue;
    if (typeof item === "string") output[safeKey] = cleanText(item, 100);
    else if (typeof item === "number" && Number.isFinite(item)) output[safeKey] = item;
    else if (typeof item === "boolean" || item === null) output[safeKey] = item;
  }
  return output;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !VALID_EVENTS.has(String(body.type ?? ""))) {
    return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });
  }

  const professionalId = cleanText(body.professionalId, 36) || null;
  const sourceCandidate = cleanText(body.source, 40);
  const source = VALID_SOURCES.has(sourceCandidate) ? sourceCandidate : "unknown";
  const locale = body.locale === "en" ? "en" : "es";
  const categoryId = cleanText(body.categoryId, 100) || null;
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value || randomUUID();
  const visitorHash = createHash("sha256").update(sessionId).digest("hex");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = createAdminClient();

  if (professionalId) {
    const { data: professional } = await db.from("professionals").select("id, profile_id").eq("id", professionalId).maybeSingle();
    if (!professional) return NextResponse.json({ error: "Professional not found." }, { status: 404 });
    if (professional.profile_id === user?.id) return new NextResponse(null, { status: 204 });
  }

  const { error } = await db.from("interaction_events").insert({
    event_type: String(body.type) as InteractionEventType,
    professional_id: professionalId,
    viewer_user_id: user?.id ?? null,
    visitor_hash: visitorHash,
    source,
    locale,
    category_id: categoryId,
    metadata: cleanMetadata(body.metadata),
  });

  if (error) {
    console.error("[analytics] interaction insert failed", error.message);
    return NextResponse.json({ error: "Could not record analytics event." }, { status: 500 });
  }

  const response = new NextResponse(null, { status: 204 });
  if (!req.cookies.has(SESSION_COOKIE)) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
