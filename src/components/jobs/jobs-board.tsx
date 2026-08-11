"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { ArrowLeft, BriefcaseBusiness, Building2, Menu } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { Modal } from "@/components/ui/modal";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { JobApplicationForm } from "@/components/jobs/job-application-form";
import { SaveItemButton } from "@/components/saved/save-item-button";
import { COMMON_JOB_TITLES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, formatJobSalary, jobMatchesSearch, type JobPost, WORKPLACE_TYPES } from "@/lib/jobs";
import { employmentTypeLabel, experienceLevelLabel, marketplaceLocale, type MarketplaceLocale, workplaceTypeLabel } from "@/lib/marketplace-copy";
import { marketplaceReturnLabel, safeMarketplaceReturnHref } from "@/lib/navigation/marketplace-return";

type Props = {
  jobs: JobPost[];
  canPost: boolean;
  initialSelectedJobId?: string | null;
  returnTo?: string | null;
  currentProfessionalId?: string | null;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  currentUserPhone?: string | null;
  currentUserLinkedIn?: string | null;
  appliedJobIds?: string[];
  detailOnly?: boolean;
};

const MARKETPLACE_LIST_CLASS = "ccr-marketplace-card-list min-w-0 bg-white lg:h-[calc(100dvh-190px)] lg:min-h-[420px] lg:overflow-y-scroll lg:border-r lg:border-[#dfe6ec]";

const JOBS_COPY = {
  es: {
    now: "Ahora", minute: (count: number) => `Hace ${count} min`, hour: (count: number) => `Hace ${count} h`, yesterday: "Ayer", days: (count: number) => `Hace ${count} días`,
    remoteCountry: "Costa Rica (Remoto)", country: "Costa Rica", noApplicants: "Sin postulantes", applicant: "postulante", applicants: "postulantes",
    searchPlaceholder: "¿Qué empleo estás buscando?", published: "Publicado", anyDate: "Cualquier fecha", last24Hours: "Últimas 24 horas", lastWeek: "Última semana", lastMonth: "Último mes",
    workplace: "Modalidad", anyWorkplace: "Cualquier modalidad", experience: "Experiencia", anyExperience: "Cualquier experiencia", employmentType: "Tipo de empleo", anyEmploymentType: "Cualquier tipo",
    myJobs: "Mis empleos", publishJob: "Publicar empleo", jobs: "Empleos", opportunities: "Oportunidades en Costa Rica", job: "Empleo", openMenu: "Abrir menú",
    salary: "Salario", publishedBy: "Publicado por", editJob: "Editar empleo", manageJob: "Administrar empleo", applicationSent: "Postulación enviada", apply: "Postularme",
    noResults: "No encontramos empleos", noJobs: "Todavía no hay empleos", emptyHelp: "Prueba otra búsqueda o cambia los filtros.", futureJobs: "Las nuevas oportunidades laborales aparecerán aquí.", viewAll: "Ver todos los empleos", publishFirst: "Publicar el primer empleo", publishSubtitle: "Describe la oportunidad con información clara y verificable.", editSubtitle: "Actualiza la información de esta publicación.", sendApplication: "Enviar postulación",
    location: "Ubicación", wholeCountry: "Todo Costa Rica", openings: "Vacantes", opening: "vacante", openingPlural: "vacantes", duration: "Duración", about: "Sobre el empleo", responsibilities: "Responsabilidades", requirements: "Requisitos", benefits: "Beneficios",
    professionalFallback: "Profesional en ContrataCR", professionalPhoto: "Foto de profesional",
  },
  en: {
    now: "Now", minute: (count: number) => `${count} min ago`, hour: (count: number) => `${count} h ago`, yesterday: "Yesterday", days: (count: number) => `${count} days ago`,
    remoteCountry: "Costa Rica (Remote)", country: "Costa Rica", noApplicants: "No applicants", applicant: "applicant", applicants: "applicants",
    searchPlaceholder: "What job are you looking for?", published: "Posted", anyDate: "Any date", last24Hours: "Past 24 hours", lastWeek: "Past week", lastMonth: "Past month",
    workplace: "Workplace", anyWorkplace: "Any workplace", experience: "Experience", anyExperience: "Any experience", employmentType: "Job type", anyEmploymentType: "Any type",
    myJobs: "My jobs", publishJob: "Post a job", jobs: "Jobs", opportunities: "Opportunities in Costa Rica", job: "Job", openMenu: "Open menu",
    salary: "Salary", publishedBy: "Posted by", editJob: "Edit job", manageJob: "Manage job", applicationSent: "Application sent", apply: "Apply",
    noResults: "No jobs found", noJobs: "There are no jobs yet", emptyHelp: "Try another search or change the filters.", futureJobs: "New job opportunities will appear here.", viewAll: "View all jobs", publishFirst: "Post the first job", publishSubtitle: "Describe the opportunity with clear, verifiable information.", editSubtitle: "Update this job post.", sendApplication: "Submit application",
    location: "Location", wholeCountry: "All Costa Rica", openings: "Openings", opening: "opening", openingPlural: "openings", duration: "Duration", about: "About the job", responsibilities: "Responsibilities", requirements: "Requirements", benefits: "Benefits",
    professionalFallback: "Professional on ContrataCR", professionalPhoto: "Professional photo",
  },
} as const;

function relativeDate(value: string, locale: MarketplaceLocale) {
  const copy = JOBS_COPY[locale];
  const createdAt = new Date(value).getTime();
  const elapsed = Math.max(0, Date.now() - createdAt);
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(elapsed / 3_600_000);
  const days = Math.floor(elapsed / 86_400_000);
  if (minutes < 1) return copy.now;
  if (hours < 1) return copy.minute(minutes);
  if (hours < 24) return copy.hour(hours);
  if (days === 1) return copy.yesterday;
  return copy.days(days);
}

function jobLocationText(job: JobPost, locale: MarketplaceLocale) {
  if (job.workplace_type === "remote") return JOBS_COPY[locale].remoteCountry;
  return job.location_label || JOBS_COPY[locale].country;
}

function jobApplicantsText(job: JobPost, locale: MarketplaceLocale) {
  const copy = JOBS_COPY[locale];
  const count = Math.max(0, Number(job.application_count ?? 0));
  if (count === 0) return copy.noApplicants;
  return `${count} ${count === 1 ? copy.applicant : copy.applicants}`;
}

function JobMetaLine({ job, className = "", showApplicants = true }: { job: JobPost; className?: string; showApplicants?: boolean }) {
  const locale = marketplaceLocale(useLocale());
  return <p className={className}>
    <span>{jobLocationText(job, locale)}</span>
    <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
    <span>{relativeDate(job.created_at, locale)}</span>
    {showApplicants && <>
      <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
      <span>{jobApplicantsText(job, locale)}</span>
    </>}
  </p>;
}

export function JobsBoard({ jobs, canPost, initialSelectedJobId = null, returnTo = null, currentProfessionalId = null, currentUserId = null, currentUserEmail = null, currentUserPhone = null, currentUserLinkedIn = null, appliedJobIds = [], detailOnly = false }: Props) {
  const locale = marketplaceLocale(useLocale());
  const copy = JOBS_COPY[locale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPost | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [submittedJobIds, setSubmittedJobIds] = useState(() => new Set(appliedJobIds));
  const initialLocation = searchParams.get("location")?.trim() ?? "";
  const [locationFilter, setLocationFilter] = useState(initialLocation);
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
    const cleanLocation = locationFilter.trim();
    if (cleanLocation) params.set("location", cleanLocation);
    else params.delete("location");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [locationFilter, query]);

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
    const matchesLocation = !locationFilter || job.workplace_type === "remote" || job.location_label?.toLocaleLowerCase("es-CR").includes(locationFilter.toLocaleLowerCase("es-CR"));
    return matchesQuery && matchesLocation && matchesDate
      && (workplace === "all" || job.workplace_type === workplace)
      && (employment === "all" || job.employment_type === employment)
      && (experience === "all" || (job.experience_level ?? "any") === experience);
  }), [employment, experience, jobs, locationFilter, published, query, workplace]);

  const selected = filtered.find((job) => job.id === selectedId) ?? filtered[0] ?? null;
  const suggestions = [...new Set([...jobs.map((job) => job.title), ...COMMON_JOB_TITLES])];
  const locationSuggestions = useMemo(
    () => [...new Set(jobs.map((job) => job.location_label?.trim()).filter((value): value is string => Boolean(value)))],
    [jobs],
  );
  const hasActiveFilters =
    Boolean(query.trim()) ||
    Boolean(locationFilter) ||
    workplace !== "all" ||
    employment !== "all" ||
    experience !== "all" ||
    published !== "all";

  function clearSearchAndFilters() {
    setQuery("");
    setWorkplace("all");
    setEmployment("all");
    setExperience("all");
    setPublished("all");
    setLocationFilter("");
    const params = new URLSearchParams(window.location.search);
    params.delete("location");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((job) => job.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const renderSearch = () => (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      placeholder={copy.searchPlaceholder}
      suggestions={suggestions}
      recentStorageKey="ccr-job-search-recents"
      secondary={{
        value: locationFilter,
        onChange: setLocationFilter,
        placeholder: copy.location,
        ariaLabel: copy.location,
        suggestions: locationSuggestions,
        icon: "location",
        clearLabel: locale === "en" ? "Clear location" : "Limpiar ubicación",
      }}
    />
  );
  const renderFilters = () => (
    <>
      <MarketplaceFilterChip label={copy.published} value={published} onChange={setPublished} options={[["all", copy.anyDate], ["1", copy.last24Hours], ["7", copy.lastWeek], ["30", copy.lastMonth]]} />
      <MarketplaceFilterChip label={copy.workplace} value={workplace} onChange={setWorkplace} options={[["all", copy.anyWorkplace], ...Object.keys(WORKPLACE_TYPES).map((value) => [value, workplaceTypeLabel(value as keyof typeof WORKPLACE_TYPES, locale)] as [string, string])]} />
      <MarketplaceFilterChip label={copy.experience} value={experience} onChange={setExperience} options={[["all", copy.anyExperience], ...Object.keys(EXPERIENCE_LEVELS).map((value) => [value, experienceLevelLabel(value as keyof typeof EXPERIENCE_LEVELS, locale)] as [string, string])]} />
      <MarketplaceFilterChip label={copy.employmentType} value={employment} onChange={setEmployment} options={[["all", copy.anyEmploymentType], ...Object.keys(EMPLOYMENT_TYPES).map((value) => [value, employmentTypeLabel(value as keyof typeof EMPLOYMENT_TYPES, locale)] as [string, string])]} />
    </>
  );
  const renderActions = () => (
    <div className={canPost ? "grid w-full grid-cols-2 gap-2 sm:w-[296px] [&>*]:w-full" : "flex w-full sm:w-auto"}>
      {canPost && (
        <Link href="/dashboard/profesional?mode=offer&tab=jobs&returnTo=%2Fempleos" className="inline-flex h-[42px] items-center justify-center rounded-lg border border-[#cddae6] bg-white px-4 text-sm font-bold text-[#162543] transition hover:border-[#9fb6ca] hover:bg-[#f4f8fb]">
          {copy.myJobs}
        </Link>
      )}
      {canPost ? (
        <>
          <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-[42px] items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">
            {copy.publishJob}
          </button>
          <Link href="/empleos/publicar" className="inline-flex h-[42px] items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden">
            {copy.publishJob}
          </Link>
        </>
      ) : (
        <Link href="/login?redirect=/empleos/publicar" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none">
          {copy.publishJob}
        </Link>
      )}
    </div>
  );

  const showingMobileDetail = Boolean(initialSelectedJobId && selected);
  const detailBackHref = safeMarketplaceReturnHref(returnTo, "/empleos");
  const detailBackLabel = marketplaceReturnLabel(detailBackHref, "/empleos", locale);

  return <main className="min-h-[calc(100vh-72px)] overflow-x-hidden bg-white pb-16 text-[#162543] lg:bg-[#f4f7fa]">
    {showingMobileDetail && selected && (
      <section className="lg:hidden">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-center border-b border-[#dfe6ec] bg-white px-14">
          <Link
            href={detailBackHref}
            aria-label={detailBackLabel}
            className="absolute left-3 grid h-10 w-10 place-items-center text-[#162543] transition hover:bg-[#eef5f9]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-center text-lg font-extrabold">{copy.job}</h1>
        </header>
        <JobPreview
          job={selected}
          isOwner={selected.employer_id === currentProfessionalId}
          userId={currentUserId}
          hasApplied={submittedJobIds.has(selected.id)}
          onApply={() => setApplyingJobId(selected.id)}
          onEdit={() => setEditingJob(selected)}
          mobile
        />
      </section>
    )}
    <section className={`${showingMobileDetail ? "hidden " : ""}sticky top-0 z-20 border-b border-[#d5d8dc] bg-white lg:hidden`}>
      <div className="px-0">
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <button type="button" onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} aria-label={copy.openMenu} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543] transition hover:bg-[#eef5f9]">
            <Menu className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">{copy.jobs}</h1>
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
    <div className={`${showingMobileDetail ? "hidden " : ""}mx-auto max-w-7xl justify-end px-4 py-3 sm:px-6 lg:hidden flex`}>{renderActions()}</div>
    {!detailOnly && <div className="mx-auto hidden max-w-7xl items-end justify-between gap-4 px-6 pt-3 lg:flex">
      <div>
        <h1 className="text-2xl font-extrabold">{copy.jobs}</h1>
        <p className="text-sm text-[#68778d]">{copy.opportunities}</p>
      </div>
      <div className="flex shrink-0 gap-2">{renderActions()}</div>
    </div>}
    {!detailOnly && <div className="relative z-30 mx-auto hidden max-w-7xl px-6 pt-3 lg:block"><div className="flex flex-wrap items-center gap-2 overflow-visible">{renderFilters()}</div></div>}
    {detailOnly && selected && (
      <div className="mx-auto hidden w-full max-w-6xl px-6 pb-8 pt-5 lg:block">
        <Link href={detailBackHref} className="mb-3 inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-extrabold text-[#008fc3] transition hover:bg-[#eaf7fc] hover:text-[#00749f]">
          <ArrowLeft className="h-4 w-4 stroke-[2.4]" />
          {detailBackLabel}
        </Link>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,760px)_320px] lg:justify-center">
          <div className="overflow-hidden rounded-lg border border-[#dfe8f0] bg-white">
            <JobPreview job={selected} isOwner={selected.employer_id === currentProfessionalId} userId={currentUserId} hasApplied={submittedJobIds.has(selected.id)} onApply={() => setApplyingJobId(selected.id)} onEdit={() => setEditingJob(selected)} hideActions />
          </div>
          <aside className="h-fit self-start rounded-lg border border-[#dfe8f0] bg-white p-5">
            <p className="text-xs font-bold uppercase text-[#7a899d]">{copy.salary}</p>
            <p className="mt-1 text-2xl font-extrabold text-[#007fae]">{formatJobSalary(selected, locale)}</p>
            <p className="mb-4 mt-4 border-y border-[#e8eef3] py-4 text-sm font-semibold text-[#52627a]">{copy.publishedBy} {selected.employer_name}</p>
            {selected.employer_id === currentProfessionalId ? (
              <div className="space-y-3">
                <button type="button" onClick={() => setEditingJob(selected)} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3]">{copy.editJob}</button>
                <Link href={`/dashboard/profesional?mode=offer&tab=jobs&job=${selected.id}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#b9d9e8] px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">{copy.manageJob}</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {currentUserId ? (
                  <button type="button" onClick={() => setApplyingJobId(selected.id)} disabled={submittedJobIds.has(selected.id)} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] disabled:bg-[#cbd5e1]">{submittedJobIds.has(selected.id) ? copy.applicationSent : copy.apply}</button>
                ) : (
                  <Link href={`/login?redirect=${encodeURIComponent(`/empleos/${selected.id}?apply=${selected.id}`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3]">{copy.apply}</Link>
                )}
                <SaveItemButton itemType="job" itemId={selected.id} snapshot={jobSaveSnapshot(selected, locale)} userId={currentUserId} loginRedirect={`/empleos/${selected.id}`} withLabel className="h-11 w-full rounded-lg border-[#cddae6] bg-white text-[#162543] hover:bg-[#f8fafc]" />
              </div>
            )}
          </aside>
        </div>
      </div>
    )}
    {!detailOnly && <div className={`${showingMobileDetail ? "hidden lg:block " : ""}mx-auto max-w-7xl px-0 py-0 sm:px-6 sm:py-5 lg:pt-3`}>
      <div className={`${filtered.length > 0 ? "lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]" : ""} lg:max-h-[calc(100vh-190px)] lg:overflow-hidden lg:rounded-lg lg:border lg:border-[#dfe8f0] lg:bg-white`}>
        <section className={filtered.length > 0 ? MARKETPLACE_LIST_CLASS : "min-w-0 bg-white"}>
          <div className="border-b border-[#e7edf2] px-4 py-3"><p className="font-bold">{filtered.length} {filtered.length === 1 ? copy.job.toLocaleLowerCase(locale) : copy.jobs.toLocaleLowerCase(locale)}</p><p className="text-xs text-[#68778d]">{copy.country}</p></div>
          <div>
            {filtered.map((job) => <JobRow key={job.id} job={job} selected={selected?.id === job.id} onSelect={() => setSelectedId(job.id)} />)}
            {filtered.length === 0 && (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-7 py-12 text-center lg:min-h-[360px]">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]">
                  <BriefcaseBusiness className="h-6 w-6" strokeWidth={2} />
                </span>
                <h2 className="mt-4 text-lg font-extrabold text-[#162543]">
                  {hasActiveFilters ? copy.noResults : copy.noJobs}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#68778d]">
                  {hasActiveFilters ? copy.emptyHelp : copy.futureJobs}
                </p>
                {hasActiveFilters ? (
                  <button type="button" onClick={clearSearchAndFilters} className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">
                    {copy.viewAll}
                  </button>
                ) : canPost ? (
                  <>
                    <button type="button" onClick={() => setPublishOpen(true)} className="mt-5 hidden h-10 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">
                      {copy.publishFirst}
                    </button>
                    <Link href="/empleos/publicar" className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden">
                      {copy.publishFirst}
                    </Link>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </section>
        {selected && <JobPreview job={selected} isOwner={selected.employer_id === currentProfessionalId} userId={currentUserId} hasApplied={submittedJobIds.has(selected.id)} onApply={() => setApplyingJobId(selected.id)} onEdit={() => setEditingJob(selected)} />}
      </div>
    </div>}
    {publishOpen && currentProfessionalId && (
      <Modal onClose={() => setPublishOpen(false)} title={copy.publishJob} subtitle={copy.publishSubtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
        <JobPostForm
          professionalId={currentProfessionalId}
          presentation="modal"
          backHref="/empleos"
          onSaved={(id) => {
            setSelectedId(id);
            setPublishOpen(false);
            router.push(`/empleos/${id}`);
            router.refresh();
          }}
        />
      </Modal>
    )}
    {editingJob && currentProfessionalId && (
      <Modal onClose={() => setEditingJob(null)} title={copy.editJob} subtitle={copy.editSubtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
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
      <Modal onClose={() => setApplyingJobId(null)} title={copy.apply} subtitle={jobs.find((job) => job.id === applyingJobId)?.title ?? copy.sendApplication} size="md" mobilePresentation="fullscreen" bodyClassName="px-5 py-5 sm:px-6">
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
          onDismiss={() => setApplyingJobId(null)}
        />
      </Modal>
    )}
  </main>;
}

function jobSaveSnapshot(job: JobPost, locale: MarketplaceLocale) {
  return {
    title: job.title,
    employer_name: job.employer_name,
    employer_slug: job.employer_slug,
    employer_avatar_url: job.employer_avatar_url,
    location_label: jobLocationText(job, locale),
    salary: formatJobSalary(job, locale),
    workplace_type: job.workplace_type,
    employment_type: job.employment_type,
    created_at: job.created_at,
  };
}

function JobRow({ job, selected, onSelect }: { job: JobPost; selected: boolean; onSelect: () => void }) {
  const locale = marketplaceLocale(useLocale());
  const copy = JOBS_COPY[locale];
  return <article className={`relative h-36 overflow-hidden border-b border-[#dfe6ec] bg-white px-4 py-3 transition last:border-b-0 hover:bg-[#f8fafc] ${selected ? "lg:bg-[#eef9fd] shadow-[inset_4px_0_0_#162543]" : ""}`}>
    <button type="button" onClick={onSelect} aria-label={`Ver ${job.title}`} className="absolute inset-0 hidden lg:block" />
    <Link href={`/empleos/${job.id}`} className="relative z-[1] block w-full text-left lg:pointer-events-none">
      <div className="flex min-w-0 items-start gap-3">
        <EmployerAvatar job={job} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[15px] font-extrabold leading-tight text-[#005eaa] lg:text-base">{job.title}</h2>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#101d35]">{job.employer_name || copy.professionalFallback}</p>
          <JobMetaLine job={job} showApplicants={false} className="mt-0.5 truncate text-sm text-[#52627a]" />
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-medium text-[#60708a]"><span>{workplaceTypeLabel(job.workplace_type, locale)}</span><span aria-hidden="true" className="text-[#9aa8b8]">&middot;</span><span>{experienceLevelLabel(job.experience_level ?? "any", locale)}</span></div>
          <div className="mt-0.5 truncate text-xs font-bold text-[#008fc3]">{formatJobSalary(job, locale)}</div>
        </div>
      </div>
    </Link>
  </article>;
}

function JobPreview({ job, isOwner, userId, hasApplied, onApply, onEdit, mobile = false, hideActions = false }: { job: JobPost; isOwner: boolean; userId: string | null; hasApplied: boolean; onApply: () => void; onEdit: () => void; mobile?: boolean; hideActions?: boolean }) {
  const locale = marketplaceLocale(useLocale());
  const copy = JOBS_COPY[locale];
  const detailRows = [
    [copy.employmentType, employmentTypeLabel(job.employment_type, locale)],
    [copy.workplace, workplaceTypeLabel(job.workplace_type, locale)],
    [copy.experience, experienceLevelLabel(job.experience_level ?? "any", locale)],
    [copy.location, job.workplace_type === "remote" ? copy.wholeCountry : job.location_label],
    [copy.openings, `${job.openings || 1} ${job.openings === 1 ? copy.opening : copy.openingPlural}`],
    ...(job.duration_label ? [[copy.duration, job.duration_label] as [string, string]] : []),
  ].filter(([, value]) => Boolean(value));

  return <article className={`ccr-marketplace-result-list min-w-0 bg-white ${mobile ? "block px-5 py-6" : "hidden p-7 lg:block lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto"}`}>
    <div className="flex items-start gap-4"><EmployerAvatar job={job} size="large" /><div className="min-w-0"><h2 className="text-2xl font-extrabold leading-tight">{job.title}</h2><p className="mt-1 font-semibold text-[#52627a]">{job.employer_name}</p><JobMetaLine job={job} className="mt-1 text-sm text-[#68778d]" /><p className="mt-2 text-base font-extrabold text-[#007fae]">{formatJobSalary(job, locale)}</p></div></div>
    {!hideActions && <div className={mobile ? "mt-5 grid grid-cols-2 gap-3" : "mt-5 flex flex-wrap items-center gap-3"}>
      {isOwner ? (
        <>
          <button type="button" onClick={onEdit} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3]">{copy.editJob}</button>
          <Link href={`/dashboard/profesional?mode=offer&tab=jobs&job=${job.id}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#b9d9e8] px-4 text-center text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">{copy.manageJob}</Link>
        </>
      ) : userId ? (
        <button type="button" onClick={onApply} disabled={hasApplied} className="inline-flex h-11 w-full items-center justify-center overflow-visible whitespace-nowrap rounded-lg bg-[#009fd9] px-4 pt-px text-sm font-bold leading-6 text-white transition hover:bg-[#008fc3] disabled:bg-[#cbd5e1] sm:w-[168px]">{hasApplied ? copy.applicationSent : copy.apply}</button>
      ) : (
        <Link href={`/login?redirect=${encodeURIComponent(`/empleos?apply=${job.id}`)}`} className="inline-flex h-11 w-full items-center justify-center overflow-visible whitespace-nowrap rounded-lg bg-[#009fd9] px-4 pt-px text-sm font-bold leading-6 text-white transition hover:bg-[#008fc3] sm:w-[168px]">{copy.apply}</Link>
      )}
      {!isOwner && <SaveItemButton itemType="job" itemId={job.id} snapshot={jobSaveSnapshot(job, locale)} userId={userId} loginRedirect={`/empleos/${job.id}`} withLabel className="h-11 w-full whitespace-nowrap rounded-lg border-[#e5e7eb] bg-white px-4 leading-6 text-[#374151] hover:border-[#e5e7eb] hover:bg-[#f9fafb] hover:text-[#374151] aria-pressed:border-[#e5e7eb] aria-pressed:bg-white aria-pressed:text-[#374151] aria-pressed:hover:border-[#e5e7eb] aria-pressed:hover:bg-[#f9fafb] aria-pressed:hover:text-[#374151] sm:w-[168px]" />}
    </div>}
    <dl className="mt-6 grid gap-3 border-y border-[#e7edf2] py-5 text-sm sm:grid-cols-2">{detailRows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{label}</dt><dd className="mt-0.5 break-words font-bold text-[#162543] [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
    <section className="mt-7"><h3 className="text-lg font-bold">{copy.about}</h3><p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">{job.description}</p></section>
    {[ [copy.responsibilities, job.responsibilities], [copy.requirements, job.requirements], [copy.benefits, job.benefits] ].map(([title, items]) => Array.isArray(items) && items.length > 0 ? <section key={String(title)} className="mt-7"><h3 className="text-lg font-bold">{String(title)}</h3><ol className="mt-3 space-y-2.5 text-sm text-[#43536b]">{items.map((item, index) => <li key={`${title}-${item}-${index}`} className="flex min-w-0 gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef7fb] text-[11px] font-extrabold leading-none text-[#008fc3]">{index + 1}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span></li>)}</ol></section> : null)}
  </article>;
}

function EmployerAvatar({ job, size = "default" }: { job: JobPost; size?: "default" | "large" }) {
  const locale = marketplaceLocale(useLocale());
  const dimensions = size === "large" ? "h-14 w-14" : "h-11 w-11";
  if (job.employer_avatar_url) return <img src={job.employer_avatar_url} alt={`${JOBS_COPY[locale].professionalPhoto}: ${job.employer_name || JOBS_COPY[locale].professionalFallback}`} className={`${dimensions} shrink-0 rounded-full object-cover`} />;
  return <span className={`grid ${dimensions} shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]`}><Building2 className={size === "large" ? "h-6 w-6" : "h-5 w-5"} /></span>;
}
