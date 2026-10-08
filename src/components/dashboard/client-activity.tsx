"use client";

import { rutaProyecto } from "@/lib/marketplace-url";
import { QuoteBlock } from "@/components/quotes/quote-block";
import { noInsistirArriba } from "@/lib/ir-al-inicio";
import { cargarCotizaciones } from "@/lib/quotes-store";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { FolderOpen, ClipboardList, Plus, FileText, CheckCircle2 } from "lucide-react";
import { CardActionsMenu } from "@/components/dashboard/card-actions-menu";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Link, usePathname } from "@/i18n/navigation";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { etapaEnMasculino, StatusFilterTabs, PUBLICACION_ESTADO_TABS, proyectoPublicacionBucket, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { ExpandableText } from "@/components/ui/expandable-text";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";
import { SavedProfessionalsTab } from "@/components/professionals/saved-professionals-tab";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { PanelEmptyState, PanelFilterEmpty, PanelListSkeleton } from "@/components/ui/content-loading";

/**
 * Shared "acting as a client" activity views — the user's PUBLISHED projects
 * and saved professionals. Rendered both in the plain
 * client dashboard and inside the unified professional dashboard's "Cuando
 * contrato" group, so a professional manages everything in one place without
 * switching panels. Pure reorganization — same business logic/endpoints.
 */

export type ClientActivitySection = "projects" | "saved";

const OPEN_PUBLISH_PROJECT_EVENT = "contratacr:open-publish-project";

type Project = {
  id: string;
  title: string;
  description: string;
  status: string;
  // Lo que se puede corregir. El API de `role=client` ya devuelve la fila
  // entera, así que no hay consulta nueva: solo faltaba nombrarlos.
  category_id?: string | null;
  provincia_id?: string | null;
  canton_id?: string | null;
  created_at: string;
  categories?: { name: string };
  provincias?: { name: string };
  cantones?: { name: string };
  archived_by_client?: boolean;
  // Falso solo en los publicados antes del tablero público: se publicaron bajo
  // otra regla y no salen ahí hasta que su dueño lo pida.
  allow_direct_contact?: boolean;
  for_someone_else?: boolean;
  beneficiary_name?: string | null;
  beneficiary_dob?: string | null;
  beneficiary_is_minor?: boolean;
};

const NO_PROJECTS: Project[] = [];

export async function fetchClientProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects?role=client", { cache: "no-store" });
  const { projects } = await res.json();
  return projects ?? [];
}

// Silueta única de las acciones de tarjeta: la misma
// píldora de 44px/13px del botón "Enviar mensaje" del perfil profesional.
// En el teléfono los botones llenan la fila; en escritorio la tarjeta mide 800px y
// un botón de ese ancho se ve desproporcionado: quedan a su tamaño, alineados a la izquierda.
// En pantallas de 390px para abajo, dos acciones y el menú comparten renglón y
// cada botón se queda con media tarjeta: ahí el ícono le robaba al rótulo lo
// justo para cortarlo ("Enviar mensa…"). El rótulo dice lo que hace; el ícono
// es adorno, así que es el que cede.
const actionButtonClass = "h-11 w-auto shrink-0 grow whitespace-nowrap rounded-full px-4 text-[13px] font-bold max-[389px]:px-3 max-[389px]:[&>svg]:hidden lg:grow-0 lg:min-w-[11rem]";

export function ClientActivity({ section, onCount }: { section: ClientActivitySection; onCount?: (total: number) => void }) {
  const { user } = useAuth();
  const t = useTranslations("clientActivity");
  const tSub = useTranslations("proPanel.subtitles");
  const tEtapas = useTranslations("statusTabs");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";

  // Rows come from the shared cache: a return to this tab paints what was here
  // before and refreshes quietly. Keys match the notification prefetch, so a
  // toast about a project has already warmed the next visit.
  const projectsResource = useCachedResource<Project[]>(
    user && section === "projects" ? `dashboard:client-projects:${user.id}` : null,
    fetchClientProjects,
    NO_PROJECTS,
  );
  const { data: projects, setData: setProjects } = projectsResource;
  // El conteo sube al cambiador de «Mis publicaciones»: tiene que estar arriba
  // de cualquier retorno temprano, o el orden de los hooks cambia entre pintados.
  useEffect(() => { onCount?.(projects.length); }, [projects.length, onCount]);
  const loading = section === "projects" ? projectsResource.loading : false;
  const [projectFilter, setProjectFilter] = useState(() => (searchParams.get("etapa") === "cerradas" ? "cerradas" : "activas"));
  const pathname = usePathname();
  // «Ver proyecto» lleva la dirección exacta de esta lista (pestaña y etapa)
  // para que la flecha de atrás de la ficha devuelva aquí mismo.
  const volverAqui = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("project");
    params.set("etapa", projectFilter);
    return encodeURIComponent(`${pathname}?${params.toString()}`);
  })();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  // Corregir lo que se pidió, desde el panel: es donde el cliente llega a ver
  // sus proyectos, igual que edita sus empleos y sus promociones desde el suyo.
  const [editandoProyecto, setEditandoProyecto] = useState<Project | null>(null);
  // Published request cancel confirm: the professional should still be warned.
  const [cancelProjectTarget, setCancelProjectTarget] = useState<string | null>(null);
  const [cancellingProject, setCancellingProject] = useState(false);
  // Delete-project confirm dialog (clean modal, not a browser confirm()).
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const targetProjectRetryRef = useRef(0);
  const targetProjectRef = useRef<string | null>(null);
  const targetProjectHandledRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const lastSilentRefreshRef = useRef(0);
  const refreshProjectRows = projectsResource.refresh;

  // Re-fetch the section's rows; the cached ones stay on screen meanwhile.
  const fetchSection = useCallback(async () => {
    if (!user) return;
    if (section === "projects") await refreshProjectRows();
  }, [user, section, refreshProjectRows]);

  const refreshSoon = useCallback(() => {
    if (section === "saved" || document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 1600 ? 1600 - elapsed : 700;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      void fetchSection();
    }, delay);
  }, [fetchSection, section]);

  // Las cotizaciones se piden junto con la lista, no al abrir cada tarjeta:
  // así el bloque de cotización ya está cuando la tarjeta se despliega.
  useEffect(() => { cargarCotizaciones(); }, []);

  useEffect(() => {
    if (!user || section === "saved" || loading) return;
    window.addEventListener("notificationsChanged", refreshSoon);
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", refreshSoon);
    return () => {
      window.removeEventListener("notificationsChanged", refreshSoon);
      window.removeEventListener("focus", refreshSoon);
      document.removeEventListener("visibilitychange", refreshSoon);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [loading, refreshSoon, section, user]);

  useEffect(() => {
    if (section !== "projects") return;
    const projectId = searchParams.get("project");
    if (!projectId) return;
    if (targetProjectRef.current !== projectId) {
      targetProjectRef.current = projectId;
      targetProjectRetryRef.current = 0;
      targetProjectHandledRef.current = false;
    }
    if (targetProjectHandledRef.current) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      if (targetProjectRetryRef.current >= 8) return;
      targetProjectRetryRef.current += 1;
      const id = window.setTimeout(() => void fetchSection(), 900);
      return () => window.clearTimeout(id);
    }
    targetProjectRetryRef.current = 0;
    targetProjectHandledRef.current = true;
    const id = window.setTimeout(() => {
      setProjectFilter(proyectoPublicacionBucket(project.status));
      setExpandedProject(projectId);
      window.setTimeout(() => { noInsistirArriba(); return document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 80);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSection, projects, searchParams, section]);

  useEffect(() => {
    if (section !== "projects") return;
    const openPublish = () => setShowPublish(true);
    // El formulario puede abrirse fuera de esta sección (desde el inicio): al
    // publicar avisa por este evento para que la lista traiga la nueva solicitud.
    const alPublicar = () => { void refreshProjectRows(); };
    window.addEventListener(OPEN_PUBLISH_PROJECT_EVENT, openPublish);
    window.addEventListener("contratacr:projects-changed", alPublicar);
    return () => {
      window.removeEventListener(OPEN_PUBLISH_PROJECT_EVENT, openPublish);
      window.removeEventListener("contratacr:projects-changed", alPublicar);
    };
  }, [section]);

  // `?openPublish=1` lo atiende el PANEL, no esta sección. Las dos lo leían y
  // cada una abría su formulario: quedaban dos ventanas idénticas una encima de
  // la otra, y la flecha que se tocaba era la de arriba —la del panel—, que no
  // sabía de dónde venía la persona.

  // Un proyecto abierto que NO sale en el tablero (se publicó antes de que
  // existiera) puede salir ahora, si su dueño lo pide. Hasta entonces seguía
  // «activo» en el panel sin que nadie pudiera verlo.
  async function publicarEnTablero(id: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "publicar_en_tablero" }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("publicarEnTableroError"), tone: "danger" });
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, allow_direct_contact: true } : p)));
  }

  async function refreshProjects() {
    await refreshProjectRows();
  }

  async function updateProjectStatus(projectId: string, status: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, status }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("projectUpdateError"), tone: "danger" });
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status } : p)));
    refreshProjects();
  }

  function openCancelProject(projectId: string) {
    setCancelProjectTarget(projectId);
    setExpandedProject(projectId);
  }

  async function confirmCancelProject(projectId: string) {
    setCancellingProject(true);
    await updateProjectStatus(projectId, "cancelled");
    setCancellingProject(false);
    setCancelProjectTarget(null);
  }

  // "Ya lo resolví": cierra la solicitud y, si eligió a alguien de los que
  // respondieron, lo deja registrado para la reseña.

  // Elegir con quién sigue, sin cerrar la solicitud: el profesional queda
  // habilitado para cotizar y coordinar, y la solicitud se cierra después con
  // "Marcar como resuelta".

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/projects?id=${deleteTarget}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      void showMessage({ title: errorTitle, description: j.error ?? t("deleteProjectError"), tone: "danger" });
      setDeleting(false);
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== deleteTarget));
    setDeleting(false);
    setDeleteTarget(null);
  }

  if (section === "saved") {
    return <SavedProfessionalsTab />;
  }

  if (loading) {
    return <PanelListSkeleton rows={3} withTabs />;
  }

  const projectCounts = bucketCounts(projects.map((p) => proyectoPublicacionBucket(p.status)));
  // Las MISMAS dos etapas que Empleos y Promociones: está a la vista o no.
  // Las tres de antes —Activos, Finalizados, Cancelados— eran de cuando el
  // proyecto recibía propuestas dentro del app y había un desenlace que seguir.
  const projectTabs = PUBLICACION_ESTADO_TABS;
  const effectiveProjectFilter = projectTabs.some((tab) => tab.id === projectFilter)
    ? projectFilter : (projectTabs[0]?.id ?? projectFilter);
  // Mis proyectos SIEMPRE se filtra por etapa, tenga 2 o 200. La regla de
  // «pocos elementos, sin filtros» sirve donde las etapas son un detalle, pero
  // aquí separan lo que sigue esperando respuesta de lo que ya se resolvió, y
  // esconderlas tenía una consecuencia fea: al tocar «Marcar como finalizado»
  // el proyecto se quedaba en la misma lista, igualito, y parecía que el botón
  // no hacía nada.
  const filteredProjects = projects.filter((p) => proyectoPublicacionBucket(p.status) === effectiveProjectFilter);
  return (
    <>
      {/* SOLICITUDES PUBLICADAS — lo que el cliente pidió y quién le respondió. */}
      {section === "projects" && (
        <div>
          {/* Crear va ARRIBA, con el subtítulo a la izquierda: el filtro tiene que
              quedar pegado a la lista que filtra. En medio, el botón cortaba esa
              relación. */}
          <SectionHeadline className="mb-3.5" subtitulo={tSub("sent_projects")}>
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPublish(true)}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#009FD9] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#0089bb] sm:w-auto sm:px-6 max-sm:[&>svg]:hidden"
              >
                <Plus className="h-4 w-4" />
                {t("publishProject")}
              </button>
            )}
          </SectionHeadline>
          {projects.length === 0 ? (
            <PanelEmptyState
              icon={FolderOpen}
              title={t("pEmpty")}
              description={t("pEmptySub")}
              action={<Button size="crear" onClick={() => setShowPublish(true)}>{t("publishProject")}</Button>}
            />
          ) : (
            <div className="ccr-native-safe-list-end flex flex-col gap-3.5">
              <StatusFilterTabs
                tabs={PUBLICACION_ESTADO_TABS}
                value={effectiveProjectFilter}
                onChange={setProjectFilter}
                counts={projectCounts}
                labelFor={(id) => tEtapas(etapaEnMasculino(id))}
              />
              {filteredProjects.length === 0 && (
                <PanelFilterEmpty
                  icon={effectiveProjectFilter === "cerradas" ? CheckCircle2 : FolderOpen}
                  title={effectiveProjectFilter === "cerradas" ? t("pDoneEmpty") : t("pActiveEmpty")}
                  description={effectiveProjectFilter === "cerradas" ? t("pDoneEmptySub") : t("pActiveEmptySub")}
                />
              )}
              {filteredProjects.map((project) => {
                const isExpanded = expandedProject === project.id;
                const zone = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
                const isActive = project.status !== "completed" && project.status !== "cancelled";
                // La pestaña ya dice en qué etapa está: repetirlo en la tarjeta
                // gastaba el único renglón que hay para algo útil.
                // Con dos pestañas, «Inactivos» no dice CUÁL de los dos
                // finales fue: eso lo escribe siempre la tarjeta, igual que
                // Promociones escribe Pausada / Vencida / Agotada.
                // «Sin propuestas todavía» se fue. Desde que se responde por
                // WhatsApp no entra ninguna propuesta nueva, así que ese renglón
                // decía —para siempre, en todos los proyectos— que nadie había
                // contestado: un reclamo permanente por algo que ya no puede
                // pasar. En su lugar va el servicio, que es lo que identifica el
                // proyecto, igual que en el tablero público. El conteo se
                // conserva para los proyectos viejos que sí recibieron
                // propuestas, porque ahí sí hay algo que abrir.
                const servicio = project.categories?.name ?? null;
                // Debajo del titulo va el SERVICIO, este abierto o cerrado. El
                // «Proyecto cerrado» / «Proyecto cancelado» que iba ahi repetia
                // la pestana «Inactivos» —y en rojo, como si cerrar fuera un
                // error—, igual que pasaba en Empleos y Promociones.
                const headline = servicio;
                const headlineClass = "text-[#6b7280]";

                return (
                  <Card id={`project-${project.id}`} key={project.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all", isExpanded && "shadow-md ring-1 ring-[#cfe9f5]")}>
                    <button
                      type="button"
                      onClick={async () => {
                        setExpandedProject(isExpanded ? null : project.id);
                      }}
                      aria-expanded={isExpanded}
                      className={cn("group w-full p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:p-5", isExpanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Un icono por tipo de tarjeta, no por estado: que hay
                            propuestas ya lo dice el texto de al lado, y cambiarlo
                            hacía que dos tarjetas de la misma lista no se
                            reconocieran como lo mismo. El color sí marca el aviso. */}
                        <div className="relative shrink-0">
                          {/* La MISMA caja que Mis publicaciones y Favoritos: las
                              tres listas del panel se ven seguidas y cada una
                              traía su propio recuadro —una plana con borde, otra
                              un icono suelto sin fondo y Empleos ninguna—, así que
                              la misma lista cambiaba de cara al cambiar de
                              sección. El aviso de novedad lo sigue dando el punto. */}
                          <div className="grid h-[52px] w-[52px] place-items-center rounded-xl ccr-caja-icono-plana">
                            <ClipboardList className="h-5 w-5" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{project.title}</h3>
                          {headline && <p className={cn("mt-1 text-[13px] font-semibold", headlineClass)}>{headline}</p>}
                          <p className="mt-0.5 text-[12px] text-[#68778d]">{formatRelativeOrDate(project.created_at, locale)}{zone ? ` · ${zone}` : ""}</p>
                        </div>
                        <ExpandToggle open={isExpanded} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="rounded-b-2xl border-t border-[#eef2f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5">
                        <div className="flex flex-col gap-4">
                          {project.description && (
                            <div className="flex items-start gap-2.5">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68778d]">{t("descriptionField")}</p>
                                <ExpandableText text={project.description} lines={5} className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]" />
                              </div>
                            </div>
                          )}

                          <QuoteBlock projectId={project.id} role="client" />
                          {/* Respuestas: quién escribió, qué dijo, y WhatsApp directo. */}
                          {/* SIN LA LISTA DE PROPUESTAS. Desde que se contesta
                              por WhatsApp no entra ninguna propuesta nueva, así
                              que este bloque solo podía salir en proyectos
                              viejos y hacía que la misma lista se viera de dos
                              maneras según la edad del proyecto. A quien hizo el
                              trabajo se le sigue señalando al cerrar el
                              proyecto, que es donde esa pregunta tiene
                              sentido. */}

                          {/* Acciones: la que avanza en turquesa,
                              lo destructivo en el menú ⋮.
                              La fila siempre tiene al menos «Ver proyecto». */}
                          {(() => {
                            // La fila YA NO SE CALLA: «Ver proyecto» está
                            // siempre, así que siempre hay algo que ofrecer.
                            // Antes, un proyecto finalizado sin profesional
                            // elegido no tenía ninguna acción y la fila entera
                            // desaparecía —con ella se iba el único camino para
                            // abrir la ficha, y por eso «Ver proyecto» no salía
                            // en los inactivos—.
                            return (
                          <>
                          {project.status === "open" && project.allow_direct_contact === false && (
                            // DECIRLO, QUE ES LO HONESTO. Este proyecto se
                            // publicó antes del tablero público: solo lo veían
                            // los profesionales de su oficio. Quedaba «activo»
                            // para siempre sin que nadie pudiera verlo.
                            <div className="mt-4 rounded-xl bg-[#f4f7fa] p-3.5 text-left">
                              <p className="text-[13px] font-semibold text-[#162543]">{t("fueraDelTablero")}</p>
                              <p className="mt-0.5 text-[12px] leading-snug text-[#68778d]">{t("fueraDelTableroAyuda")}</p>
                              <button
                                type="button"
                                onClick={() => void publicarEnTablero(project.id)}
                                className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-[#009FD9] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#0089bb]"
                              >
                                {t("publicarEnTablero")}
                              </button>
                            </div>
                          )}
                          <div className="ccr-acciones-tarjeta flex items-start gap-2 border-t border-[#eef2f6] pt-4 sm:justify-end">
                            <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2 sm:flex sm:flex-none sm:flex-wrap sm:justify-end">
                              {/* VER EL PROYECTO, COMO EN EMPLEOS Y PROMOCIONES.
                                  Las tres listas del panel son lo mismo —algo
                                  que publiqué— y las otras dos abren su ficha
                                  desde la tarjeta; esta no tenía por dónde. Va
                                  primero, que es el orden de las otras dos:
                                  primero mirar, después actuar. */}
                              <Link
                                href={`${rutaProyecto(project)}?from=${volverAqui}`}
                                className={cn(actionButtonClass, "inline-flex items-center justify-center border border-[#d7e1ea] bg-white text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]")}
                              >
                                {t("viewProject")}
                              </Link>
                              {/* Editar, aquí mismo: en Empleos y Promociones el
                                  panel edita sin salir, y un proyecto obligaba a
                                  cancelar y volver a publicar. En AZUL LLENO,
                                  como en las otras dos: «Ver» solo mira, el
                                  «···» guarda lo de cambiar de estado, y editar
                                  es a lo que se viene al abrir algo propio. */}
                              {/* «Editar» tambien en las cerradas, como en
                                  Empleos: se corrige el enunciado y despues se
                                  vuelve a publicar, que es el orden natural.
                                  Estuvo oculto mientras la fila cerrada
                                  cargaba ademas «Dejar resena» y quedaban tres
                                  botones; esa ya no esta. */}
                              <button
                                type="button"
                                onClick={() => setEditandoProyecto(project)}
                                className={cn(actionButtonClass, "inline-flex items-center justify-center bg-[#009FD9] text-white transition-colors hover:bg-[#0089bb]")}
                              >
                                {t("editProject")}
                              </button>
                              {/* LO QUE PIDE ALGO AL CLIENTE SE QUEDA SUELTO;
                                  LO QUE CAMBIA EL ESTADO SE VA AL «···».
                                  «Marcar como finalizado», «Volver a publicar» y
                                  «Cancelar» son la misma familia que «Pausar»,
                                  «Cerrar vacante» y «Marcar como vencida», que en
                                  Empleos y Promociones ya viven en el menú. Aquí
                                  estaban sueltas y en turquesa, así que una fila
                                  de un proyecto tenía hasta cuatro botones y las
                                  otras dos secciones tres.

                                  LA RESEÑA NO SE DEJA DESDE UN PROYECTO. Se deja
                                  en la ficha del profesional, con cuenta, y ahí
                                  el formulario está abierto arriba de la lista:
                                  esa es la única puerta. Aquí había una segunda
                                  —y una tercera, que se abría sola al marcar el
                                  proyecto como finalizado— para escribir
                                  exactamente lo mismo. */}
                            </div>
                            {/* EXACTAMENTE LO MISMO QUE UN EMPLEO: publicado se
                                cierra; cerrado se vuelve a publicar o se
                                elimina. Hubo un momento en que el terminado
                                llevaba «Publicar uno igual» porque reabrirlo
                                borraba al profesional aceptado y dejaba la
                                resena colgando —pero un proyecto ya no tiene
                                profesional aceptado, se responde por WhatsApp
                                como un empleo—, asi que esa distincion se fue
                                con las propuestas. Cerrado es cerrado, venga
                                de donde venga. */}
                            <CardActionsMenu
                              label={t("actions")}
                              actions={isActive
                                ? [
                                    { label: t("cancelProject"), onClick: () => openCancelProject(project.id), destructive: true },
                                  ]
                                : [
                                    { label: t("reopenProject"), primary: true, onClick: () => void updateProjectStatus(project.id, "open") },
                                    { label: t("delete"), onClick: () => setDeleteTarget(project.id), destructive: true },
                                  ]}
                            />
                          </div>
                          </>
                            );
                          })()}

                          {cancelProjectTarget === project.id && (
                            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3.5">
                              <p className="text-sm font-semibold text-[#162543]">{t("cancelProjectTitle")}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">{t("cancelProjectBody")}</p>
                              <div className="ccr-grupo-botones mt-3 flex flex-wrap justify-end gap-2">
                                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setCancelProjectTarget(null)} disabled={cancellingProject}>{t("cancelBack")}</Button>
                                <Button size="sm" className="rounded-lg bg-red-600 hover:bg-red-700" onClick={() => confirmCancelProject(project.id)} disabled={cancellingProject} loading={cancellingProject}>{t("cancelProjectConfirm")}</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Publicar proyecto — the project form opens in a modal here (no longer a
          separate page), and refreshes this list on a successful publish. */}
      {editandoProyecto && (
        <PublishProjectModal
          editar={{
            id: editandoProyecto.id,
            categoryId: editandoProyecto.category_id ?? "",
            description: editandoProyecto.description ?? "",
            provinciaId: editandoProyecto.provincia_id ?? "",
            cantonId: editandoProyecto.canton_id ?? "",
          }}
          onClose={() => setEditandoProyecto(null)}
          onSuccess={() => refreshProjectRows({})}
        />
      )}
      {showPublish && (
        <PublishProjectModal onClose={() => setShowPublish(false)} onSuccess={() => refreshProjectRows({ esperandoNuevo: true })} />
      )}

      {/* DELETE project - clean on-brand confirm modal (replaces window.confirm). */}
      {deleteTarget && (
        <Modal
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          title={t("deleteTitle")}
          size="sm"
          mobilePresentation="center"
          footerClassName="justify-center sm:justify-end"
          footer={(
            <>
              <Button variant="outline" size="sm" className="flex-1 rounded-lg sm:flex-none" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("cancelBack")}</Button>
              <Button size="sm" className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 sm:flex-none" onClick={confirmDeleteProject} disabled={deleting} loading={deleting}>{t("delete")}</Button>
            </>
          )}
        >
          <p className="text-sm leading-6 text-[#6b7280]">{t("deleteBody")}</p>
        </Modal>
      )}

      {dialogNode}
    </>
  );
}

