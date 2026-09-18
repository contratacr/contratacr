import { JobsBoard } from "@/components/jobs/jobs-board";
import { recordServerInteraction } from "@/lib/analytics/server-events";
import { type JobPost } from "@/lib/jobs";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { contactFlagsFor, profesionalesBloqueados } from "@/lib/contact-flags";

export const dynamic = "force-dynamic";

export async function JobsPageContent({ initialSelectedJobId = null, returnTo = null, detailOnly = false }: { initialSelectedJobId?: string | null; returnTo?: string | null; detailOnly?: boolean } = {}) {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  // Ni el CV ni las postulaciones del visitante hacen falta ya: se responde por
  // WhatsApp, así que la pantalla solo necesita los empleos y saber si quien
  // mira puede publicar.
  const [jobsResult, professionalResult] = await Promise.all([
    supabase
      .from("job_posts")
      .select("*, job_applications(count), professionals!job_posts_employer_id_fkey(slug,business_name,profiles(full_name,avatar_url))")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    user ? supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const { data, error: jobsError } = jobsResult;
  const { data: professional, error: professionalError } = professionalResult;

  if (jobsError) console.error("Could not load published jobs", jobsError.message);
  if (professionalError) console.error("Could not load current professional for jobs", professionalError.message);

  const idsEmpleadores = ((data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.employer_id ?? ""));
  const [banderas, bloqueados] = await Promise.all([contactFlagsFor(idsEmpleadores), profesionalesBloqueados(idsEmpleadores)]);

  const jobs = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => !bloqueados.has(String(row.employer_id ?? "")))
    .map((row) => {
    const employer = row.professionals as { slug?: string; business_name?: string; profiles?: { full_name?: string; avatar_url?: string | null } | null } | null;
    const applicationCountRow = Array.isArray(row.job_applications) ? row.job_applications[0] as { count?: number | string } | undefined : undefined;
    const applicationCount = Number(applicationCountRow?.count ?? 0);
    return {
      ...row,
      title: repairVisibleText(String(row.title ?? "")),
      description: repairVisibleText(String(row.description ?? "")),
      employer_name: repairVisibleText(employer?.business_name || employer?.profiles?.full_name || "Profesional en ContrataCR"),
      employer_slug: employer?.slug ?? null,
      employer_avatar_url: employer?.profiles?.avatar_url ?? null,
      // Contactar al que publica el empleo sin pasar por el formulario: hoy la
      // gente escribe por WhatsApp, no espera una postulación dentro del app.
      // Viajan BANDERAS, nunca el número ni el correo: eso sale al tocar el
      // botón por /api/contact/whatsapp-link y /api/contact/reveal, que tienen
      // tope por hora. Es la misma regla que el listado de /buscar.
      // El WhatsApp propio de la vacante manda sobre el de la cuenta.
      employer_has_whatsapp: !!String(row.contact_whatsapp ?? "").trim() || !!banderas[String(row.employer_id ?? "")]?.hasWhatsapp,
      employer_allow_phone_call: !!banderas[String(row.employer_id ?? "")]?.allowPhoneCall,
      application_count: Number.isFinite(applicationCount) ? applicationCount : 0,
    } as JobPost;
  });

  if (detailOnly && initialSelectedJobId) {
    const viewed = jobs.find((job) => job.id === initialSelectedJobId);
    if (viewed && viewed.employer_id !== professional?.id) {
      void recordServerInteraction({ type: "job_view", source: "jobs", professionalId: viewed.employer_id ?? null, categoryId: viewed.service_category_id ?? null, viewerUserId: user?.id ?? null, metadata: { jobId: viewed.id } });
    }
  }

  return (
    <JobsBoard
      jobs={jobs}
      canPost={!!professional}
      initialSelectedJobId={initialSelectedJobId}
      returnTo={returnTo}
      currentProfessionalId={professional?.id ?? null}
      currentUserId={user?.id ?? null}
      detailOnly={detailOnly}
    />
  );
}

export default async function JobsPage() {
  if (!hasSupabaseServerConfig()) {
    return (
      <JobsBoard
        jobs={[]}
        canPost={false}
        initialSelectedJobId={null}
        returnTo={null}
        currentProfessionalId={null}
        currentUserId={null}
        detailOnly={false}
      />
    );
  }

  try {
    return await JobsPageContent();
  } catch (error) {
    console.error("Could not initialize jobs page", error);
    return (
      <JobsBoard
        jobs={[]}
        canPost={false}
        initialSelectedJobId={null}
        returnTo={null}
        currentProfessionalId={null}
        currentUserId={null}
        detailOnly={false}
      />
    );
  }
}
