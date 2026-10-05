import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";
import { paginaDeOrigen } from "@/lib/navigation/pagina-de-origen";
import { CotizarSinSesion } from "@/components/quotes/cotizar-sin-sesion";

export const dynamic = "force-dynamic";

/**
 * HACER UNA COTIZACIÓN SIN CUENTA (4-oct-2026). Se llena completa aquí; al
 * enviarla se guarda y se pide entrar o registrarse como profesional. Con
 * cuenta profesional, va directo al editor de Cotizaciones del panel.
 */
export default async function CotizarPage({ searchParams }: { searchParams: Promise<{ borrador?: string }> }) {
  const locale = await getLocale();
  const conBorrador = (await searchParams).borrador === "1";
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  // La flecha vuelve a la página de la que se vino.
  if (!user) return <CotizarSinSesion volverA={(await paginaDeOrigen()) ?? "/"} />;
  // Con la llave del servidor y el id ya verificado de la sesión: recién
  // convertida en profesional, la sesión de la cookie todavía es la vieja y
  // las reglas de acceso no le dejaban ver su propio perfil. El registro (que
  // sí lo ve) la devolvía aquí y esta página al registro, en bucle.
  const { data: professional } = await createAdminClient().from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) {
    const volver = `${prefijoDeIdioma(locale)}/cotizar${conBorrador ? "?borrador=1" : ""}`;
    redirect(`${prefijoDeIdioma(locale)}/registro/profesional?redirect=${encodeURIComponent(volver)}`);
  }
  redirect(`${prefijoDeIdioma(locale)}/dashboard/profesional?mode=offer&tab=quotes&nueva=1${conBorrador ? "&borrador=1" : ""}`);
}
