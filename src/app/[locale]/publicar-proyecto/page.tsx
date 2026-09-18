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
export default async function PublicarProyectoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const { desde } = await searchParams;
  // De dónde vino, para que la flecha de atrás devuelva ahí. Solo pantallas
  // conocidas: un destino libre en la dirección es una puerta abierta.
  const volverA = desde === "proyectos" ? "/proyectos" : null;
  const supabase = await createClient();
  const user = await safeGetUser(supabase);

  if (!user) {
    redirect(`/${locale}/login?redirect=projects${volverA ? `&desde=proyectos` : ""}`);
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

  // `openPublish=1` abre el formulario apenas carga la sección. Sin él esta
  // dirección dejaba a la persona en la lista de sus proyectos, con un botón
  // más que buscar: quien entra por «Crear proyecto» ya dijo lo que quiere.
  void role;
  redirect(`/${locale}/dashboard/profesional?tab=sent_projects&openPublish=1${volverA ? `&returnTo=${volverA}` : ""}`);
}
