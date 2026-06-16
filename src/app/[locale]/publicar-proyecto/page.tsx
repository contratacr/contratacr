import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";

export const dynamic = "force-dynamic";

// The "Publicar proyecto" FORM is now a MODAL opened from the panel's "Mis proyectos
// publicados" section — this standalone route no longer renders a form. It just routes
// the user to the right place:
//   • logged OUT → /login (with ?redirect=projects so they land on the projects
//     section after authenticating);
//   • logged IN  → their panel's projects section, role-aware (professional →
//     "Mis proyectos publicados" in the unified panel; client → the client panel).
export default async function PublicarProyectoPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const user = await safeGetUser(supabase);

  if (!user) {
    redirect(`/${locale}/login?redirect=projects`);
  }

  // Resolve the role authoritatively (metadata is often missing/stale):
  // user_metadata.role → profiles.role → existence of a professionals row.
  let role = user.user_metadata?.role as string | undefined;
  if (role !== "professional" && role !== "client") {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    role = (profile?.role as string | undefined) ?? role;
    if (!role) {
      const { data: pro } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
      if (pro) role = "professional";
    }
  }

  redirect(
    role === "professional"
      ? `/${locale}/dashboard/profesional?tab=sent_projects`
      : `/${locale}/dashboard/cliente?tab=projects`
  );
}
