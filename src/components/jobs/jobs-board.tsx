"use client";

import { conFiltroDeFecha } from "@/lib/marketplace/filtros-por-volumen";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { cn } from "@/lib/utils";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";

import { useEffect, useMemo, useState } from "react";
import { cldThumb } from "@/lib/cloudinary";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, BriefcaseBusiness, Building2, Menu } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { recordRecentVisit } from "@/lib/recent-visits";
import { ContrataCRMark, HeaderAccountLink, HeaderMessagesLink, HeaderNotificationsLink } from "@/components/landing/landing-navbar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useDirectMessageUnread } from "@/hooks/use-direct-message-unread";
import { MarketplaceClearFilters, MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { Modal } from "@/components/ui/modal";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { SaveItemButton } from "@/components/saved/save-item-button";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { MenuEmpleo } from "@/components/jobs/menu-empleo";
import { enlaceEmpleo, idCoincide } from "@/lib/marketplace-url";
import { useNativeApp } from "@/hooks/use-native-app";
import { COMMON_JOB_TITLES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, formatJobSalary, jobMatchesSearch, type JobPost, WORKPLACE_TYPES } from "@/lib/jobs";
import { employmentTypeLabel, experienceLevelLabel, marketplaceLocale, type MarketplaceLocale, workplaceTypeLabel } from "@/lib/marketplace-copy";
import { marketplaceReturnLabelKey, safeMarketplaceReturnHref } from "@/lib/navigation/marketplace-return";
import { CABECERA_BOTON, CABECERA_FILA, CABECERA_FILA_CENTRADA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";
import { useAvisoPerfilProfesional } from "@/components/marketplace/use-aviso-perfil-profesional";

type Props = {
  jobs: JobPost[];
  canPost: boolean;
  initialSelectedJobId?: string | null;
  returnTo?: string | null;
  currentProfessionalId?: string | null;
  currentUserId?: string | null;
  detailOnly?: boolean;
};

// Sin línea de cierre abajo: la ponía para separar la lista blanca del lienzo
// gris, y el lienzo del teléfono ya es blanco, así que quedaba una raya suelta
// después de la última fila, sin nada debajo.
const MARKETPLACE_LIST_CLASS = "ccr-marketplace-card-list ccr-lista-tablero min-w-0 bg-white lg:h-full lg:overflow-y-scroll";

const JOBS_COPY = {
  es: {
    now: "Ahora", minute: (count: number) => `Hace ${count} min`, hour: (count: number) => `Hace ${count} h`, yesterday: "Ayer", days: (count: number) => `Hace ${count} días`,
    remoteCountry: "Todo Costa Rica", country: "Costa Rica", noApplicants: "Sin postulantes", applicant: "postulante", applicants: "postulantes",
    searchPlaceholder: "¿Qué empleo buscas?", published: "Fecha", anyDate: "Cualquier fecha", last24Hours: "Últimas 24 horas", lastWeek: "Última semana", lastMonth: "Último mes",
    workplace: "Modalidad", anyWorkplace: "Cualquier modalidad", experience: "Experiencia", anyExperience: "Cualquier experiencia", employmentType: "Tipo de empleo", anyEmploymentType: "Cualquier tipo",
    messages: "Mensajes",
    notifications: "Notificaciones",
    myJobs: "Mis empleos", publishJob: "Publicar empleo", jobs: "Empleos", opportunities: "Oportunidades en Costa Rica", job: "Empleo", openMenu: "Abrir menú", salary: "Salario", publishedBy: "Publicado por", editJob: "Editar empleo", editShort: "Editar", manageJob: "Administrar empleo", manageShort: "Administrar", applicationSent: "Postulación enviada", apply: "Postularme",
    noResults: "No encontramos empleos", noJobs: "Todavía no hay empleos", emptyHelp: "Prueba otra búsqueda o cambia los filtros.", futureJobs: "Las nuevas oportunidades laborales aparecerán aquí.", viewAll: "Ver todos los empleos", publishFirst: "Publicar el primer empleo", publishSubtitle: "Describe la oportunidad con información clara y verificable.", editSubtitle: "Actualiza la información de esta publicación.", sendApplication: "Enviar postulación",
    location: "Ubicación", wholeCountry: "Todo Costa Rica", openings: "Vacantes", opening: "vacante", openingPlural: "vacantes", duration: "Duración", about: "Sobre el empleo", responsibilities: "Responsabilidades", requirements: "Requisitos", benefits: "Beneficios",
    professionalFallback: "Profesional en ContrataCR", professionalPhoto: "Foto de profesional",
    call: "Llamar",
  },
  en: {
    now: "Now", minute: (count: number) => `${count} min ago`, hour: (count: number) => `${count} h ago`, yesterday: "Yesterday", days: (count: number) => `${count} days ago`,
    remoteCountry: "All Costa Rica", country: "Costa Rica", noApplicants: "No applicants", applicant: "applicant", applicants: "applicants",
    searchPlaceholder: "Search jobs", published: "Date posted", anyDate: "Any date", last24Hours: "Past 24 hours", lastWeek: "Past week", lastMonth: "Past month",
    workplace: "Workplace", anyWorkplace: "Any workplace", experience: "Experience", anyExperience: "Any experience", employmentType: "Job type", anyEmploymentType: "Any type",
    messages: "Messages",
    notifications: "Notifications",
    myJobs: "My jobs", publishJob: "Post a job", jobs: "Jobs", opportunities: "Opportunities in Costa Rica", job: "Job", openMenu: "Open menu", salary: "Salary", publishedBy: "Posted by", editJob: "Edit job", editShort: "Edit", manageJob: "Manage job", manageShort: "Manage", applicationSent: "Application sent", apply: "Apply",
    noResults: "No jobs found", noJobs: "There are no jobs yet", emptyHelp: "Try another search or change the filters.", futureJobs: "New job opportunities will appear here.", viewAll: "View all jobs", publishFirst: "Post the first job", publishSubtitle: "Describe the opportunity with clear, verifiable information.", editSubtitle: "Update this job post.", sendApplication: "Submit application",
    location: "Location", wholeCountry: "All Costa Rica", openings: "Openings", opening: "opening", openingPlural: "openings", duration: "Duration", about: "About the job", responsibilities: "Responsibilities", requirements: "Requirements", benefits: "Benefits",
    professionalFallback: "Professional on ContrataCR", professionalPhoto: "Professional photo",
    call: "Call",
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

// El conteo de postulantes salió de la vista pública. Ahora se aplica por
// WhatsApp, así que ese número se quedaba en «Sin postulantes» para siempre y
// lo único que decía —a quien busca trabajo— era que la vacante estaba muerta.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function JobMetaLine({ job, className = "", showApplicants = false }: { job: JobPost; className?: string; showApplicants?: boolean }) {
  const locale = marketplaceLocale(useLocale());
  return <p className={className}>
    <span>{jobLocationText(job, locale)}</span>
    <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
    <span>{relativeDate(job.created_at, locale)}</span>
    {showApplicants && <>
      <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
      {/* "1 postulante" no se parte en dos renglones: se lee como un dato. */}
      <span className="whitespace-nowrap">{jobApplicantsText(job, locale)}</span>
    </>}
  </p>;
}

export function JobsBoard({ jobs, canPost, initialSelectedJobId = null, returnTo = null, currentProfessionalId = null, currentUserId = null, detailOnly = false }: Props) {
  const { avisoNode, avisar } = useAvisoPerfilProfesional();
  const { cabeceraRef, conLinea } = useHairlineOnScroll();
  const locale = marketplaceLocale(useLocale());
  const mensajesSinLeer = useDirectMessageUnread();
  const copy = JOBS_COPY[locale];
  const nativeApp = useNativeApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPost | null>(null);
  const initialLocation = searchParams.get("location")?.trim() ?? "";
  const [locationFilter, setLocationFilter] = useState(initialLocation);
  // Los cuatro filtros del tablero, los mismos de producción. Se habían quitado
  // junto con los chips de servicio, que sí sobraban —el buscador ya encuentra
  // por oficio—; estos no: «remoto», «medio tiempo» o «de esta semana» no se
  // pueden escribir en un buscador.
  // Arrancan con lo que traiga la dirección: los filtros de la FICHA de un
  // empleo navegan a /empleos?workplace=remote…, y el tablero abría sin filtrar
  // porque solo leía «q» y «location». Un valor desconocido cuenta como «todos».
  const deLaUrl = (clave: string, validos: readonly string[]) => {
    const valor = searchParams.get(clave) ?? "all";
    return validos.includes(valor) ? valor : "all";
  };
  const [published, setPublished] = useState(() => deLaUrl("published", ["1", "7", "30"]));
  const [workplace, setWorkplace] = useState(() => deLaUrl("workplace", Object.keys(WORKPLACE_TYPES)));
  const [experience, setExperience] = useState(() => deLaUrl("experience", Object.keys(EXPERIENCE_LEVELS)));
  const [employment, setEmployment] = useState(() => deLaUrl("employment", Object.keys(EMPLOYMENT_TYPES)));
  const [ahora, setAhora] = useState(0);
  useEffect(() => { queueMicrotask(() => setAhora(Date.now())); }, []);
  const [selectedId, setSelectedId] = useState(() => searchParams.get("job") ?? searchParams.get("apply") ?? initialSelectedJobId ?? jobs[0]?.id ?? "");

  // Sin sesión, los avisos llevan a la pantalla de acceso y de ahí a su destino.
  const accesoHref = (destino: string) => `/login?redirect=${encodeURIComponent(`/${locale}${destino}`)}`;

  useEffect(() => {
    if (!nativeApp) return;
    console.info("[native-debug] jobs-board-mounted", {
      jobs: jobs.length,
      canPost,
      currentUserId: currentUserId ? "present" : "none",
      selectedId,
      apply: searchParams.get("apply"),
      href: window.location.href,
    });
  }, [canPost, currentUserId, jobs.length, nativeApp, searchParams, selectedId]);

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

  // Los enlaces viejos con ?apply= siguen abriendo el empleo; lo que ya no
  // existe es el formulario de postulación. Se responde por WhatsApp.
  useEffect(() => {
    const applyId = searchParams.get("apply");
    if (!applyId) return;
    queueMicrotask(() => setSelectedId(applyId));
  }, [searchParams]);

  const filtered = useMemo(() => jobs.filter((job) => {
    const matchesQuery = jobMatchesSearch(query, [job.title, job.employer_name, job.location_label, job.description, ...(job.requirements ?? []), ...(job.responsibilities ?? [])]);
    const matchesLocation = !locationFilter || job.workplace_type === "remote" || job.location_label?.toLocaleLowerCase("es-CR").includes(locationFilter.toLocaleLowerCase("es-CR"));
    const edad = ahora - new Date(job.created_at).getTime();
    const matchesDate = published === "all" || (ahora > 0 && edad <= Number(published) * 86_400_000);
    return matchesQuery && matchesLocation && matchesDate
      && (workplace === "all" || job.workplace_type === workplace)
      && (employment === "all" || job.employment_type === employment)
      && (experience === "all" || (job.experience_level ?? "any") === experience);
  }), [ahora, employment, experience, jobs, locationFilter, published, query, workplace]);

  // El enlace corto (…/empleos/tecnico-de-redes-d4000000) trae el título y los
  // 8 primeros del id: se resuelve igual que el enlace largo de siempre.
  const selected = filtered.find((job) => job.id === selectedId || idCoincide(job.id, selectedId)) ?? filtered[0] ?? null;

  const suggestions = [...new Set([...jobs.map((job) => job.title), ...COMMON_JOB_TITLES])];
  const locationSuggestions = useMemo(
    () => [...new Set(jobs.map((job) => job.location_label?.trim()).filter((value): value is string => Boolean(value)))],
    [jobs],
  );
  const hasActiveFilters = Boolean(query.trim()) || Boolean(locationFilter)
    || published !== "all" || workplace !== "all" || experience !== "all" || employment !== "all";

  function clearSearchAndFilters() {
    setQuery("");
    setLocationFilter("");
    setPublished("all");
    setWorkplace("all");
    setExperience("all");
    setEmployment("all");
    const params = new URLSearchParams(window.location.search);
    params.delete("location");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((job) => job.id === selectedId || idCoincide(job.id, selectedId))) {
      queueMicrotask(() => setSelectedId(filtered[0].id));
    }
  }, [filtered, selectedId]);

  const renderSearch = () => (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      placeholder={copy.searchPlaceholder}
      suggestions={suggestions}
      recentStorageKey="ccr-job-search-recents"
      visitSurface="empleos"
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
  // MODALIDAD, TIPO DE EMPLEO Y EXPERIENCIA SE QUEDAN SIEMPRE. No dependen del
  // volumen: son las tres preguntas que cualquiera se hace al buscar trabajo
  // —¿es remoto?, ¿es de tiempo completo?, ¿me piden experiencia?— y cambian la
  // decisión aunque haya cinco vacantes. La FECHA no: el tablero ya viene
  // ordenado por lo más reciente, así que filtrar por fecha solo quita; vuelve
  // cuando haya volumen de verdad.
  // La salida de los filtros vive en la línea del conteo (ver MarketplaceClearFilters).
  const limpiarFiltros = (
    <MarketplaceClearFilters
      conSeparador
      activos={[workplace, employment, experience, published].filter((value) => value !== "all").length}
      onClear={() => {
        setWorkplace("all");
        setEmployment("all");
        setExperience("all");
        setPublished("all");
      }}
    />
  );

  const renderFilters = () => (
    <>
      <MarketplaceFilterChip label={copy.workplace} value={workplace} onChange={setWorkplace} options={[["all", copy.anyWorkplace], ...Object.keys(WORKPLACE_TYPES).map((value) => [value, workplaceTypeLabel(value as keyof typeof WORKPLACE_TYPES, locale)] as [string, string])]} />
      <MarketplaceFilterChip label={copy.employmentType} value={employment} onChange={setEmployment} options={[["all", copy.anyEmploymentType], ...Object.keys(EMPLOYMENT_TYPES).map((value) => [value, employmentTypeLabel(value as keyof typeof EMPLOYMENT_TYPES, locale)] as [string, string])]} />
      <MarketplaceFilterChip label={copy.experience} value={experience} onChange={setExperience} options={[["all", copy.anyExperience], ...Object.keys(EXPERIENCE_LEVELS).map((value) => [value, experienceLevelLabel(value as keyof typeof EXPERIENCE_LEVELS, locale)] as [string, string])]} />
      {conFiltroDeFecha(jobs.length) && (
        <MarketplaceFilterChip label={copy.published} value={published} onChange={setPublished} options={[["all", copy.anyDate], ["1", copy.last24Hours], ["7", copy.lastWeek], ["30", copy.lastMonth]]} />
      )}
    </>
  );
  const renderActions = () => (
    <div className={canPost ? "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center [&>*]:w-full sm:[&>*]:w-auto" : "flex w-full sm:w-auto"}>
      {canPost && (
        <Link href="/dashboard/profesional?mode=offer&tab=jobs&returnTo=%2Fempleos" className="inline-flex h-9 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-3 text-[13px] font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] lg:h-11 lg:whitespace-nowrap lg:px-5 lg:text-sm">
          {copy.myJobs}
        </Link>
      )}
      {canPost ? (
        <>
          <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-11 items-center justify-center whitespace-nowrap rounded-full bg-[#009fd9] px-6 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">
            {copy.publishJob}
          </button>
          <Link href="/empleos/publicar" className="inline-flex h-9 items-center justify-center rounded-full bg-[#009fd9] px-3 text-[13px] font-bold text-white transition hover:bg-[#008fc3] lg:hidden">
            {copy.publishJob}
          </Link>
        </>
      ) : currentUserId ? (
        // Con sesión pero sin perfil profesional: no le falta una cuenta, le
        // falta el perfil. Mandarlo al login —como se hacía— era mandarlo a una
        // pantalla que ya pasó, sin decirle por qué no podía publicar.
        <button type="button" onClick={() => void avisar("empleo", "/empleos/publicar")} className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-[#009fd9] px-4 text-[13px] font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:h-10 lg:px-5 lg:text-sm">
          {copy.publishJob}
        </button>
      ) : (
        <Link href="/login?redirect=/empleos/publicar" className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-[#009fd9] px-4 text-[13px] font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:h-10 lg:px-5 lg:text-sm">
          {copy.publishJob}
        </Link>
      )}
    </div>
  );

  const showingMobileDetail = Boolean(initialSelectedJobId && selected);
  // Abrir un empleo lo deja en "vistos recientemente" del buscador.
  useEffect(() => {
    if (!showingMobileDetail || !selected) return;
    recordRecentVisit("empleos", {
      id: String(selected.id),
      titulo: selected.title,
      subtitulo: selected.employer_name ?? undefined,
      imagen: selected.employer_avatar_url ?? undefined,
      href: `/empleos/${selected.id}`,
    });
  }, [selected, showingMobileDetail]);
  const tSalida = useTranslations("marketplaceReturn");
  const detailBackHref = safeMarketplaceReturnHref(returnTo, "/empleos");
  const detailBackLabel = tSalida(marketplaceReturnLabelKey(detailBackHref, "/empleos", !returnTo));

  return <main className="ccr-tablero-fijo min-h-[calc(100vh-72px)] overflow-x-clip bg-white pb-0 text-[#162543] sm:bg-[#fafafa] sm:pb-16 lg:flex lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:bg-white lg:pb-0">
    {avisoNode}
    {showingMobileDetail && selected && (
      <section className="ccr-tablero-ficha lg:hidden">
        <header className={cn(CABECERA_FILA_CENTRADA, "ccr-cabecera-pegada ccr-marketplace-sticky sticky top-0 z-20 border-b bg-white transition-colors duration-200", conLinea ? "border-[#e5e7eb]" : "border-transparent")}>
          <Link
            href={detailBackHref}
            aria-label={detailBackLabel}
            className={cn("absolute left-4", CABECERA_BOTON)}
          >
            <ArrowLeft className={CABECERA_GLIFO} />
          </Link>
          <h1 className={cn(CABECERA_TITULO, "text-center")}>{copy.job}</h1>
          <MenuEmpleo
            className="absolute right-3"
            guardar={selected.employer_id === currentProfessionalId ? undefined : { snapshot: jobSaveSnapshot(selected, locale), userId: currentUserId }}
            empleoId={selected.id}
            titulo={selected.title}
            enlace={enlaceEmpleo(selected)}
            empleadorNombre={selected.employer_name || copy.professionalFallback}
            empleadorSlug={selected.employer_slug}
            esPropio={selected.employer_id === currentProfessionalId}
          />
        </header>
        <JobPreview
          job={selected}
          isOwner={selected.employer_id === currentProfessionalId}
          userId={currentUserId}
         
         
          onEdit={() => setEditingJob(selected)}
          mobile
        />
      </section>
    )}
    <section ref={cabeceraRef} className={cn(showingMobileDetail && "hidden", "ccr-cabecera-pegada ccr-marketplace-sticky sticky top-0 z-20 border-b bg-white transition-colors duration-200 lg:hidden", conLinea ? "border-[#e5e7eb]" : "border-transparent")}>
      <div className="px-0">
        <div className={CABECERA_FILA}>
          <button type="button" onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} aria-label={copy.openMenu} className={CABECERA_BOTON}>
            <Menu className={CABECERA_GLIFO} strokeWidth={2.5} />
          </button>
          <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
            <ContrataCRMark />
          </Link>
          <h1 className={CABECERA_TITULO}>{copy.jobs}</h1>
          {/* El icono de Mensajes es de la barra de la APP: en la web, Mensajes
              se llega desde el menú y desde el panel, y ninguna otra pantalla
              del sitio lo lleva arriba. Aquí se colaba y era la única pantalla
              de la web con ese icono. */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {currentUserId ? (
              <>
                {nativeApp && <HeaderMessagesLink unreadCount={mensajesSinLeer} label={copy.messages} />}
                <NotificationBell scope="all" />
              </>
            ) : (
              <>
                {nativeApp && <HeaderMessagesLink unreadCount={0} label={copy.messages} href={accesoHref("/mensajes")} />}
                {/* En la web, sin sesión va la cuenta; la campana queda para quien ya entró. */}
                {nativeApp ? <HeaderNotificationsLink href={accesoHref("/notificaciones")} label={copy.notifications} /> : <HeaderAccountLink />}
              </>
            )}
          </div>
        </div>
        <div className="px-4 pb-3">{renderSearch()}</div>
        {/* Una sola línea que se desliza: cuatro filtros no pueden costar cuatro renglones. */}
        <ScrollRail className="ccr-chip-row flex gap-1 px-4 pb-3 sm:gap-1.5">{renderFilters()}</ScrollRail>
        <div className="px-4 pb-3" data-testid="jobs-mobile-sticky-actions">{renderActions()}</div>
      </div>
    </section>
    <MarketplaceNavbarPortal>
      <section className="hidden h-full bg-transparent lg:block">
        <div className="flex h-full w-full items-center py-2"><div className="w-full">{renderSearch()}</div></div>
      </section>
    </MarketplaceNavbarPortal>
    {/* Título, acciones y filtros viven en UNA tarjeta blanca: sueltos sobre el
        fondo, en escritorio se leían como tres bloques sin relación. */}
    {!detailOnly && (
      <div className="relative z-30 hidden shrink-0 border-b border-[#e5e7eb] bg-white lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
                      {/* SIN RAYA ENTRE EL TÍTULO Y LOS FILTROS. Separaba dos cosas que
                no compiten: el nombre de la sección es texto y los filtros son
                pastillas con contorno, así que ya se distinguen solos. Era
                además la única raya vertical del app —todo lo demás separa en
                horizontal o con aire— y el aire que ya hay basta. */}
<div className="flex shrink-0 items-baseline gap-2 pr-4">
            {/* El nombre de la pantalla, a la vista: antes era solo para lectores
                de pantalla y la barra arrancaba en frío con los filtros —quien
                llegaba de Google no sabía en qué sección estaba—.
                EL CONTEO SOLO CUANDO DICE ALGO: «cuántos quedaron» tras buscar o
                filtrar. Sin filtros es el inventario entero, un dato que no le
                sirve a nadie y que le compite al título; en el teléfono ya se
                hacía así y en computadora no. Y la raya divisoria solo si hay
                filtros al otro lado: sin ellos separaba el título de la nada. */}
            <h1 className="text-[17px] font-extrabold text-[#162543]">{copy.jobs}</h1>
            {hasActiveFilters && filtered.length > 0 && (
              <span className="text-[13px] font-semibold text-[#68778d]">
                <span className="tabular-nums">{filtered.length}</span> {filtered.length === 1 ? copy.job.toLocaleLowerCase(locale) : copy.jobs.toLocaleLowerCase(locale)}{locationFilter.trim() ? ` · ${locationFilter.trim()}` : ""}
                {limpiarFiltros}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 overflow-visible">{renderFilters()}</div>
          <div className="flex shrink-0 gap-2">{renderActions()}</div>
        </div>
      </div>
    )}
    {detailOnly && selected && (
      <div className="ccr-tablero-ficha-pc mx-auto hidden w-full max-w-6xl px-6 pb-8 pt-8 lg:block">
        {/* Ver la nota de la ficha de una promoción: en computadora la flecha
            de atrás la pone el navegador, así que este enlace solo sale cuando
            el navegador NO puede ayudar —se llegó de fuera y su flecha saca del
            sitio—, y entonces dice «Ver todos los empleos», no «Volver». */}
        {/* En computadora no hay flecha de volver: la del navegador ya
            está y hace lo mismo. Ver la nota de la ficha de una promoción. */}
        {/* FLEX CON UTILIDADES NORMALES, NO UNA REJILLA CON VALOR ARBITRARIO.
            `lg:grid-cols-[minmax(0,1fr)_320px]` depende de que Tailwind genere
            esa clase; donde no la generó, quedaba `lg:grid` con una sola
            columna y las dos tarjetas salían APILADAS, una debajo de la otra.
            `lg:flex` + `lg:flex-1` + `lg:w-80` son utilidades de siempre: no
            hay nada que generar y no hay forma de que degrade. */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-white lg:flex-1">
            <JobPreview job={selected} isOwner={selected.employer_id === currentProfessionalId} userId={currentUserId} onEdit={() => setEditingJob(selected)} hideActions />
          </div>
          {/* Acompaña al desplazar, como en Promociones y Proyectos: era la
              única de las tres que se quedaba atrás al bajar por la
              descripción, y el WhatsApp desaparecía justo cuando se había
              terminado de leer y se quería escribir. */}
          <aside className="h-fit w-full shrink-0 self-start rounded-lg border border-[#e5e7eb] bg-white p-5 lg:w-80 lg:sticky lg:top-6">
            <p className="text-xs font-bold uppercase text-[#7a899d]">{copy.salary}</p>
            <p className="mt-1 text-2xl font-extrabold text-[#007fae]">{formatJobSalary(selected, locale)}</p>
            <div className="my-4 border-t border-[#e5e7eb]" />
            {/* UNO ARRIBA Y DOS ABAJO. Tres botones del mismo ancho apilados
                no dicen cuál importa: el color es la única diferencia. Con el
                principal a lo ancho y los dos secundarios en pareja, la
                jerarquía se ve sin leer. «Administrar» va en corto porque
                comparte fila y «Administrar empleo» no cabe en media columna.
                DOS ACCIONES, UNA A CADA LADO: eran tres —editar, administrar y
                copiar enlace— y por eso editar iba a lo ancho arriba; al mudarse
                compartir al «···», administrar se quedó huérfano en media
                columna y la fila parecía cortada. */}
            {selected.employer_id === currentProfessionalId ? (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setEditingJob(selected)} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3]"><span className="truncate">{copy.editShort}</span></button>
                <Link href={`/dashboard/profesional?mode=offer&tab=jobs&job=${selected.id}`} className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full border border-[#b9d9e8] px-3 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]"><span className="truncate">{copy.manageShort}</span></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Mismo orden que abajo: primero por donde de verdad contestan.
                    Postularse solo si el empleo no dejó WhatsApp. */}
                <JobContactActions job={selected} isOwner={false} userId={currentUserId} />
              </div>
            )}
          </aside>
        </div>
      </div>
    )}
    {/* El conteo SOLO cuando se buscó o se filtró: ahí responde «¿cuántos
        quedaron?». Sin filtros, encima de la lista entera, no decía nada que la
        lista no dijera. Y «Costa Rica» se fue: el app entero es Costa Rica, así
        que era una palabra fija debajo de un número. */}
    {!detailOnly && <div className={`${showingMobileDetail ? "hidden lg:block " : ""}ccr-tablero-cuerpo mx-auto w-full max-w-7xl px-0 py-0 sm:max-w-[46rem] sm:px-6 sm:py-5 lg:max-w-7xl lg:flex-1 lg:min-h-0 lg:px-6 lg:py-0`}>
      <div className={`ccr-tablero-marco ${filtered.length > 0 ? "lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]" : ""} sm:overflow-hidden sm:rounded-[22px] sm:border sm:border-[#e5e7eb] sm:bg-white sm:shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)] lg:h-full ccr-panel-tablero`}>
        <section className={filtered.length > 0 ? MARKETPLACE_LIST_CLASS : "min-w-0 bg-white"}>
          {/* Con cero, el vacío ya lo dice: «0 empleos» encima era lo mismo dos veces. */}
          {hasActiveFilters && filtered.length > 0 && (
            <div className="border-b border-[#e5e7eb] px-4 py-3 lg:hidden">
              <p className="font-bold">{filtered.length} {filtered.length === 1 ? copy.job.toLocaleLowerCase(locale) : copy.jobs.toLocaleLowerCase(locale)}{limpiarFiltros}</p>
              {/* La zona que se buscó, no un país fijo: «Costa Rica» debajo del
                  número era siempre la misma palabra; si alguien buscó en
                  Atenas, lo útil es que diga Atenas. */}
              {locationFilter.trim() && <p className="text-xs text-[#68778d]">{locationFilter.trim()}</p>}
            </div>
          )}
          <div>
            {filtered.map((job) => <JobRow key={job.id} job={job} selected={selected?.id === job.id} onSelect={() => setSelectedId(job.id)} />)}
            {filtered.length === 0 && (
              // El MISMO vacío del resto del app: mosaico azul con el icono a
              // línea, título, apoyo y una salida. Estaba dibujado a mano con
              // un círculo distinto al de todas las demás pantallas.
              // En computadora la lista ocupa el alto entero de la pantalla:
              // con el vacío midiendo sus 20rem de siempre, el aviso quedaba
              // arriba de una losa blanca enorme y parecía que la página se
              // había cortado. Ocupando el alto disponible se centra, que es
              // lo que hace que un vacío se lea como una respuesta y no como
              // un error de dibujo.
              <PanelEmptyState
                className="lg:min-h-full"
                plano
                icon={BriefcaseBusiness}
                title={hasActiveFilters ? copy.noResults : copy.noJobs}
                description={hasActiveFilters ? copy.emptyHelp : copy.futureJobs}
                action={hasActiveFilters ? (
                  <button type="button" onClick={clearSearchAndFilters} className="inline-flex items-center justify-center rounded-full border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">
                    {copy.viewAll}
                  </button>
                ) : canPost ? (
                  <>
                    <button type="button" onClick={() => setPublishOpen(true)} className="hidden items-center justify-center rounded-full bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">
                      {copy.publishFirst}
                    </button>
                    <Link href="/empleos/publicar" className="inline-flex items-center justify-center rounded-full bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden">
                      {copy.publishFirst}
                    </Link>
                  </>
                ) : null}
              />
            )}
          </div>
        </section>
        {selected && <JobPreview job={selected} isOwner={selected.employer_id === currentProfessionalId} userId={currentUserId} onEdit={() => setEditingJob(selected)} />}
      </div>
    </div>}
    {publishOpen && currentProfessionalId && (
      <Modal onClose={() => setPublishOpen(false)} title={copy.publishJob} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
        <JobPostForm
          onCancel={() => setPublishOpen(false)}
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
      <Modal onClose={() => setEditingJob(null)} title={copy.editJob} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
        <JobPostForm
          onCancel={() => setEditingJob(null)}
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
  return <article className={`relative min-h-[7.25rem] overflow-hidden border-b lg:min-h-0 border-[#e5e7eb] bg-white px-3 py-3 transition sm:max-lg:last:border-b-0 hover:bg-[#f8fafc] sm:px-4 ${selected ? "lg:bg-[#eef9fd] lg:shadow-[inset_4px_0_0_#162543]" : ""}`}>
    <button type="button" onClick={onSelect} aria-label={`Ver ${job.title}`} className="absolute inset-0 hidden lg:block" />
    <Link href={`/empleos/${job.id}`} className="relative z-[1] block w-full text-left lg:pointer-events-none">
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <EmployerAvatar job={job} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[15px] font-extrabold leading-tight text-[#005eaa] lg:text-base">{job.title}</h2>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#101d35]">{job.employer_name || copy.professionalFallback}</p>
          {/* TELÉFONO: dónde y cuándo; modalidad y experiencia; salario. */}
          <JobMetaLine job={job} showApplicants={false} className="mt-0.5 truncate text-sm text-[#52627a] lg:hidden" />
          {/* SIN LOS AÑOS DE EXPERIENCIA. En la tarjeta de una lista el dato no
              ayuda a elegir —nadie descarta una vacante por «2+ años» de un
              vistazo— y era lo único que obligaba a recortar la línea. Se lee
              en la ficha, dentro del bloque de datos, y se filtra arriba. */}
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#60708a] lg:hidden"><span className="truncate">{workplaceTypeLabel(job.workplace_type, locale)}</span></div>
          <div className="mt-0.5 truncate text-xs font-bold text-[#008fc3] lg:hidden">{formatJobSalary(job, locale)}</div>
          {/* COMPUTADORA: cuatro renglones en vez de cinco, y un solo azul por
              fila. Dónde, modalidad y experiencia comparten línea; el salario
              va en azul marino —el azul de enlace queda solo para el título,
              que es lo único que se abre— y la fecha, que es lo menos
              importante, se va a la derecha en gris. */}
          <p className="mt-0.5 hidden truncate text-[13px] text-[#52627a] lg:block">
            {jobLocationText(job, locale)}
            <span aria-hidden="true" className="mx-1.5 text-[#9aa8b8]">&middot;</span>
            {workplaceTypeLabel(job.workplace_type, locale)}
          </p>
          <div className="mt-1 hidden items-baseline justify-between gap-3 lg:flex">
            <span className="min-w-0 truncate text-[13px] font-extrabold text-[#162543]">{formatJobSalary(job, locale)}</span>
            <span className="shrink-0 text-xs text-[#8794a7]">{relativeDate(job.created_at, locale)}</span>
          </div>
        </div>
      </div>
    </Link>
  </article>;
}

function JobPreview({ job, isOwner, userId, onEdit, mobile = false, hideActions = false }: { job: JobPost; isOwner: boolean; userId: string | null; onEdit: () => void; mobile?: boolean; hideActions?: boolean }) {
  const locale = marketplaceLocale(useLocale());
  const copy = JOBS_COPY[locale];
  const enlaceParaCompartir = enlaceEmpleo(job);
  const detailRows = [
    [copy.employmentType, employmentTypeLabel(job.employment_type, locale)],
    [copy.workplace, workplaceTypeLabel(job.workplace_type, locale)],
    [copy.experience, experienceLevelLabel(job.experience_level ?? "any", locale)],
    [copy.location, job.workplace_type === "remote" ? copy.wholeCountry : job.location_label],
    [copy.openings, `${job.openings || 1} ${job.openings === 1 ? copy.opening : copy.openingPlural}`],
    ...(job.duration_label ? [[copy.duration, job.duration_label] as [string, string]] : []),
  ].filter(([, value]) => Boolean(value));

  return <article className={`ccr-marketplace-result-list relative min-w-0 bg-white ${mobile ? "block px-5 pt-6 max-sm:pb-6 sm:pb-6" : "hidden p-7 lg:block lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto"}`}>
    {/* Quién publica va PRIMERO —foto y nombre— y al final de esa misma línea
        el «···», con compartir adentro. Es el orden de LinkedIn y de Indeed:
        la empresa encabeza la ficha, el puesto va debajo a todo el ancho. El
        «···» arriba deja la fila de acciones limpia: solo lo que contacta. */}
    <div className="flex items-start gap-4"><EmployerAvatar job={job} size="large" /><div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-[#52627a]">{job.employer_name}</p>
        {/* COMPARTIR VIVE DENTRO DEL «···», no al lado. Probé sacarlo como
            botón visible y quedaba la MISMA acción dos veces a dos centímetros:
            el botón y la opción del menú. Un «Compartir» que abriera un segundo
            nivel para ofrecer «Copiar enlace» es la estructura de LinkedIn, que
            la necesita porque tiene tres destinos —mensaje, publicación,
            enlace—; aquí en computadora hay UNO, así que el menú lo dice
            directo y se acabó.
            La condición mira solo el móvil a propósito: `hideActions` apaga la
            FILA de acciones, no la cabecera, y con ella puesta la ficha abierta
            desde Google se quedaba sin «···» —sin forma de compartir— en
            computadora. La cabecera del teléfono trae el suyo aparte. */}
        {!mobile && (
          <MenuEmpleo
            grande
            className="-my-2.5 -mr-2 shrink-0"
            empleoId={job.id}
            titulo={job.title}
            enlace={enlaceParaCompartir}
            empleadorNombre={job.employer_name || copy.professionalFallback}
            empleadorSlug={job.employer_slug}
            esPropio={isOwner}
          />
        )}
      </div>
      <h2 className="mt-0.5 text-2xl font-extrabold leading-tight">{job.title}</h2><JobMetaLine job={job} className="mt-1 text-sm text-[#68778d]" /><p className={cn("mt-2 text-base font-extrabold text-[#007fae]", hideActions && "lg:hidden")}>{formatJobSalary(job, locale)}</p></div>
    </div>
    {!hideActions && !mobile && (
      // COMPUTADORA: las acciones justo debajo del título, en una fila que se
      // queda pegada arriba del panel al bajar por la vacante. Compartir a la
      // vista. El «···» subió a la línea del nombre.
      <div style={{ top: -28 }} className="sticky z-10 -mx-7 mt-4 flex items-center gap-2 border-b border-[#eef2f6] bg-white px-7 py-3">
        {isOwner ? (
          <>
            <button type="button" onClick={onEdit} className="inline-flex h-12 items-center justify-center rounded-full bg-[#009fd9] px-6 text-base font-semibold text-white transition hover:bg-[#008fc3]">{copy.editJob}</button>
            <Link href={`/dashboard/profesional?mode=offer&tab=jobs&job=${job.id}`} className="inline-flex h-12 items-center justify-center rounded-full border border-[#b9d9e8] px-6 text-base font-semibold text-[#007fae] transition hover:bg-[#f1f9fc]">{copy.manageJob}</Link>
          </>
        ) : (
          <JobContactActions job={job} isOwner={false} userId={userId} escritorio />
        )}
      </div>
    )}
    {!hideActions && mobile && (isOwner ? (
      // Lo del dueño va en la MISMA franja fija de abajo que el contacto: era lo
      // único que en el teléfono quedaba suelto dentro de la ficha.
      <AccionesAlPie className="mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
        <button type="button" onClick={onEdit} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:w-auto sm:px-6">{copy.editJob}</button>
        <Link href={`/dashboard/profesional?mode=offer&tab=jobs&job=${job.id}`} className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#b9d9e8] px-4 text-center text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc] sm:w-auto sm:px-6">{copy.manageJob}</Link>
      </AccionesAlPie>
    ) : (
      // Una acción por línea, del mismo ancho, en el orden en que se usan.
      // Antes iban en una fila que envolvía, y «Postularme» quedaba del mismo
      // tamaño que WhatsApp aunque en dos meses no hubo NI UNA postulación.
      <AccionesAlPie className="mt-5 w-full sm:max-w-sm lg:max-w-md">
        <JobContactActions job={job} isOwner={false} userId={userId} soloContacto />
        {/* Una sola puerta: WhatsApp. Antes había un «Postularme» de reserva
            para el empleo sin WhatsApp, y lo único que lograba era que dos
            vacantes se vieran distintas. WhatsApp es obligatorio al registrarse
            como profesional, así que ese caso solo aparecía con una cuenta
            bloqueada —donde tampoco queremos mandar postulaciones—. El
            formulario sigue vivo por su dirección (?apply=) para lo que ya
            estaba en camino. */}
      </AccionesAlPie>
    ))}
    <dl className={`grid gap-3 border-[#e5e7eb] text-sm sm:grid-cols-2 ${!mobile && !hideActions ? "mt-0 border-b pb-5 pt-5" : "mt-6 border-y py-5"}`}>{detailRows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{label}</dt><dd className="mt-0.5 break-words font-bold text-[#162543] [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
    <section className="mt-7"><h3 className="text-lg font-bold">{copy.about}</h3><p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">{job.description}</p></section>
    {[ [copy.responsibilities, job.responsibilities], [copy.requirements, job.requirements], [copy.benefits, job.benefits] ].map(([title, items]) => Array.isArray(items) && items.length > 0 ? <section key={String(title)} className="mt-7"><h3 className="text-lg font-bold">{String(title)}</h3><ol className="mt-3 space-y-2.5 text-sm text-[#43536b]">{items.map((item, index) => <li key={`${title}-${item}-${index}`} className="flex min-w-0 gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef7fb] text-[11px] font-extrabold leading-none text-[#008fc3]">{index + 1}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span></li>)}</ol></section> : null)}
  </article>;
}

// Contactar a quien publica el empleo por donde de verdad contesta.
//
// Medido en producción, en dos meses: 86 toques a WhatsApp, 4 a «Llamar» y CERO
// al correo (92 profesionales tienen uno puesto y nadie lo usó nunca). Los 289
// profesionales tienen WhatsApp. Así que WhatsApp manda y ocupa su propia
// línea; «Llamar» va debajo, secundario; el correo se retiró del app.
//
// Ni el número ni el correo están en la página: se piden al tocar.
function JobContactActions({ job, isOwner, userId, soloContacto = false, escritorio = false }: { job: JobPost; isOwner: boolean; userId: string | null; soloContacto?: boolean; escritorio?: boolean }) {
  const locale = marketplaceLocale(useLocale());
  const nativeApp = useNativeApp();
  const copy = JOBS_COPY[locale];
  const nombre = job.employer_name || copy.professionalFallback;
  const showPrimary = nativeApp || !!job.employer_has_whatsapp;
  if (isOwner) return null;
  if (!escritorio && !showPrimary) return null;

  // En la franja pegada al fondo los botones miden 48 px, lo mismo que
  // «Publicar» en Crear proyecto; en la lista siguen midiendo 44 como el resto
  // de la fila. Es la misma franja en todas las secciones: tiene que medir lo
  // mismo en todas.
  // En la franja el botón es EL MISMO que «Publicar» en Crear proyecto: 48 px
  // de alto, a todo el ancho y el rótulo a 16 px. En la lista sigue siendo la
  // pastilla de 44 con letra de 14, que es la medida de la fila.
  const alto = soloContacto || escritorio ? "h-12" : "h-11";
  const letra = soloContacto || escritorio ? "text-base font-semibold" : "text-sm font-bold";
  const secundario = `w-full ${alto} ${letra} rounded-full border border-[#d7e1ea] bg-white px-3 text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]`;
  const escribir = showPrimary && (
    <DirectChatLauncher
      professionalId={job.employer_id}
      professionalName={nombre}
      contextTitle={job.title}
      analyticsSource="unknown"
      intent="job"
      jobId={job.id}
      className={`${alto} ${letra} w-full rounded-full`}
    />
  );
  // En la FICHA la franja de abajo lleva SOLO lo que contacta: escribir y
  // llamar, uno a cada lado. Guardar no contacta a nadie —es una acción sobre
  // la publicación— y vive arriba, junto al «...», igual que en la ficha del
  // profesional. Mezclados, la franja tenía tres botones y el que de verdad
  // importa quedaba del mismo tamaño que el de archivar para después.
  if (escritorio) {
    // En computadora: WhatsApp y Guardar, cada uno a su ancho, en la fila de
    // acciones. «Llamar» no va aquí: desde una computadora no se llama —el
    // enlace abre, en el mejor caso, una aplicación que casi nadie tiene
    // configurada—, y guardar para después sí es lo que se hace cuando se
    // revisan varias vacantes.
    return (
      <>
        {showPrimary && (
          <DirectChatLauncher
            professionalId={job.employer_id}
            professionalName={nombre}
            contextTitle={job.title}
            analyticsSource="unknown"
            intent="job"
            jobId={job.id}
            className="h-12 w-auto min-w-[9.5rem] rounded-full px-6 text-base font-semibold"
          />
        )}
        <SaveItemButton grande className="w-auto px-6" itemType="job" itemId={job.id} snapshot={jobSaveSnapshot(job, locale)} userId={userId} />
      </>
    );
  }
  if (soloContacto) {
    // Escribir a la izquierda, llamar a la derecha: dos acciones, un renglón.
    return (
      <div className="grid w-full grid-cols-1 gap-2">{escribir}</div>
    );
  }
  return (
    <div className="w-full space-y-2">
      {escribir}
      {/* Fuera de la ficha —en la lista— la acción que funciona se lleva la
          línea entera y lo secundario comparte la de abajo. */}
      <div className="grid grid-cols-1 gap-2">
        <SaveItemButton itemType="job" itemId={job.id} snapshot={jobSaveSnapshot(job, locale)} userId={userId} loginRedirect={`/empleos/${job.id}`} withLabel className={secundario} />
      </div>
    </div>
  );
}

function EmployerAvatar({ job, size = "default" }: { job: JobPost; size?: "default" | "large" }) {
  const locale = marketplaceLocale(useLocale());
  const dimensions = size === "large" ? "h-14 w-14" : "h-11 w-11 sm:h-12 sm:w-12";
  if (job.employer_avatar_url) return <ProgressiveImage src={cldThumb(job.employer_avatar_url, 96)} alt={`${JOBS_COPY[locale].professionalPhoto}: ${job.employer_name || JOBS_COPY[locale].professionalFallback}`} fit="cover" wrapperClassName={`${dimensions} shrink-0 rounded-full`} className="rounded-full" />;
  return <span className={`grid ${dimensions} shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]`}><Building2 className={size === "large" ? "h-6 w-6" : "h-5 w-5"} /></span>;
}
