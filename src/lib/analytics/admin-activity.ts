import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";

/** Resolve missing actors from the session: server searches often omit the viewer. */
export async function analyticsActor(userId?: string | null) {
  const id = userId === undefined ? (await safeGetUser(await createClient()))?.id ?? null : userId;
  if (!id) return { id: null, excluded: false, administrator: false };
  const { data, error } = await createAdminClient().from("profiles").select("role").eq("id", id).maybeSingle();
  // A failed role check must not contaminate metrics with an unknown account.
  return { id, excluded: Boolean(error) || !data || data.role === "admin", administrator: !error && data?.role === "admin" };
}
