"use client";

import { CardActionsMenu } from "@/components/dashboard/card-actions-menu";
import { AutoSaveHint, useAvisoDeGuardado } from "@/components/dashboard/auto-save-hint";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { useNativeApp } from "@/hooks/use-native-app";
import { ArrowLeft, BriefcaseBusiness, ChevronDown, Plus } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { invalidateAppData } from "@/lib/app-data-invalidation";
import type { JobPost } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { Modal } from "@/components/ui/modal";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { cn } from "@/lib/utils";
import { StatusFilterTabs, PUBLICACION_ESTADO_TABS, publicacionBucket, sinFiltros } from "@/components/dashboard/status-filter-tabs";
import { useLocale } from "next-intl";
import { employmentTypeLabel, marketplaceLocale, type MarketplaceLocale } from "@/lib/marketplace-copy";

type Application = { id: string; status: string; created_at: string; cover_letter: string; applicant_email: string | null; phone: string | null; resume_url: string | null; portfolio_url: string | null; applicant_name: string };
export type ManagedJob = JobPost & { applications: Application[] };

const JOBS_MANAGER_COPY = {
  es: {
    applicationStates: { submitted: "Recibida", reviewing: "En revisión", shortlisted: "Finalista", rejected: "Descartada", hired: "Contratada" },
    // UN ESTADO TIENE QUE DECIRSE ENTERO.
    // «Cerrado» a secas, junto al título de un empleo, no dice qué está
    // cerrado ni qué implica; «Vacante cerrada» sí. Y «Borrador» se fue: el
    // formulario publica SIEMPRE (nunca manda `draft`), así que era una
    // palabra para un estado que nadie podía crear. Si alguna fila vieja lo
    // trae, se lee como cerrada, que es lo que es: no se ve en público.
    back: "Volver al panel", title: "Mis empleos", subtitle: "Vacantes para cuando necesitas contratar.", publish: "Publicar empleo",
    application: "postulación", applications: "postulaciones", view: "Ver empleo", edit: "Editar", more: "Más opciones",
    close: "Cerrar vacante", republish: "Volver a publicar", remove: "Eliminar", removeTitle: "¿Eliminar este empleo?", removeBody: "Se borra del todo y no se puede recuperar.", removeCancel: "Cancelar", applicationsTitle: "Postulaciones",
    received: "Postulación recibida", message: "Mensaje", viewCv: "Ver CV", viewPortfolio: "Ver su sitio o portafolio",
    noApplications: "Aún no hay postulaciones.", emptyTitle: "Todavía no has publicado empleos", emptyBody: "Publica tu primera oportunidad laboral.",
    publishTitle: "Publicar empleo", publishSubtitle: "Describe la oportunidad con información clara y verificable.",
    editTitle: "Editar empleo", editSubtitle: "Actualiza la información de esta publicación.",
  },
  en: {
    applicationStates: { submitted: "Received", reviewing: "In review", shortlisted: "Shortlisted", rejected: "Rejected", hired: "Hired" },
    back: "Back to dashboard", title: "My jobs", subtitle: "Openings for when you need to hire.", publish: "Post job",
    application: "application", applications: "applications", view: "View job", edit: "Edit", more: "More options",
    close: "Close opening", republish: "Publish again", remove: "Delete", removeTitle: "Delete this job?", removeBody: "It is removed for good and cannot be recovered.", removeCancel: "Cancel", applicationsTitle: "Applications",
    received: "Application received", message: "Message", viewCv: "View resume", viewPortfolio: "View their site or portfolio",
    noApplications: "There are no applications yet.", emptyTitle: "You have not posted any jobs yet", emptyBody: "Post your first job opportunity.",
    publishTitle: "Post a job", publishSubtitle: "Describe the opportunity with clear, verifiable information.",
    editTitle: "Edit job", editSubtitle: "Update this job's information.",
  },
} satisfies Record<MarketplaceLocale, Record<string, unknown>>;

// UN color por significado, no un color por estado: azul de marca = está vivo
// ahora; gris = pasó o está en pausa; rojo = SOLO lo que salió mal (cancelado,
// no seleccionado). Un empleo cerrado suele ser el final feliz — pintarlo de
// rojo lo hacía leer como error, y con todo de colores el color deja de decir.

export function JobsManager({ initialJobs, embedded = false, backHref = "/dashboard/profesional?mode=offer&tab=jobs", professionalId, onRefresh }: { initialJobs: ManagedJob[]; embedded?: boolean; backHref?: string; professionalId?: string; onRefresh?: () => void }) {
  const nativeApp = useNativeApp();
  const locale = marketplaceLocale(useLocale());
  const copy = JOBS_MANAGER_COPY[locale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState(initialJobs);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("job"));
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ManagedJob | null>(null);

  useEffect(() => {
    const jobId = searchParams.get("job");
    if (!jobId) return;
    const frame = requestAnimationFrame(() => setOpenId(jobId));
    return () => cancelAnimationFrame(frame);
  }, [searchParams]);

  // La etapa (Activos/Inactivos) viaja en la dirección para que «Ver» abra la
  // ficha y la flecha de atrás devuelva a ESTA lista, no a la de siempre.
  const [etapa, setEtapa] = useState(() => (searchParams.get("etapa") === "cerradas" ? "cerradas" : "activas"));
  const pathname = usePathname();
  const volverAqui = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    params.set("etapa", etapa);
    return encodeURIComponent(`${pathname}?${params.toString()}`);
  })();
  // Con pocos elementos no hay etapas dibujadas: la lista sale entera.
  const visibles = sinFiltros(jobs.length) ? jobs : jobs.filter((item) => publicacionBucket(item.status) === etapa);
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


  const { dialogNode, confirm, showMessage } = useAppDialog();
  const aviso = useAvisoDeGuardado();

  // Solo lo que ya no está publicado se puede eliminar, y se pregunta antes:
  // no hay forma de recuperarlo.
  async function eliminar(id: string) {
    const result = await confirm({ title: copy.removeTitle, description: copy.removeBody, confirmLabel: copy.remove, cancelLabel: copy.removeCancel, tone: "danger" });
    if (!result.confirmed) return;
    let response!: Response;
    await aviso.correr(async () => { response = await fetch(`/api/jobs/posts?id=${encodeURIComponent(id)}`, { method: "DELETE" }); return response.ok; });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      await showMessage({ title: copy.remove, description: data?.error ?? "" });
      return;
    }
    setJobs((current) => current.filter((fila) => fila.id !== id));
    invalidateAppData("jobs");
  }

  async function updateJobStatus(id: string, status: JobPost["status"]) {
    // Se guarda en el momento, así que se confirma a la vista (ver AutoSaveHint).
    await aviso.correr(async () => {
      const response = await fetch("/api/jobs/posts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (response.ok) {
        pendingStatus.current[id] = status;
        setJobs((current) => current.map((job) => job.id === id ? { ...job, status } : job));
        invalidateAppData("jobs");
      }
      return response.ok;
    });
  }


  return (
    <div className={embedded ? "text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] px-4 py-6 text-[#162543] sm:px-6 sm:py-10"}>
      <div className={embedded ? "w-full" : "mx-auto max-w-4xl"}>
        <div className="mb-5 flex flex-col gap-4">
          <div className="min-w-0">
            {!embedded && !nativeApp && (
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={backHref} aria-label={copy.back} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#162543] hover:bg-white">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-2xl font-bold">{copy.title}</h1>
              </div>
            )}
          </div>
          {/* Cabecera de la sección: el contexto a la izquierda y la acción a la
              derecha, la misma fila que en Mis proyectos y en Soporte. */}
          <SectionHeadline subtitulo={copy.subtitle}>
              {jobs.length > 0 && (<>
              <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] sm:w-auto sm:px-6 lg:flex"><Plus className="h-4 w-4" />{copy.publish}</button>
              <Link href="/empleos/publicar?from=panel" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] sm:w-auto sm:px-6 lg:hidden max-sm:[&>svg]:hidden"><Plus className="h-4 w-4" />{copy.publish}</Link>
              </>)}
          </SectionHeadline>
        </div>
        {/* Filtro y lista en el mismo bloque y con la misma separación que en
            Mis proyectos: pegado a las tarjetas parecía parte de la primera.
            Las etapas siguen la misma regla: con pocos elementos no se dibujan
            y la lista sale entera. */}
        <div className="flex flex-col gap-3.5">
        <StatusFilterTabs
          tabs={PUBLICACION_ESTADO_TABS}
          masculino
          value={etapa}
          onChange={setEtapa}
          counts={{
            activas: jobs.filter((item) => publicacionBucket(item.status) === "activas").length,
            cerradas: jobs.filter((item) => publicacionBucket(item.status) === "cerradas").length,
          }}
          totalElementos={jobs.length}
        />
        <div className="flex flex-col gap-3.5">
          {visibles.map((job) => {
            const isOpen = openId === job.id;
            return (
              <article key={job.id} className="relative overflow-visible rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
                <button type="button" onClick={() => setOpenId(isOpen ? null : job.id)} aria-expanded={isOpen} className="flex h-24 w-full items-center gap-3 px-4 text-left sm:gap-4 sm:px-5">
                  {/* Empleos era la única de las tres listas del panel sin caja al
                      inicio: la fila arrancaba en el título y no se alineaba con
                      Mis proyectos ni con Mis promociones. */}
                  <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl ccr-caja-icono-plana sm:h-14 sm:w-14">
                    <BriefcaseBusiness className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* El estado como ANTETÍTULO, igual que en Postulaciones: en su
                        pastilla a la derecha obligaba a reservarle ancho fijo a TODAS
                        las tarjetas, tuviera la palabra corta o larga, y ese ancho se
                        lo quitaba al título. Arriba no compite con nada y se lee
                        primero, que es lo que uno busca al recorrer la lista. */}
                    {/* SIN ROTULO DE ESTADO. Decia «Vacante cerrada» o «Pausada»
                        encima del titulo, pero la tarjeta ya esta bajo la pestana
                        «Inactivos» y la unica accion de cierre es «Cerrar»: dos
                        palabras que repetian la pestana y distinguian estados que
                        ya no se eligen. */}
                    <h2 className="mt-0.5 line-clamp-2 text-[15px] font-extrabold leading-tight text-[#162543] sm:text-base">{job.title}</h2>
                    {/* Sin la barrita: separaba el tipo de empleo del conteo de
                        postulaciones, y al irse el conteo quedó colgando sola. */}
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#65758c]">
                      <span className="truncate">{employmentTypeLabel(job.employment_type, locale)}</span>
                      {job.location_label && <><span className="text-[#cbd5e1]">·</span><span className="truncate">{job.location_label}</span></>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ChevronDown className={cn("h-5 w-5 text-[#6b7b90] transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#e5e7eb] px-4 pb-5 pt-3 sm:px-5">
                    {job.description && <p className="mb-4 whitespace-pre-line break-words text-sm leading-6 text-[#52627a] [overflow-wrap:anywhere]">{job.description}</p>}
                                        {/* EDITAR ES LA ACCIÓN DE ESTA FILA, y va en azul lleno:
                        «Ver» solo mira, el «···» guarda lo de cambiar de estado,
                        y editar es a lo que se viene cuando se abre una
                        publicación propia. La misma fila en las tres secciones. */}
                    <div data-job-actions={job.id} className="ccr-acciones-tarjeta relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                      <Link href={`/empleos/${job.id}?from=${volverAqui}`} className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[#d7e1ea] px-3 text-xs font-bold text-[#162543]">{copy.view}</Link>
                      <button type="button" onClick={() => setEditingJob(job)} className="hidden h-10 w-full items-center justify-center rounded-full bg-[#009FD9] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0089bb] lg:inline-flex">{copy.edit}</button>
                      <Link href={`/empleos/${job.id}/editar?from=panel`} className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#009FD9] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0089bb] lg:hidden">{copy.edit}</Link>
                      {/* EL MISMO «···» Y LAS MISMAS DOS OPCIONES QUE EN
                          PROMOCIONES Y PROYECTOS. «Pausar» se retira: hacia
                          exactamente lo mismo que «Cerrar vacante» —la saca del
                          tablero publico y la manda a «Inactivos», y las dos se
                          deshacen con «Volver a publicar»—, asi que eran dos
                          palabras para un solo resultado y habia que pensar
                          cual elegir. Lo unico que cambiaba era el rotulo que
                          veia el dueno en su propia tarjeta. */}
                      <CardActionsMenu
                        label={copy.more}
                        triggerClassName="h-10 w-10 border-[#d7e1ea]"
                        actions={job.status === "published"
                          ? [
                              { label: copy.close, destructive: true, onClick: () => updateJobStatus(job.id, "closed") },
                            ]
                          : [
                              { label: copy.republish, primary: true, onClick: () => updateJobStatus(job.id, "published") },
                              { label: copy.remove, destructive: true, onClick: () => void eliminar(job.id) },
                            ]}
                      />
                    </div>
                    {/* Sin bandeja de postulaciones: se responde por WhatsApp.
                        En dos meses no llegó NI UNA, y una bandeja que nadie
                        atiende es peor que no tenerla —quien postula se queda
                        esperando—. La tabla y su historial quedan intactos; lo
                        que se retira es la pantalla. */}
                  </div>
                )}
              </article>
            );
          })}
          {jobs.length === 0 && (
            // El MISMO vacío del resto del app, ya no una copia a mano.
            <PanelEmptyState
              icon={BriefcaseBusiness}
              title={copy.emptyTitle}
              description={copy.emptyBody}
              action={(<>
                <Button type="button" size="crear" onClick={() => setPublishOpen(true)} className="hidden lg:inline-flex">{copy.publishTitle}</Button>
                <Button asChild size="crear" className="lg:hidden"><Link href="/empleos/publicar?from=panel">{copy.publishTitle}</Link></Button>
              </>)}
            />
          )}
        </div>
        </div>
      </div>
      {publishOpen && professionalId && (
        <Modal onClose={() => setPublishOpen(false)} title={copy.publishTitle} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
          <JobPostForm onCancel={() => setPublishOpen(false)} professionalId={professionalId} presentation="modal" backHref={backHref} onSaved={(id) => { setPublishOpen(false); onRefresh?.(); router.push(`/empleos/${id}?from=panel`); }} />
        </Modal>
      )}
      {editingJob && professionalId && (
        <Modal onClose={() => setEditingJob(null)} title={copy.editTitle} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
          <JobPostForm onCancel={() => setEditingJob(null)} key={editingJob.id} professionalId={professionalId} initialJob={editingJob} presentation="modal" backHref={backHref} onSaved={() => { setEditingJob(null); onRefresh?.(); router.refresh(); }} />
        </Modal>
      )}
      {dialogNode}
      <AutoSaveHint {...aviso.estado} />
    </div>
  );
}
