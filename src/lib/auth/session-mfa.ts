import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";

/** Live factors and the database role decide policy, never editable user metadata. */
export const getSessionMfa = cache(async () => {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) return { userId: null, authenticated: false, isAdmin: false, enrolled: false, required: false };
  const { data: profile, error: profileError } = await createAdminClient().from("profiles").select("role,is_disabled").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  const isAdmin = profile?.role === "admin" && !profile.is_disabled;
  const enrolled = Boolean(user.factors?.some(factor => factor.factor_type === "totp" && factor.status === "verified"));
  if (!enrolled && !isAdmin) return { userId: user.id, authenticated: true, isAdmin, enrolled, required: false };
  const { data, error } = await supabase.auth.getClaims();
  const verified = !error && data?.claims.sub === user.id && data.claims.aal === "aal2" && enrolled;
  return { userId: user.id, authenticated: true, isAdmin, enrolled, required: !verified };
});
