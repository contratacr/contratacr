"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, ChevronDown, MoreHorizontal, Plus, Users } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { EMPLOYMENT_TYPES, type JobPost } from "@/lib/jobs";
import { SelectMenu } from "@/components/ui/select-menu";
import { Modal } from "@/components/ui/modal";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { cn } from "@/lib/utils";

type Application = { id: string; status: string; created_at: string; cover_letter: string; applicant_email: string | null; phone: string | null; resume_url: string | null; portfolio_url: string | null; applicant_name: string };
export type ManagedJob = JobPost & { applications: Application[] };

const APPLICATION_STATES = { submitted: "Recibida", reviewing: "En revisión", shortlisted: "Finalista", rejected: "Descartada", hired: "Contratada" };
const JOB_STATES: Record<JobPost["status"], string> = { published: "Publicado", paused: "Pausado", closed: "Cerrado", draft: "Borrador" };

function statusClass(status: JobPost["status"]) {
  if (status === "published") return "bg-[#e8f8f3] text-[#08775c]";
  if (status === "closed") return "bg-[#fff1f2] text-[#be123c]";
  if (status === "paused") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#eef2f6] text-[#60708a]";
}

export function JobsManager({ initialJobs, embedded = false, backHref = "/dashboard/profesional?mode=offer&tab=jobs", professionalId, onRefresh }: { initialJobs: ManagedJob[]; embedded?: boolean; backHref?: string; professionalId?: string; onRefresh?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState(initialJobs);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("job"));
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ManagedJob | null>(null);
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const jobId = searchParams.get("job");
    if (jobId) setOpenId(jobId);
  }, [searchParams]);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionsOpen]);

  async function updateJobStatus(id: string, status: JobPost["status"]) {
    const { error } = await createClient().from("job_posts").update({ status }).eq("id", id);
    if (!error) setJobs((current) => current.map((job) => job.id === id ? { ...job, status } : job));
  }

  async function updateApplication(jobId: string, applicationId: string, status: string) {
    const { error } = await createClient().from("job_applications").update({ status }).eq("id", applicationId);
    if (!error) setJobs((current) => current.map((job) => job.id === jobId ? { ...job, applications: job.applications.map((item) => item.id === applicationId ? { ...item, status } : item) } : job));
  }

  return (
    <div className={embedded ? "text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] px-4 py-6 text-[#162543] sm:px-6 sm:py-10"}>
      <div className={embedded ? "w-full" : "mx-auto max-w-4xl"}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {!embedded && (
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={backHref} aria-label="Volver al panel" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#162543] hover:bg-white">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-2xl font-bold">Mis empleos</h1>
              </div>
            )}
            <p className="text-sm text-[#65758c]">Administra vacantes y revisa postulaciones.</p>
          </div>
          <>
            <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:inline-flex"><Plus className="h-4 w-4" />Publicar</button>
            <Link href="/empleos/publicar?from=panel" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:hidden"><Plus className="h-4 w-4" />Publicar</Link>
          </>
        </div>
        <div className="space-y-3.5">
          {jobs.map((job) => {
            const isOpen = openId === job.id;
            return (
              <article key={job.id} className={cn("relative overflow-visible rounded-2xl border border-[#d9e6ef] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]", actionsOpen === job.id && "z-40")}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : job.id)} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-extrabold leading-tight text-[#111827] sm:text-base">{job.title}</h2>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#65758c]">
                      <span className="truncate">{EMPLOYMENT_TYPES[job.employment_type]}</span>
                      <span className="text-[#cbd5e1]">|</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-[#8ca0b8]" />{job.applications.length} {job.applications.length === 1 ? "postulación" : "postulaciones"}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusClass(job.status))}>{JOB_STATES[job.status]}</span>
                    <ChevronDown className={cn("h-5 w-5 text-[#6b7b90] transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#e6edf3] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    {job.description && <p className="mb-4 line-clamp-3 text-sm leading-6 text-[#52627a]">{job.description}</p>}
                    <div ref={actionsRef} className="relative mb-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2 sm:w-fit sm:grid-cols-[128px_128px_40px]">
                      <Link href={`/empleos/${job.id}?from=panel`} className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7e1ea] px-3 text-xs font-bold text-[#162543]">Ver empleo</Link>
                      <button type="button" onClick={() => setEditingJob(job)} className="hidden h-10 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">Editar</button>
                      <Link href={`/empleos/${job.id}/editar?from=panel`} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:hidden">Editar</Link>
                      <div className="relative">
                        <button type="button" onClick={() => setActionsOpen((current) => current === job.id ? null : job.id)} aria-label="Más opciones" aria-haspopup="menu" aria-expanded={actionsOpen === job.id} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d7e1ea] text-[#718096] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] hover:text-[#162543]"><MoreHorizontal className="h-5 w-5" /></button>
                        {actionsOpen === job.id && (
                          <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-xl border border-[#dfe8f0] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]">
                            {job.status !== "published" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateJobStatus(job.id, "published"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#008fc3] hover:bg-[#f0f9fc]">Publicar</button>}
                            {job.status === "published" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateJobStatus(job.id, "paused"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]">Pausar</button>}
                            {job.status !== "closed" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateJobStatus(job.id, "closed"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50">Cerrar vacante</button>}
                          </div>
                        )}
                      </div>
                    </div>
                    <h3 className="mb-3 text-sm font-bold">Postulaciones</h3>
                    <div className="space-y-3">
                      {job.applications.map((application) => (
                        <div key={application.id} className="border-b border-[#e6edf3] py-4 last:border-0">
                          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{application.applicant_name}</p><SelectMenu value={application.status} onChange={(status) => updateApplication(job.id, application.id, status)} options={Object.entries(APPLICATION_STATES).map(([value, label]) => ({ value, label }))} className="w-40" /></div>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#52627a]">{application.cover_letter}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-[#008fc3]">{application.applicant_email && <a href={`mailto:${application.applicant_email}`}>{application.applicant_email}</a>}{application.phone && <a href={`tel:${application.phone}`}>{application.phone}</a>}{application.resume_url && <a href={application.resume_url} target="_blank" rel="noreferrer">Ver CV</a>}{application.portfolio_url && <a href={application.portfolio_url} target="_blank" rel="noreferrer">Ver portafolio</a>}</div>
                        </div>
                      ))}
                      {job.applications.length === 0 && <p className="rounded-xl bg-[#f6f9fb] p-5 text-center text-sm text-[#68778d]">Aún no hay postulaciones.</p>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {jobs.length === 0 && <div className="rounded-2xl border border-[#dfe8f0] bg-white px-6 py-14 text-center shadow-[0_2px_8px_rgba(15,23,42,0.05)]"><h2 className="font-bold">Todavía no has publicado empleos</h2><p className="mt-1 text-sm text-[#68778d]">Publica tu primera oportunidad laboral.</p></div>}
        </div>
      </div>
      {publishOpen && professionalId && (
        <Modal onClose={() => setPublishOpen(false)} title="Publicar empleo" subtitle="Describe la oportunidad con información clara y verificable." size="xl" bodyClassName="px-5 py-5 sm:px-6">
          <JobPostForm professionalId={professionalId} presentation="modal" backHref={backHref} onSaved={(id) => { setPublishOpen(false); onRefresh?.(); router.push(`/empleos/${id}?from=panel`); }} />
        </Modal>
      )}
      {editingJob && professionalId && (
        <Modal onClose={() => setEditingJob(null)} title="Editar empleo" subtitle="Actualiza la información de esta publicación." size="xl" bodyClassName="px-5 py-5 sm:px-6">
          <JobPostForm key={editingJob.id} professionalId={professionalId} initialJob={editingJob} presentation="modal" backHref={backHref} onSaved={() => { setEditingJob(null); onRefresh?.(); router.refresh(); }} />
        </Modal>
      )}
    </div>
  );
}
