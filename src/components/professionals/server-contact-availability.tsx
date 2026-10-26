import "server-only";
import { cache, type ReactNode } from "react";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { initialContactAvailability } from "@/lib/direct-chat/availability";
import { ContactAvailabilityProvider } from "@/hooks/use-profesional-con-app";

// Request-scoped only: channel decisions must never leak between viewers.
const resolveContact = cache(async (professionalId: string) => {
  if (!hasSupabaseServerConfig()) return initialContactAvailability(undefined, []);
  const db = await createClient();
  const user = await safeGetUser(db);
  if (!user) return initialContactAvailability(undefined, []);
  const { data } = await db.from("professionals").select("id,profile_id").eq("id", professionalId).maybeSingle();
  return initialContactAvailability(user.id, data ? [{ id: data.id, profileId: data.profile_id }] : []);
});

export async function ServerContactAvailability({professionalId, children}: {professionalId: string; children: ReactNode}) {
  const initial = await resolveContact(professionalId);
  return <ContactAvailabilityProvider {...initial}>{children}</ContactAvailabilityProvider>;
}
