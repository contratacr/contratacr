"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronDown, FileText, Mail, MoreVertical, Phone, Plus, UserRound, Users } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { invalidateAppData } from "@/lib/app-data-invalidation";
import type { JobPost } from "@/lib/jobs";
import { SelectMenu } from "@/components/ui/select-menu";
import { Modal } from "@/components/ui/modal";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { cn } from "@/lib/utils";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { useLocale } from "next-intl";
import { employmentTypeLabel, marketplaceLocale, type MarketplaceLocale } from "@/lib/marketplace-copy";

type Application = { id: string; status: string; created_at: string; cover_letter: string; applicant_email: string | null; phone: string | null; resume_url: string | null; portfolio_url: string | null; applicant_name: string };
export type ManagedJob = JobPost & { applications: Application[] };

const JOBS_MANAGER_COPY = {
  es: {
    applicationStates: { submitted: "Recibida", reviewing: "En revisión", shortlisted: "Finalista", rejected: "Descartada", hired: "Contratada" },
    jobStates: { published: "Publicado", paused: "Pausado", closed: "Cerrado", draft: "Borrador" },
    back: "Volver al panel", title: "Mis empleos", subtitle: "Administra vacantes y revisa postulaciones.", publish: "Publicar",
    application: "postulación", applications: "postulaciones", view: "Ver empleo", edit: "Editar", more: "Más opciones",
    pause: "Pausar", close: "Cerrar vacante", applicationsTitle: "Postulaciones", candidate: "candidato", candidates: "candidatos",
    received: "Postulación recibida", message: "Mensaje", viewCv: "Ver CV", viewPortfolio: "Ver portafolio",
    noApplications: "Aún no hay postulaciones.", emptyTitle: "Todavía no has publicado empleos", emptyBody: "Publica tu primera oportunidad laboral.",
    publishTitle: "Publicar empleo", publishSubtitle: "Describe la oportunidad con información clara y verificable.",
    editTitle: "Editar empleo", editSubtitle: "Actualiza la información de esta publicación.",
  },
  en: {
    applicationStates: { submitted: "Received", reviewing: "In review", shortlisted: "Shortlisted", rejected: "Rejected", hired: "Hired" },
    jobStates: { published: "Published", paused: "Paused", closed: "Closed", draft: "Draft" },
    back: "Back to dashboard", title: "My jobs", subtitle: "Manage openings and review applications.", publish: "Post",
    application: "application", applications: "applications", view: "View job", edit: "Edit", more: "More options",
    pause: "Pause", close: "Close opening", applicationsTitle: "Applications", candidate: "candidate", candidates: "candidates",
    received: "Application received", message: "Message", viewCv: "View resume", viewPortfolio: "View portfolio",
    noApplications: "There are no applications yet.", emptyTitle: "You have not posted any jobs yet", emptyBody: "Post your first job opportunity.",
    publishTitle: "Post a job", publishSubtitle: "Describe the opportunity with clear, verifiable information.",
    editTitle: "Edit job", editSubtitle: "Update this job's information.",
  },
} satisfies Record<MarketplaceLocale, Record<string, unknown>>;

function applicationDate(value: string, locale: MarketplaceLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function applicantInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function statusClass(status: JobPost["status"]) {
  if (status === "published") return "bg-[#e8f8f3] text-[#08775c]";
  if (status === "closed") return "bg-[#fff1f2] text-[#be123c]";
  if (status === "paused") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#eef2f6] text-[#60708a]";
}

export function JobsManager({ initialJobs, embedded = false, backHref = "/dashboard/profesional?mode=offer&tab=jobs", professionalId, onRefresh }: { initialJobs: ManagedJob[]; embedded?: boolean; backHref?: string; professionalId?: string; onRefresh?: () => void }) {
  const locale = marketplaceLocale(useLocale());
  const copy = JOBS_MANAGER_COPY[locale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState(initialJobs);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("job"));
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ManagedJob | null>(null);
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);

  useEffect(() => {
    const jobId = searchParams.get("job");
    if (!jobId) return;
    const frame = requestAnimationFrame(() => setOpenId(jobId));
    return () => cancelAnimationFrame(frame);
  }, [searchParams]);

  // A status changed here must survive a server re-render that was started
  // before the change committed (quick pause → publish on a slow network);
  // the local status wins until the server snapshot agrees with it.
  const pendingStatus = useRef<Record<string, JobPost["status"]>>({});
  useEffect(() => {
    const frame = requestAnimationFrame(() => setJobs(initialJobs.map((item) => {
      const pending = pendingStatus.current[item.id];
      if (!pending) return item;
      if (item.status === pending) {
        delete pendingStatus.current[item.id];
        return item;
      }
      return { ...item, status: pending };
    })));
    return () => cancelAnimationFrame(frame);
  }, [initialJobs]);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(`[data-job-actions="${actionsOpen}"]`)) setActionsOpen(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsOpen(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen]);

  async function updateJobStatus(id: string, status: JobPost["status"]) {
    const response = await fetch("/api/jobs/posts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) {
      pendingStatus.current[id] = status;
      setJobs((current) => current.map((job) => job.id === id ? { ...job, status } : job));
      invalidateAppData("jobs");
    }
  }

  async function updateApplication(jobId: string, applicationId: string, status: string) {
    const { error } = await createClient().from("job_applications").update({ status }).eq("id", applicationId);
    if (!error) {
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, applications: job.applications.map((item) => item.id === applicationId ? { ...item, status } : item) } : job));
      invalidateAppData("jobs");
    }
  }

  return (
    <div className={embedded ? "text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] px-4 py-6 text-[#162543] sm:px-6 sm:py-10"}>
      <div className={embedded ? "w-full" : "mx-auto max-w-4xl"}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {!embedded && (
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={backHref} aria-label={copy.back} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#162543] hover:bg-white">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-2xl font-bold">{copy.title}</h1>
              </div>
            )}
            <p className="text-sm text-[#65758c]">{copy.subtitle}</p>
          </div>
          <>
            <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:inline-flex"><Plus className="h-4 w-4" />{copy.publish}</button>
            <Link href="/empleos/publicar?from=panel" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:hidden"><Plus className="h-4 w-4" />{copy.publish}</Link>
          </>
        </div>
        <div className="space-y-3.5">
          {jobs.map((job) => {
            const isOpen = openId === job.id;
            return (
              <article key={job.id} className={cn("relative overflow-visible rounded-2xl border border-[#d9e6ef] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]", actionsOpen === job.id && "z-40")}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : job.id)} className="flex h-24 w-full items-center gap-3 px-4 text-left sm:px-5">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-extrabold leading-tight text-[#111827] sm:text-base">{job.title}</h2>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#65758c]">
                      <span className="truncate">{employmentTypeLabel(job.employment_type, locale)}</span>
                      <span className="text-[#cbd5e1]">|</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-[#8ca0b8]" />{job.applications.length} {job.applications.length === 1 ? copy.application : copy.applications}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusClass(job.status))}>{copy.jobStates[job.status]}</span>
                    <ChevronDown className={cn("h-5 w-5 text-[#6b7b90] transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#e6edf3] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    {job.description && <p className="mb-4 whitespace-pre-line break-words text-sm leading-6 text-[#52627a] [overflow-wrap:anywhere]">{job.description}</p>}
                    <div data-job-actions={job.id} className="relative mb-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                      <Link href={`/empleos/${job.id}?from=panel`} onClick={openInNewTabOnDesktop} className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#d7e1ea] px-3 text-xs font-bold text-[#162543]">{copy.view}</Link>
                      <button type="button" onClick={() => setEditingJob(job)} className="hidden h-10 w-full items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">{copy.edit}</button>
                      <Link href={`/empleos/${job.id}/editar?from=panel`} className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:hidden">{copy.edit}</Link>
                      <div className="relative">
                        <button type="button" onClick={() => setActionsOpen((current) => current === job.id ? null : job.id)} aria-label={copy.more} aria-haspopup="menu" aria-expanded={actionsOpen === job.id} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d7e1ea] text-[#718096] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] hover:text-[#162543]"><MoreVertical className="h-5 w-5" /></button>
                        {actionsOpen === job.id && (
                          <div role="menu" className="absolute bottom-[calc(100%+6px)] right-0 z-50 w-44 overflow-hidden rounded-xl border border-[#dfe8f0] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]">
                            {job.status !== "published" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateJobStatus(job.id, "published"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#008fc3] hover:bg-[#f0f9fc]">{copy.publish}</button>}
                            {job.status === "published" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateJobStatus(job.id, "paused"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]">{copy.pause}</button>}
                            {job.status !== "closed" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateJobStatus(job.id, "closed"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50">{copy.close}</button>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold">{copy.applicationsTitle}</h3>
                      {job.applications.length > 0 && <span className="text-xs font-semibold text-[#708096]">{job.applications.length} {job.applications.length === 1 ? copy.candidate : copy.candidates}</span>}
                    </div>
                    <div className={cn(job.applications.length > 0 && "overflow-hidden rounded-xl border border-[#dfe8f0] bg-white divide-y divide-[#e6edf3]")}>
                      {job.applications.map((application) => (
                        <section key={application.id} className="px-4 py-4 sm:px-5">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-start">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf8fc] text-xs font-extrabold text-[#008fc3]" aria-hidden="true">
                                {applicantInitials(application.applicant_name) || <UserRound className="h-4 w-4" />}
                              </span>
                              <div className="min-w-0">
                                <p className="break-words font-bold leading-5 text-[#162543]">{application.applicant_name}</p>
                                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#718096]"><CalendarDays className="h-3.5 w-3.5" />{copy.received} {applicationDate(application.created_at, locale)}</p>
                              </div>
                            </div>
                            <SelectMenu value={application.status} onChange={(status) => updateApplication(job.id, application.id, status)} options={Object.entries(copy.applicationStates).map(([value, label]) => ({ value, label }))} className="w-full" />
                          </div>
                          {application.cover_letter && (
                            <div className="mt-4 border-l-2 border-[#d7edf6] pl-3">
                              <p className="text-[11px] font-bold uppercase text-[#8290a4]">{copy.message}</p>
                              <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#52627a] [overflow-wrap:anywhere]">{application.cover_letter}</p>
                            </div>
                          )}
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {application.applicant_email && <a href={`mailto:${application.applicant_email}`} className="inline-flex min-w-0 items-center gap-2 rounded-lg bg-[#f6f9fb] px-3 py-2.5 text-xs font-semibold text-[#31415a] hover:bg-[#edf4f8]"><Mail className="h-4 w-4 shrink-0 text-[#008fc3]" /><span className="truncate">{application.applicant_email}</span></a>}
                            {application.phone && <a href={`tel:${application.phone}`} className="inline-flex min-w-0 items-center gap-2 rounded-lg bg-[#f6f9fb] px-3 py-2.5 text-xs font-semibold text-[#31415a] hover:bg-[#edf4f8]"><Phone className="h-4 w-4 shrink-0 text-[#008fc3]" /><span className="truncate">{application.phone}</span></a>}
                          </div>
                          {(application.resume_url || application.portfolio_url) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {application.resume_url && <a href={`/api/jobs/applications/${application.id}/resume`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbdbe7] px-3 text-xs font-bold text-[#162543] hover:bg-[#f6f9fb]"><FileText className="h-4 w-4 text-[#008fc3]" />{copy.viewCv}</a>}
                              {application.portfolio_url && <a href={application.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-[#cbdbe7] px-3 text-xs font-bold text-[#162543] hover:bg-[#f6f9fb]">{copy.viewPortfolio}</a>}
                            </div>
                          )}
                        </section>
                      ))}
                      {job.applications.length === 0 && <p className="rounded-xl bg-[#f6f9fb] p-5 text-center text-sm text-[#68778d]">{copy.noApplications}</p>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {jobs.length === 0 && (
            <div className={cn(
              "px-6 py-12 text-center",
              embedded
                ? "rounded-xl border border-dashed border-[#d8e4ec] bg-[#f8fbfd]"
                : "rounded-2xl border border-[#dfe8f0] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
            )}>
              <h2 className="font-bold">{copy.emptyTitle}</h2>
              <p className="mt-1 text-sm text-[#68778d]">{copy.emptyBody}</p>
            </div>
          )}
        </div>
      </div>
      {publishOpen && professionalId && (
        <Modal onClose={() => setPublishOpen(false)} title={copy.publishTitle} subtitle={copy.publishSubtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
          <JobPostForm professionalId={professionalId} presentation="modal" backHref={backHref} onSaved={(id) => { setPublishOpen(false); onRefresh?.(); router.push(`/empleos/${id}?from=panel`); }} />
        </Modal>
      )}
      {editingJob && professionalId && (
        <Modal onClose={() => setEditingJob(null)} title={copy.editTitle} subtitle={copy.editSubtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
          <JobPostForm key={editingJob.id} professionalId={professionalId} initialJob={editingJob} presentation="modal" backHref={backHref} onSaved={() => { setEditingJob(null); onRefresh?.(); router.refresh(); }} />
        </Modal>
      )}
    </div>
  );
}
