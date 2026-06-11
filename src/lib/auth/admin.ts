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
 * Returns the current admin user (role === 'admin') or null.
 * Reads the session from cookies, then confirms the role from the profiles
 * table using the service-role client (so an RLS gap can never grant access).
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const supabase = await createClient();
  // Never throw on a stale/invalid session — treat it as logged-out.
  const user = await safeGetUser(supabase);
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;

  return {
    id: user.id,
    email: profile.email ?? user.email ?? "",
    fullName: profile.full_name ?? "Administrador",
  };
}

/**
 * Server-component guard. Redirects non-admins to the admin login page.
 * Use at the top of every /admin server component / layout.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect("/admin");
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
