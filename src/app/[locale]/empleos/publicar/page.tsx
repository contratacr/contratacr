import { redirect } from "next/navigation";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { getLocale } from "next-intl/server";
import { JobPostFormConBorrador } from "@/components/jobs/job-post-form-con-borrador";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PublishJobPage({ searchParams }: { searchParams: Promise<{ from?: string; borrador?: string }> }) {
  const locale = await getLocale();
  const params = await searchParams;
  const fromPanel = params.from === "panel";
  const conBorrador = params.borrador === "1";
  const backHref = fromPanel ? "/dashboard/profesional?mode=offer&tab=jobs" : "/empleos";
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  // Sin sesión se puede llenar todo: al publicar se guarda y se pide entrar.
  if (!user) return <JobPostFormConBorrador professionalId={null} backHref={backHref} conBorrador={false} />;
  // Con la llave del servidor y el id ya verificado de la sesión: recién
  // convertida en profesional, la sesión de la cookie todavía es la vieja y
  // las reglas de acceso no le dejaban ver su propio perfil. El registro (que
  // sí lo ve) la devolvía aquí y esta página al registro, en bucle.
  const { data: professional } = await createAdminClient().from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  const publishPath = `${prefijoDeIdioma(locale)}/empleos/publicar${fromPanel ? "?from=panel" : ""}${conBorrador ? `${fromPanel ? "&" : "?"}borrador=1` : ""}`;
  if (!professional) redirect(`${prefijoDeIdioma(locale)}/registro/profesional?redirect=${encodeURIComponent(publishPath)}`);
  return <JobPostFormConBorrador professionalId={professional.id} backHref={backHref} conBorrador={conBorrador} />;
}
