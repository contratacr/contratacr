import type { createAdminClient } from "@/lib/supabase/admin";

export const SELF_PROFILE_EVENT_TYPES = new Set([
  "profile_view", "whatsapp_click", "phone_click", "email_click", "availability_view",
  "schedule_slot_selected", "favorite_add", "favorite_remove", "profile_share",
  "external_link_click", "contact_gate_shown",
]);

/** Ownership comes from the database, never from event metadata supplied by a browser. */
export async function isSelfInteraction(db: ReturnType<typeof createAdminClient>, professionalId?: string | null, viewerUserId?: string | null, eventType?: string) {
  if (eventType && !SELF_PROFILE_EVENT_TYPES.has(eventType)) return false;
  if (!professionalId || !viewerUserId) return false;
  const { data, error } = await db.from("professionals").select("profile_id").eq("id", professionalId).maybeSingle();
  if (error) throw error; // Measurement fails closed; marketplace actions still succeed.
  return data?.profile_id === viewerUserId;
}
