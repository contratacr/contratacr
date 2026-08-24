"use client";

import { useState } from "react";
import { BriefcaseBusiness, CalendarDays, ChevronDown, Download, ExternalLink, FileText, MapPin } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";
import { EMPLOYMENT_TYPES, WORKPLACE_TYPES, type EmploymentType, type WorkplaceType } from "@/lib/jobs";
import { formatRelativeOrDate, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";

type Application = {
  id: string; status: string; createdAt: string; resumeUrl: string | null;
  resumeName: string | null;
  coverLetter: string | null; portfolioUrl: string | null;
  job: {
    id: string; title: string; employmentType: EmploymentType; workplaceType: WorkplaceType;
    locationLabel: string | null; status: string; employerName: string; employerAvatarUrl: string | null;
  } | null;
};
const STATUS_COPY: Record<string, { es: string; en: string; className: string }> = {
  submitted: { es: "Enviada", en: "Submitted", className: "bg-[#eef8fd] text-[#0089bb]" },
  reviewing: { es: "En revisión", en: "In review", className: "bg-[#fff7df] text-[#936100]" },
  shortlisted: { es: "Finalista", en: "Shortlisted", className: "bg-[#eef8fd] text-[#0089bb]" },
  hired: { es: "Seleccionado", en: "Selected", className: "bg-[#e9f8f1] text-[#087a55]" },
  rejected: { es: "No seleccionado", en: "Not selected", className: "bg-[#f3f4f6] text-[#6b7280]" },
  withdrawn: { es: "Retirada", en: "Withdrawn", className: "bg-[#f3f4f6] text-[#6b7280]" },
  job_closed: { es: "Empleo cerrado", en: "Job closed", className: "bg-[#f3f4f6] text-[#596579]" },
};

function applicationDisplayStatus(application: Application) {
  const terminal = ["hired", "rejected", "withdrawn"];
  if (!terminal.includes(application.status) && application.job?.status === "closed") return STATUS_COPY.job_closed;
  return STATUS_COPY[application.status] ?? STATUS_COPY.submitted;
}

function applicationStatusMessage(application: Application, isEn: boolean) {
  if (application.status === "hired") return isEn ? "You were selected for this job." : "Fuiste seleccionado para este empleo.";
  if (application.status === "rejected") return isEn ? "The employer continued with other applicants." : "El empleador continuó con otras postulaciones.";
  if (application.status === "withdrawn") return isEn ? "You withdrew this application." : "Retiraste esta postulación.";
  if (application.job?.status === "closed") return isEn ? "This vacancy is closed and no longer accepts applications." : "La vacante fue cerrada y ya no recibe postulaciones.";
  if (application.job?.status === "paused") return isEn ? "The publication is temporarily paused." : "La publicación está pausada temporalmente.";
  if (application.status === "shortlisted") return isEn ? "You advanced to the finalist stage." : "Avanzaste a la etapa de finalistas.";
  if (application.status === "reviewing") return isEn ? "The employer is reviewing your application." : "El empleador está revisando tu postulación.";
  return isEn ? "Your application was sent successfully." : "Tu postulación fue enviada correctamente.";
}

const NO_APPLICATIONS: Application[] = [];

export function ClientJobApplications() {
  const locale = useLocale();
  const isEn = locale === "en";
  const { user } = useAuth();
  const { data: applications, loading } = useCachedResource<Application[]>(
    user ? `dashboard:job-applications:${user.id}` : null,
    async () => {
      const response = await fetch("/api/jobs/applications", { cache: "no-store" });
      const payload = await response.json();
      return Array.isArray(payload.applications) ? payload.applications : [];
    },
    NO_APPLICATIONS,
    { refreshOn: true },
  );
  const [openId, setOpenId] = useState<string | null>(null);

  function resumeDownloadUrl(application: Application) {
    return application.resumeUrl ?? "";
  }
  if (loading) return <PanelListSkeleton rows={3} hasData={applications.length > 0} />;
  if (!applications.length) return (
    <PanelEmptyState
      icon={BriefcaseBusiness}
      title={isEn ? "You have not applied to any jobs yet" : "Aún no tienes postulaciones"}
      description={isEn ? "Jobs you apply to will appear here with their current status." : "Aquí verás los empleos a los que apliques y el estado de cada postulación."}
      action={<Button asChild><Link href="/empleos">{isEn ? "Explore jobs" : "Explorar empleos"}</Link></Button>}
    />
  );
  return (
    <div className="ccr-native-safe-list-end overflow-hidden rounded-2xl border border-[#dfe8f0] bg-white divide-y divide-[#eef3f7]">
      {applications.map((application) => {
        const job = application.job;
        const status = applicationDisplayStatus(application);
        const isOpen = openId === application.id;
        if (!job) return null;
        return (
          <article key={application.id}>
            <button type="button" onClick={() => setOpenId(isOpen ? null : application.id)} aria-expanded={isOpen} className="group grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[#f8fbfd] sm:px-5">
              <Avatar className="h-12 w-12 rounded-xl">
                <AvatarImage src={job.employerAvatarUrl ?? undefined} className="object-cover" />
                <AvatarFallback className="rounded-xl bg-[#eef8fd] text-xs font-bold text-[#009FD9]">{getInitials(job.employerName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate text-sm font-extrabold text-[#162543]">{job.title}</h3>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold " + status.className}>{isEn ? status.en : status.es}</span>
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-[#53627a]">{job.employerName}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-[#78869a]">
                  <span>{EMPLOYMENT_TYPES[job.employmentType]}</span>
                  <span>{WORKPLACE_TYPES[job.workplaceType]}</span>
                  {job.locationLabel && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{job.locationLabel}</span></span>}
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{isEn ? "Applied" : "Aplicaste"} {formatRelativeOrDate(application.createdAt, locale)}</span>
                </div>
              </div>
              <ChevronDown className={"h-4 w-4 text-[#9aa8ba] transition-transform group-hover:text-[#009FD9] " + (isOpen ? "rotate-180" : "")} />
            </button>
            {isOpen && (
              <div className="border-t border-[#eef3f7] bg-[#fbfdfe] px-4 py-4 sm:px-5">
                <p className="mb-4 text-sm font-semibold text-[#52627a]">{applicationStatusMessage(application, isEn)}</p>
                {application.coverLetter && <div className="mb-4"><p className="text-[11px] font-bold uppercase text-[#8290a4]">{isEn ? "Message" : "Mensaje enviado"}</p><p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#52627a]">{application.coverLetter}</p></div>}
                <div className="flex flex-col gap-3 border-t border-[#e7edf2] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  {application.resumeUrl ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3 py-1">
                      <span className="grid h-9 w-9 shrink-0 place-items-center text-[#008fc3]"><FileText className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-[#162543]">{application.resumeName || "CV"}</p>
                          <a href={resumeDownloadUrl(application)} download={application.resumeName || "CV"} aria-label={isEn ? "Download CV" : "Descargar CV"} title={isEn ? "Download CV" : "Descargar CV"} className="grid h-7 w-7 shrink-0 place-items-center text-[#008fc3] hover:text-[#00749f]"><Download className="h-4 w-4" /></a>
                        </div>
                        <p className="text-[11px] font-medium text-[#78869a]">{isEn ? "Submitted" : "Enviado"} {formatRelativeOrDate(application.createdAt, locale)}</p>
                      </div>
                    </div>
                  ) : <span className="inline-flex h-10 items-center justify-center rounded-lg bg-[#f3f6f8] px-3 text-sm font-semibold text-[#718096]">{isEn ? "CV unavailable" : "CV no disponible"}</span>}
                  {job.status === "published" ? (
                    <Link href={"/empleos/" + job.id + "?job=" + job.id + "&from=" + encodeURIComponent("/dashboard/cliente?tab=applications")} className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white hover:bg-[#008fc3] sm:w-auto">{isEn ? "View job" : "Ver empleo"}<ExternalLink className="h-4 w-4" /></Link>
                  ) : (
                    <span className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-lg bg-[#e8edf2] px-5 text-sm font-bold text-[#718096] sm:w-auto">{isEn ? "Publication unavailable" : "Publicación no disponible"}</span>
                  )}
                </div>
                {application.portfolioUrl && <a href={application.portfolioUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-[#008fc3] hover:underline">{isEn ? "View submitted portfolio" : "Ver portafolio utilizado"}</a>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
