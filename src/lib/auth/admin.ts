import { hasRecentAdminMfa } from "./admin-mfa-policy";
import { cache } from "react";
import { getLocale } from "next-intl/server";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
};

/**
 * Separates anonymous sessions from authenticated accounts without admin access.
 * Reads the session from cookies, then confirms the role from the profiles
 * table using the service-role client (so an RLS gap can never grant access).
 */
export const getAdminAccess = cache(async (): Promise<{ authenticated: boolean; admin: AdminUser | null; mfaRequired: boolean; enrolled: boolean }> => {
  const supabase = await createClient();
  // Never throw on a stale/invalid session — treat it as logged-out.
  const user = await safeGetUser(supabase);
  if (!user) return { authenticated: false, admin: null, mfaRequired: false, enrolled: false };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, email, is_disabled")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.is_disabled) return { authenticated: true, admin: null, mfaRequired: false, enrolled: false };

  const enrolled = Boolean(user.factors?.some(factor => factor.factor_type === "totp" && factor.status === "verified"));
  // getAuthenticatorAssuranceLevel alone decodes local session storage. Verify
  // the JWT signature/expiry as well as the live user before granting access.
  const { data, error } = await supabase.auth.getClaims();
  if (error || data?.claims.sub !== user.id || !enrolled || !hasRecentAdminMfa(data.claims)) {
    return { authenticated: true, admin: null, mfaRequired: true, enrolled };
  }

  return {
    authenticated: true,
    mfaRequired: false,
    enrolled: true,
    admin: {
      id: user.id,
      email: profile.email ?? user.email ?? "",
      fullName: profile.full_name ?? "Administrador",
    },
  };
});

export async function getAdminUser(): Promise<AdminUser | null> {
  return (await getAdminAccess()).admin;
}

/**
 * Server-component guard. Redirects to the entry page, which distinguishes
 * anonymous visitors from authenticated accounts without administrator access.
 * Use at the top of every /admin server component / layout.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect(`${prefijoDeIdioma(await getLocale())}/admin`);
  return adminUser;
}

/**
 * API-route guard. Returns the admin user, or null when the caller is not an
 * admin (the route should then respond 403). Authorization is enforced on the
 * server for EVERY admin endpoint — never trust the client.
 */
export async function getApiAdmin(): Promise<AdminUser | null> {
  return getAdminUser();
}
