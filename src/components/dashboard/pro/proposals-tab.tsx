"use client";

import { QuoteBlock } from "@/components/quotes/quote-block";
import { cargarCotizaciones } from "@/lib/quotes-store";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDays,
  Clock,
  EyeOff,
  FileText,
  Inbox,
  MapPin,
  Trash2,
  Users,
  Wrench,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { StatusFilterTabs, PROPUESTA_TABS } from "@/components/dashboard/status-filter-tabs";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { CardActionsMenu } from "@/components/dashboard/card-actions-menu";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";

type MyProposal = {
  id: string;
  project_id: string;
  price?: number;
  message: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  archived_by_professional?: boolean;
  projects?: {
    title: string;
    status: string;
    category_id?: string | null;
    profiles: { full_name: string; phone?: string; avatar_url?: string };
  } | null;
};

type OpenProject = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  category_id?: string | null;
  categories?: { name: string };
  provincias?: { name: string };
  cantones?: { name: string };
  client_identity_status?: "verified" | "pending" | "unverified" | null;
  profiles?: { full_name: string; avatar_url?: string };
};

interface ProposalsTabProps {
  categoryId?: string;
  professions?: string[];
  services?: { name?: string }[];
}

type StageKey = "nuevas" | "respondidas";
const NO_OPEN_PROJECTS: OpenProject[] = [];
const NO_MY_PROPOSALS: MyProposal[] = [];
const DISMISS_KEY = "cc_opps_dismissed";
const MESSAGE_MAX = 500;

// Solicitudes de clientes, para el profesional. Dos pestañas: las que no ha
// respondido y las que ya respondió. Responder es un solo mensaje; si al cliente
// le interesa, le escribe por WhatsApp. Nada de precios obligatorios, aceptar,
// marcar terminado ni confirmar.
export function ProposalsTab({ categoryId }: ProposalsTabProps) {
  const t = useTranslations("proposalsTab");
  const tEtapas = useTranslations("statusTabs");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { dialogNode, showMessage, confirm } = useAppDialog();
  const [retirando, setRetirando] = useState<string | null>(null);
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";

  const openResource = useCachedResource<OpenProject[]>(
    user ? `dashboard:pro-open-projects:${user.id}:all` : null,
    async () => {
      const res = await fetch(`/api/projects?role=professional${categoryId ? `&category=${categoryId}` : ""}`, { cache: "no-store" });
      const { projects } = await res.json();
      return (projects ?? []) as OpenProject[];
    },
    NO_OPEN_PROJECTS,
  );
  const mineResource = useCachedResource<MyProposal[]>(
    user ? `dashboard:pro-my-proposals:${user.id}` : null,
    async () => {
      const res = await fetch("/api/proposals?mine=true", { cache: "no-store" });
      const { proposals } = await res.json().catch(() => ({ proposals: [] }));
      return (proposals ?? []) as MyProposal[];
    },
    NO_MY_PROPOSALS,
  );
  const { data: openProjects } = openResource;
  const { data: myProposals } = mineResource;
  const loading = openResource.loading || mineResource.loading;

  const [stage, setStage] = useState<StageKey>("nuevas");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  // Proyecto cuya respuesta se acaba de retirar para corregir: la pantalla lo
  // explica en línea en vez de abrir un segundo aviso encima del primero.
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  const [expandedMine, setExpandedMine] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const refreshTimerRef = useRef<number | null>(null);
  const lastSilentRefreshRef = useRef(0);
  const targetProjectRef = useRef<string | null>(null);
  const targetProjectHandledRef = useRef(false);
  const targetProjectRetryRef = useRef(0);

  const answered = useMemo(() => {
    const next = new Set(myProposals.map((p) => p.project_id));
    for (const id of justSent) next.add(id);
    return next;
  }, [myProposals, justSent]);

  const newList = useMemo(
    () => openProjects.filter((p) => !answered.has(p.id) && !dismissed.has(p.id)),
    [openProjects, answered, dismissed],
  );
  const counts = useMemo(() => ({ nuevas: newList.length, respondidas: myProposals.length }), [newList.length, myProposals.length]);

  const refreshAll = useCallback(async () => {
    await Promise.all([openResource.refresh(), mineResource.refresh()]);
  }, [openResource, mineResource]);

  const refreshSoon = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 1600 ? 1600 - elapsed : 700;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      void refreshAll().then(() => setJustSent(new Set()));
    }, delay);
  }, [refreshAll]);

  // Las cotizaciones se piden junto con la lista, no al abrir cada tarjeta:
  // así el bloque de cotización ya está cuando la tarjeta se despliega.
  useEffect(() => { cargarCotizaciones(); }, []);

  useEffect(() => {
    if (loading) return;
    window.addEventListener("notificationsChanged", refreshSoon);
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", refreshSoon);
    return () => {
      window.removeEventListener("notificationsChanged", refreshSoon);
      window.removeEventListener("focus", refreshSoon);
      document.removeEventListener("visibilitychange", refreshSoon);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [loading, refreshSoon]);

  useEffect(() => {
    queueMicrotask(() => {
      try { const raw = localStorage.getItem(DISMISS_KEY); if (raw) setDismissed(new Set(JSON.parse(raw))); } catch {}
    });
  }, []);

  // Deep link from a notification: open that request in whichever tab it lives.
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (!projectId) return;
    if (targetProjectRef.current !== projectId) {
      targetProjectRef.current = projectId;
      targetProjectRetryRef.current = 0;
      targetProjectHandledRef.current = false;
    }
    if (targetProjectHandledRef.current) return;
    const mine = myProposals.find((p) => p.project_id === projectId);
    const open = openProjects.find((p) => p.id === projectId);
    if (mine || open) {
      targetProjectHandledRef.current = true;
      const id = window.setTimeout(() => {
        if (mine) { setStage("respondidas"); setExpandedMine(mine.id); }
        else { setStage("nuevas"); setDismissed((prev) => { if (!prev.has(projectId)) return prev; const n = new Set(prev); n.delete(projectId); return n; }); setExpandedProject(projectId); }
        window.setTimeout(() => document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
      }, 0);
      return () => window.clearTimeout(id);
    }
    if (targetProjectRetryRef.current >= 8) return;
    targetProjectRetryRef.current += 1;
    const id = window.setTimeout(() => { void refreshAll(); }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProposals, openProjects, searchParams]);

  async function sendReply(projectId: string) {
    const message = (messages[projectId] ?? "").trim();
    if (!message) return;
    setSubmitting(projectId);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message }),
      });
      if (res.ok || res.status === 409) {
        setJustSent((prev) => new Set(prev).add(projectId));
        setExpandedProject(null);
        setCorrigiendo((actual) => (actual === projectId ? null : actual));
        setMessages((prev) => { const next = { ...prev }; delete next[projectId]; return next; });
        void refreshAll().then(() => setJustSent(new Set()));
        // La tarjeta se va de "Nuevas" al instante; sin esto el envío parecía no pasar.
        void showMessage({ title: t("sentTitle"), description: t("sentNote"), tone: "success" });
        return;
      }
      const j = await res.json().catch(() => ({}));
      void showMessage({ title: errorTitle, description: j.error ?? t("sendProposalError"), tone: "danger" });
    } catch {
      void showMessage({ title: errorTitle, description: t("sendProposalError"), tone: "danger" });
    } finally {
      setSubmitting(null);
    }
  }

  // Una respuesta no se edita, se retira: se borra y la solicitud vuelve a
  // Nuevas, así el profesional puede responder otra vez sin que al cliente le
  // cambie bajo los pies lo que ya leyó. Solo mientras siga pendiente.
  async function retirarRespuesta(propuesta: MyProposal) {
    const { confirmed } = await confirm({
      title: t("withdrawTitle"),
      description: t("withdrawBody"),
      confirmLabel: t("withdrawConfirm"),
      tone: "danger",
    });
    if (!confirmed) return;
    setRetirando(propuesta.id);
    try {
      const res = await fetch(`/api/proposals?id=${propuesta.id}`, { method: "DELETE" });
      if (!res.ok) {
        await showMessage({ title: t("withdrawErrorTitle"), description: t("withdrawError"), tone: "danger" });
        return;
      }
      setExpandedMine(null);
      setMessages((prev) => ({ ...prev, [propuesta.project_id]: propuesta.message ?? "" }));
      await refreshAll();
      setStage("nuevas");
      setExpandedProject(propuesta.project_id);
      setCorrigiendo(propuesta.project_id);
    } catch {
      await showMessage({ title: t("withdrawErrorTitle"), description: t("withdrawError"), tone: "danger" });
    } finally {
      setRetirando(null);
    }
  }

  // Si el cliente ya te eligió, desaparecer en silencio lo deja esperando: esto
  // avisa con el motivo y su solicitud vuelve a estar abierta para otros.
  async function soltarTrabajo(propuesta: MyProposal) {
    const { confirmed, value } = await confirm({
      title: t("dropTitle"),
      description: t("dropBody"),
      confirmLabel: t("dropConfirm"),
      tone: "danger",
      input: { label: t("dropReasonLabel"), placeholder: t("dropReasonPlaceholder") },
    });
    if (!confirmed) return;
    setRetirando(propuesta.id);
    try {
      const res = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: propuesta.id, action: "withdraw_accepted", reason: value ?? "" }),
      });
      if (!res.ok) {
        await showMessage({ title: t("withdrawErrorTitle"), description: t("withdrawError"), tone: "danger" });
        return;
      }
      setExpandedMine(null);
      await refreshAll();
      await showMessage({ title: t("dropDoneTitle"), description: t("dropDone") });
    } catch {
      await showMessage({ title: t("withdrawErrorTitle"), description: t("withdrawError"), tone: "danger" });
    } finally {
      setRetirando(null);
    }
  }

  function dismissOpportunity(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setExpandedProject((cur) => (cur === id ? null : cur));
  }

  function clientIdentityText(status?: OpenProject["client_identity_status"]): string {
    if (status === "verified") return t("clientIdentityVerified");
    if (status === "pending") return t("clientIdentityPending");
    return t("clientIdentityUnverified");
  }

  // Estado de la solicitud que respondí, en una sola palabra.
  function replyOutcome(p: MyProposal): { label: string; variant: "default" | "muted" | "error" | "success" } | null {
    const ps = p.projects?.status;
    if (p.status === "accepted") return { label: t("projStatus.chosen"), variant: "success" };
    if (ps === "completed") return { label: t("projStatus.completed"), variant: "muted" };
    if (ps === "cancelled") return { label: t("projStatus.cancelled"), variant: "error" };
    return null;
  }

  const rowIconClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb]";
  const metaLabel = "text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68778d]";
  const metaValue = "mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]";

  if (loading) {
    return <PanelListSkeleton rows={3} withTabs hasData={openProjects.length > 0 || myProposals.length > 0} />;
  }

  return (
    <div>
      <div className="mb-4">
        <StatusFilterTabs
          tabs={PROPUESTA_TABS}
          value={stage}
          onChange={(id) => setStage(id as StageKey)}
          labelFor={(id) => tEtapas(id)}
          counts={counts}
        />
      </div>

      {stage === "nuevas" && (
        newList.length === 0 ? (
          <PanelEmptyState icon={Inbox} title={t("emptyBrowse")} description={t("emptyBrowseSub")} />
        ) : (
          <div className="ccr-native-safe-list-end flex flex-col gap-3">
            {newList.map((project) => {
              const isExpanded = expandedProject === project.id;
              const zona = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
              const message = messages[project.id] ?? "";
              return (
                <Card id={`project-${project.id}`} key={project.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all", isExpanded && "shadow-md ring-1 ring-[#cfe9f5]")}>
                  <button
                    type="button"
                    onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                    aria-expanded={isExpanded}
                    className={cn("group flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:p-5", isExpanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                  >
                    <div className={rowIconClass}><Inbox className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2.5">
                        <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{project.title}</span>
                        <ExpandToggle open={isExpanded} className="mt-0 shrink-0" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6b7280]">
                        {project.category_id && (
                          <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-[#68778d]" />{getCategoryLabel(project.category_id, locale)}</span>
                        )}
                        {zona && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#68778d]" />{zona}</span>}
                        <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[#68778d]" />{formatRelativeOrDate(project.created_at, locale)}</span>
                      </div>
                      {!isExpanded && project.description && (
                        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#4b5563]">{project.description}</p>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white">
                      <div className="flex flex-col gap-4 p-4 sm:p-5">
                        {project.description && (
                          <div className="flex items-start gap-2.5">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                            <div className="min-w-0">
                              <p className={metaLabel}>{t("projectDescription")}</p>
                              <ExpandableText text={project.description} lines={8} className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]" />
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-2.5">
                          <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                          <div className="min-w-0">
                            <p className={metaLabel}>{t("verificationLabel")}</p>
                            <p className={metaValue}>{clientIdentityText(project.client_identity_status)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-[#eef2f6] p-4 sm:p-5">
                        <label className="mb-1.5 block text-[15px] font-semibold text-[#162543]">{t("yourMessage")}</label>
                        {corrigiendo === project.id && (
                          <p className="mb-2 rounded-xl bg-[#eaf7fc] px-3 py-2 text-[13px] font-semibold leading-snug text-[#0089bb]">
                            {t("correctingHint")}
                          </p>
                        )}
                        <textarea
                          value={message}
                          onChange={(e) => setMessages((prev) => ({ ...prev, [project.id]: e.target.value.slice(0, MESSAGE_MAX) }))}
                          maxLength={MESSAGE_MAX}
                          placeholder={t("messagePlaceholder")}
                          className="min-h-[120px] w-full resize-none break-words rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-[#162543] placeholder:text-[#68778d] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
                        />
                        {message.length >= MESSAGE_MAX && <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: MESSAGE_MAX })}</p>}
                        <Button onClick={() => sendReply(project.id)} disabled={!message.trim() || submitting === project.id} loading={submitting === project.id} size="sm" className="mt-3 h-11 w-full rounded-full text-[13px] font-bold">
                          {corrigiendo === project.id ? t("sendProposalAgain") : t("sendProposal")}
                        </Button>
                        <button type="button" onClick={() => dismissOpportunity(project.id)} className="mx-auto mt-3 flex items-center gap-1.5 text-[12px] font-medium text-[#68778d] transition-colors hover:text-[#6b7280]">
                          <EyeOff className="h-3.5 w-3.5" /> {t("dismiss")}
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}

      {stage === "respondidas" && (
        myProposals.length === 0 ? (
          <PanelEmptyState icon={Inbox} title={t("emptyMine")} description={t("emptyMineSub")} />
        ) : (
          <div className="ccr-native-safe-list-end flex flex-col gap-3">
            {myProposals.map((p) => {
              const isOpen = expandedMine === p.id;
              const outcome = replyOutcome(p);
              const trabajoVivo = p.projects?.status !== "completed" && p.projects?.status !== "cancelled";
              return (
                <Card id={`project-${p.project_id}`} key={p.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all", isOpen && "shadow-md ring-1 ring-[#cfe9f5]")}>
                  <button
                    type="button"
                    onClick={() => setExpandedMine(isOpen ? null : p.id)}
                    aria-expanded={isOpen}
                    className={cn("group flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:p-5", isOpen ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                  >
                    <div className={rowIconClass}><Inbox className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2.5">
                        <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{p.projects?.title ?? t("projectFallback")}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {outcome && <Badge variant={outcome.variant} className="text-[11px] font-semibold">{outcome.label}</Badge>}
                          <ExpandToggle open={isOpen} className="mt-0" />
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6b7280]">
                        {p.projects?.category_id && (
                          <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-[#68778d]" />{getCategoryLabel(p.projects.category_id, locale)}</span>
                        )}
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#68778d]" />{formatRelativeOrDate(p.created_at, locale)}</span>
                      </div>
                      {!isOpen && p.message && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#4b5563]">{p.message}</p>}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-3.5 rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5">
                      <div className="flex items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                        <div className="min-w-0">
                          <p className={metaLabel}>{t("yourMessageLabel")}</p>
                          <ExpandableText text={p.message} lines={6} className="mt-0.5 min-w-0 text-[13px] leading-relaxed text-[#4b5563]" />
                        </div>
                      </div>
                      {p.status === "pending" && <p className="rounded-xl bg-[#f4f7fa] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#4b5563]">{t("sentNote")}</p>}
                      {p.status === "accepted" && trabajoVivo && (
                        <p className="rounded-xl bg-[#f0fdf4] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#166534]">{t("chosenNote")}</p>
                      )}
                      {/* Con dos cosas, van a la par: la cotización ocupa lo que sobra
                          y el menú se queda a su lado. La cotización solo aparece
                          cuando el cliente ya eligió, no mientras compara: es un
                          documento con número consecutivo, y emitirlo en cada
                          propuesta quema números en trabajos que nunca fueron (el
                          precio ya va en el mensaje). */}
                      {(p.status === "pending" || (p.status === "accepted" && trabajoVivo)) && (
                        <div className="flex items-center gap-2">
                          {p.status === "accepted" && trabajoVivo && (
                            <div className="min-w-0 flex-1">
                              <QuoteBlock asButton projectId={p.project_id} role="pro" canCreate defaultTitle={p.projects?.title ?? undefined} />
                            </div>
                          )}
                          <div className="ml-auto flex shrink-0 items-center">
                          <CardActionsMenu
                            label={t("moreActions")}
                            actions={[p.status === "pending" ? {
                              label: retirando === p.id ? t("withdrawing") : t("withdraw"),
                              onClick: () => { if (retirando !== p.id) void retirarRespuesta(p); },
                              icon: <Pencil className="h-4 w-4" />,
                            } : {
                              label: retirando === p.id ? t("withdrawing") : t("drop"),
                              onClick: () => { if (retirando !== p.id) void soltarTrabajo(p); },
                              destructive: true,
                              icon: <Trash2 className="h-4 w-4" />,
                            }]}
                          />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}
      {dialogNode}
    </div>
  );
}
