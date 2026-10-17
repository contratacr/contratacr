import type { User } from "@supabase/supabase-js";

// A stored JWT can contain older user metadata than the server-rendered account.
// Keep newer data for the same identity; explicit sign-out and account switches
// must still apply immediately.
export function freshestAuthUser(incoming: User | null, known: User | null): User | null {
  if (incoming && known && incoming.id === known.id && Date.parse(known.updated_at ?? "") > Date.parse(incoming.updated_at ?? "")) return known;
  return incoming;
}
