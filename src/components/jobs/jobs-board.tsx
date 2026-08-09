"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BriefcaseBusiness, Building2, Menu } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { Modal } from "@/components/ui/modal";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { JobApplicationForm } from "@/components/jobs/job-application-form";
import { SaveItemButton } from "@/components/saved/save-item-button";
import { COMMON_JOB_TITLES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, formatJobSalary, jobMatchesSearch, type JobPost, WORKPLACE_TYPES } from "@/lib/jobs";

type Props = {
  jobs: JobPost[];
  canPost: boolean;
  initialSelectedJobId?: string | null;
  currentProfessionalId?: string | null;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  currentUserPhone?: string | null;
  currentUserLinkedIn?: string | null;
  appliedJobIds?: string[];
};

const MARKETPLACE_LIST_CLASS = "ccr-marketplace-result-list min-w-0 overflow-y-auto bg-white lg:max-h-[calc(100vh-190px)] lg:border-r lg:border-[#dfe6ec]";

function relativeDate(value: string) {
  const createdAt = new Date(value).getTime();
  const elapsed = Math.max(0, Date.now() - createdAt);
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(elapsed / 3_600_000);
  const days = Math.floor(elapsed / 86_400_000);
  if (minutes < 1) return "Ahora";
  if (hours < 1) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours} h`;
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

function jobLocationText(job: JobPost) {
  if (job.workplace_type === "remote") return "Costa Rica (Remoto)";
  return job.location_label || "Costa Rica";
}

function jobApplicantsText(job: JobPost) {
  const count = Math.max(0, Number(job.application_count ?? 0));
  if (count === 0) return "Sin postulantes";
  return `${count} ${count === 1 ? "postulante" : "postulantes"}`;
}

function JobMetaLine({ job, className = "", showApplicants = true }: { job: JobPost; className?: string; showApplicants?: boolean }) {
  return <p className={className}>
    <span>{jobLocationText(job)}</span>
    <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
    <span>{relativeDate(job.created_at)}</span>
    {showApplicants && <>
      <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
      <span>{jobApplicantsText(job)}</span>
    </>}
  </p>;
}

export function JobsBoard({ jobs, canPost, initialSelectedJobId = null, currentProfessionalId = null, currentUserId = null, currentUserEmail = null, currentUserPhone = null, currentUserLinkedIn = null, appliedJobIds = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPost | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [submittedJobIds, setSubmittedJobIds] = useState(() => new Set(appliedJobIds));
  const initialLocation = searchParams.get("location")?.trim().toLocaleLowerCase("es-CR") ?? "";
  const [workplace, setWorkplace] = useState("all");
  const [employment, setEmployment] = useState("all");
  const [experience, setExperience] = useState("all");
  const [published, setPublished] = useState("all");
  const [selectedId, setSelectedId] = useState(() => searchParams.get("job") ?? searchParams.get("apply") ?? initialSelectedJobId ?? jobs[0]?.id ?? "");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cleanQuery = query.trim();
    if (cleanQuery) params.set("q", cleanQuery);
    else params.delete("q");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [query]);

  useEffect(() => {
    const applyId = searchParams.get("apply");
    if (!applyId) return;
    setSelectedId(applyId);
    if (currentUserId) setApplyingJobId(applyId);
  }, [currentUserId, searchParams]);

  const filtered = useMemo(() => jobs.filter((job) => {
    const matchesQuery = jobMatchesSearch(query, [job.title, job.employer_name, job.location_label, job.description, ...(job.requirements ?? []), ...(job.responsibilities ?? [])]);
    const age = Date.now() - new Date(job.created_at).getTime();
    const matchesDate = published === "all" || age <= Number(published) * 86_400_000;
    const matchesLocation = !initialLocation || job.workplace_type === "remote" || job.location_label?.toLocaleLowerCase("es-CR").includes(initialLocation);
    return matchesQuery && matchesLocation && matchesDate
      && (workplace === "all" || job.workplace_type === workplace)
      && (employment === "all" || job.employment_type === employment)
      && (experience === "all" || (job.experience_level ?? "any") === experience);
  }), [employment, experience, initialLocation, jobs, published, query, workplace]);

  const selected = filtered.find((job) => job.id === selectedId) ?? filtered[0] ?? null;
  const suggestions = [...new Set([...jobs.map((job) => job.title), ...COMMON_JOB_TITLES])];

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((job) => job.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const renderSearch = () => (
    <MarketplaceSearch value={query} onChange={setQuery} placeholder="¿Qué empleo estás buscando?" suggestions={suggestions} recentStorageKey="ccr-job-search-recents" />
  );
  const renderFilters = () => (
    <>
      <MarketplaceFilterChip label="Publicado" value={published} onChange={setPublished} options={[["all", "Cualquier fecha"], ["1", "Últimas 24 horas"], ["7", "Última semana"], ["30", "Último mes"]]} />
      <MarketplaceFilterChip label="Modalidad" value={workplace} onChange={setWorkplace} options={[["all", "Cualquier modalidad"], ...Object.entries(WORKPLACE_TYPES)]} />
      <MarketplaceFilterChip label="Experiencia" value={experience} onChange={setExperience} options={[["all", "Cualquier experiencia"], ...Object.entries(EXPERIENCE_LEVELS)]} />
      <MarketplaceFilterChip label="Tipo de empleo" value={employment} onChange={setEmployment} options={[["all", "Cualquier tipo"], ...Object.entries(EMPLOYMENT_TYPES)]} />
    </>
  );
  const renderActions = () => (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      {canPost && (
        <Link href="/dashboard/profesional?mode=offer&tab=jobs&returnTo=%2Fempleos" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-[#cddae6] bg-white px-5 text-sm font-bold text-[#162543] transition hover:border-[#b7c8d9] hover:bg-[#f8fafc] sm:flex-none">
          Mis empleos
        </Link>
      )}
      {canPost ? (
        <>
          <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:inline-flex">
            Publicar empleo
          </button>
          <Link href="/empleos/publicar" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:hidden">
            Publicar empleo
          </Link>
        </>
      ) : (
        <Link href="/login?redirect=/empleos/publicar" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none">
          Publicar empleo
        </Link>
      )}
    </div>
  );

  return <main className="min-h-[calc(100vh-72px)] overflow-x-hidden bg-white pb-16 text-[#162543] lg:bg-[#f4f7fa]">
    <section className="sticky top-0 z-20 border-b border-[#d5d8dc] bg-white lg:hidden">
      <div className="px-0">
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <button type="button" onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} aria-label="Abrir menú" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543] transition hover:bg-[#eef5f9]">
            <Menu className="h-7 w-7" strokeWidth={2.5} />
          </button>
          <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">Empleos</h1>
        </div>
        <div className="px-4 pb-3">{renderSearch()}</div>
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-4">{renderFilters()}</div>
      </div>
    </section>
    <MarketplaceNavbarPortal>
      <section className="hidden h-full bg-transparent lg:block">
        <div className="flex h-full w-full items-center py-2"><div className="w-full">{renderSearch()}</div></div>
      </section>
    </MarketplaceNavbarPortal>
    <div className="mx-auto flex max-w-7xl justify-end px-4 py-3 sm:px-6 lg:hidden">{renderActions()}</div>
    <div className="mx-auto hidden max-w-7xl items-end justify-between gap-4 px-6 pt-3 lg:flex">
      <div><h1 className="text-2xl font-extrabold">Empleos</h1><p className="text-sm text-[#68778d]">Oportunidades en Costa Rica</p></div>
      <div className="flex shrink-0 gap-2">{renderActions()}</div>
    </div>
    <div className="relative z-30 mx-auto hidden max-w-7xl px-6 pt-3 lg:block"><div className="flex flex-wrap items-center gap-2 overflow-visible">{renderFilters()}</div></div>
    <div className="mx-auto max-w-7xl px-0 py-0 sm:px-6 sm:py-5 lg:pt-3">
      <div className="lg:grid lg:max-h-[calc(100vh-190px)] lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] lg:overflow-hidden lg:rounded-lg lg:border lg:border-[#dfe8f0] lg:bg-white">
        <section className={MARKETPLACE_LIST_CLASS}>
          <div className="border-b border-[#e7edf2] px-4 py-3"><p className="font-bold">{filtered.length} {filtered.length === 1 ? "empleo" : "empleos"}</p><p className="text-xs text-[#68778d]">Costa Rica</p></div>
          <div>
            {filtered.map((job) => <JobRow key={job.id} job={job} selected={selected?.id === job.id} onSelect={() => setSelectedId(job.id)} />)}
            {filtered.length === 0 && <div className="px-6 py-16 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-[#9aabc0]" /><h2 className="mt-3 font-bold">No encontramos empleos</h2><p className="mt-1 text-sm text-[#68778d]">Prueba otra búsqueda o cambia los filtros.</p></div>}
          </div>
        </section>
        {selected && <JobPreview job={selected} isOwner={selected.employer_id === currentProfessionalId} userId={currentUserId} hasApplied={submittedJobIds.has(selected.id)} onApply={() => setApplyingJobId(selected.id)} onEdit={() => setEditingJob(selected)} />}
      </div>
    </div>
    {publishOpen && currentProfessionalId && (
      <Modal onClose={() => setPublishOpen(false)} title="Publicar empleo" subtitle="Describe la oportunidad con información clara y verificable." size="lg" bodyClassName="px-5 py-5 sm:px-6">
        <JobPostForm professionalId={currentProfessionalId} presentation="modal" backHref="/empleos" onSaved={(id) => { setPublishOpen(false); router.push(`/empleos/${id}`); }} />
      </Modal>
    )}
    {editingJob && currentProfessionalId && (
      <Modal onClose={() => setEditingJob(null)} title="Editar empleo" subtitle="Actualiza la información de esta publicación." size="lg" bodyClassName="px-5 py-5 sm:px-6">
        <JobPostForm
          professionalId={currentProfessionalId}
          initialJob={editingJob}
          presentation="modal"
          backHref={`/empleos/${editingJob.id}`}
          onSaved={() => {
            setEditingJob(null);
            router.refresh();
          }}
        />
      </Modal>
    )}
    {applyingJobId && (
      <Modal onClose={() => setApplyingJobId(null)} title="Postularme" subtitle={jobs.find((job) => job.id === applyingJobId)?.title ?? "Enviar postulación"} size="md" mobilePresentation="fullscreen" bodyClassName="px-5 py-5 sm:px-6">
        <JobApplicationForm
          jobId={applyingJobId}
          userId={currentUserId}
          hasApplied={submittedJobIds.has(applyingJobId)}
          isOwner={jobs.find((job) => job.id === applyingJobId)?.employer_id === currentProfessionalId}
          initialEmail={currentUserEmail}
          initialPhone={currentUserPhone}
          initialLinkedIn={currentUserLinkedIn}
          loginRedirect={`/empleos?apply=${applyingJobId}`}
          onSubmitted={() => setSubmittedJobIds((current) => new Set([...current, applyingJobId]))}
        />
      </Modal>
    )}
  </main>;
}

function jobSaveSnapshot(job: JobPost) {
  return {
    title: job.title,
    employer_name: job.employer_name,
    employer_slug: job.employer_slug,
    employer_avatar_url: job.employer_avatar_url,
    location_label: jobLocationText(job),
    salary: formatJobSalary(job),
    workplace_type: job.workplace_type,
    employment_type: job.employment_type,
    created_at: job.created_at,
  };
}

function JobRow({ job, selected, onSelect }: { job: JobPost; selected: boolean; onSelect: () => void }) {
  return <article className={`relative overflow-hidden border-b border-[#dfe6ec] bg-white px-4 py-3 transition last:border-b-0 hover:bg-[#f8fafc] ${selected ? "lg:bg-[#eef9fd] shadow-[inset_4px_0_0_#162543]" : ""}`}>
    <button type="button" onClick={onSelect} aria-label={`Ver ${job.title}`} className="absolute inset-0 hidden lg:block" />
    <button type="button" onClick={onSelect} className="relative z-[1] block w-full text-left">
      <div className="flex min-w-0 items-start gap-3">
        <EmployerAvatar job={job} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[15px] font-extrabold leading-tight text-[#005eaa] lg:text-base">{job.title}</h2>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#101d35]">{job.employer_name || "Profesional en ContrataCR"}</p>
          <JobMetaLine job={job} showApplicants={false} className="mt-0.5 truncate text-sm text-[#52627a]" />
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-medium text-[#60708a]"><span>{WORKPLACE_TYPES[job.workplace_type]}</span><span aria-hidden="true" className="text-[#9aa8b8]">&middot;</span><span>{EXPERIENCE_LEVELS[job.experience_level ?? "any"]}</span></div>
          <div className="mt-0.5 truncate text-xs font-bold text-[#008fc3]">{formatJobSalary(job)}</div>
        </div>
      </div>
    </button>
  </article>;
}

function JobPreview({ job, isOwner, userId, hasApplied, onApply, onEdit }: { job: JobPost; isOwner: boolean; userId: string | null; hasApplied: boolean; onApply: () => void; onEdit: () => void }) {
  const detailRows = [
    ["Tipo de empleo", EMPLOYMENT_TYPES[job.employment_type]],
    ["Modalidad", WORKPLACE_TYPES[job.workplace_type]],
    ["Experiencia mínima", EXPERIENCE_LEVELS[job.experience_level ?? "any"]],
    ["Ubicación", job.workplace_type === "remote" ? "Todo Costa Rica" : job.location_label],
    ["Vacantes", `${job.openings || 1} ${job.openings === 1 ? "vacante" : "vacantes"}`],
    ...(job.duration_label ? [["Duración", job.duration_label] as [string, string]] : []),
  ].filter(([, value]) => Boolean(value));

  return <article className="ccr-marketplace-result-list hidden min-w-0 bg-white p-7 lg:block lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto">
    <div className="flex items-start gap-4"><EmployerAvatar job={job} size="large" /><div className="min-w-0"><h2 className="text-2xl font-extrabold leading-tight">{job.title}</h2><p className="mt-1 font-semibold text-[#52627a]">{job.employer_name}</p><JobMetaLine job={job} className="mt-1 text-sm text-[#68778d]" /></div></div>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {isOwner ? (
        <>
          <button type="button" onClick={onEdit} className="inline-flex h-11 items-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3]">Editar empleo</button>
          <Link href="/dashboard/profesional?mode=offer&tab=jobs" className="inline-flex h-11 items-center rounded-lg border border-[#b9d9e8] px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">Administrar este empleo</Link>
        </>
      ) : userId ? (
        <button type="button" onClick={onApply} disabled={hasApplied} className="inline-flex h-11 w-[132px] items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] disabled:bg-[#cbd5e1]">{hasApplied ? "Postulación enviada" : "Postularme"}</button>
      ) : (
        <Link href={`/login?redirect=${encodeURIComponent(`/empleos?apply=${job.id}`)}`} className="inline-flex h-11 w-[132px] items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3]">Postularme</Link>
      )}
      {!isOwner && <SaveItemButton itemType="job" itemId={job.id} snapshot={jobSaveSnapshot(job)} userId={userId} loginRedirect={`/empleos/${job.id}`} withLabel className="h-11 w-[132px] px-4" />}
      <p className="font-extrabold text-[#007fae]">{formatJobSalary(job)}</p>
    </div>
    <dl className="mt-6 grid gap-3 border-y border-[#e7edf2] py-5 text-sm sm:grid-cols-2">{detailRows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{label}</dt><dd className="mt-0.5 break-words font-bold text-[#162543] [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
    <section className="mt-7"><h3 className="text-lg font-bold">Sobre el empleo</h3><p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">{job.description}</p></section>
    {[ ["Responsabilidades", job.responsibilities], ["Requisitos", job.requirements], ["Beneficios", job.benefits] ].map(([title, items]) => Array.isArray(items) && items.length > 0 ? <section key={String(title)} className="mt-7"><h3 className="text-lg font-bold">{String(title)}</h3><ol className="mt-3 space-y-2.5 text-sm text-[#43536b]">{items.map((item, index) => <li key={`${title}-${item}-${index}`} className="flex min-w-0 gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef7fb] text-[11px] font-extrabold leading-none text-[#008fc3]">{index + 1}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span></li>)}</ol></section> : null)}
  </article>;
}

function EmployerAvatar({ job, size = "default" }: { job: JobPost; size?: "default" | "large" }) {
  const dimensions = size === "large" ? "h-14 w-14" : "h-11 w-11";
  if (job.employer_avatar_url) return <img src={job.employer_avatar_url} alt={`Foto de ${job.employer_name || "profesional"}`} className={`${dimensions} shrink-0 rounded-full object-cover`} />;
  return <span className={`grid ${dimensions} shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]`}><Building2 className={size === "large" ? "h-6 w-6" : "h-5 w-5"} /></span>;
}
