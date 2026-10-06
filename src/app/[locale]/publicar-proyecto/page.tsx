import { redirect } from "next/navigation";
import { paginaDeOrigen } from "@/lib/navigation/pagina-de-origen";
import { PublicarProyectoSinSesion } from "@/components/projects/publicar-proyecto-sin-sesion";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { imagenSocial } from "@/lib/seo/imagen-social";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return { title: en ? "Post what you need · ContrataCR" : "Publica lo que necesitas · ContrataCR", description: en ? "Tell us what you need and professionals contact you on WhatsApp. Free." : "Cuenta qué necesitas y los profesionales te contactan por WhatsApp. Gratis.", ...imagenSocial(locale) };
}


// The "Publicar proyecto" FORM is now a MODAL opened from the panel's "Mis proyectos
// publicados" section — this standalone route no longer renders a form. It just routes
// the user to the right place:
//   • logged OUT → the form right here; publishing saves a draft and asks to
//     log in, then comes back with ?borrador=1 (4-oct-2026);
//   • logged IN  → their panel's projects section, role-aware (professional →
//     "Mis proyectos publicados" in the unified panel; client → the client panel).
export default async function PublicarProyectoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const { desde, categoria, provincia, canton, borrador } = await searchParams;
  // Desde una búsqueda llegan el servicio y el lugar: el formulario los trae puestos.
  const prellenado = new URLSearchParams();
  for (const [clave, valor] of [["categoria", categoria], ["provincia", provincia], ["canton", canton]] as const) {
    if (typeof valor === "string" && /^[a-z0-9_-]{1,60}$/i.test(valor)) prellenado.set(clave, valor);
  }
  // Vuelve de entrar con lo que ya había escrito: la ventana lo carga.
  if (borrador === "1") prellenado.set("borrador", "1");
  const extra = prellenado.toString() ? `&${prellenado.toString()}` : "";
  // De dónde vino, para que la flecha de atrás devuelva ahí: la página que
  // abrió el enlace (Referer, solo si es de este mismo sitio y una ruta interna
  // segura). Sin ella, «desde=proyectos» como antes.
  const volverA = await paginaDeOrigen() ?? (desde === "proyectos" ? "/proyectos" : null);
  const supabase = await createClient();
  const user = await safeGetUser(supabase);

  // Sin sesión se llena todo aquí mismo; al publicar se guarda y se pide entrar.
  if (!user) return <PublicarProyectoSinSesion volverA={volverA ?? "/proyectos"} />;

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
  redirect(`${prefijoDeIdioma(locale)}/dashboard/profesional?tab=sent_projects&openPublish=1${volverA ? `&returnTo=${encodeURIComponent(volverA)}` : ""}${extra}`);
}
