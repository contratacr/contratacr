"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Handshake, Phone, MapPin, CalendarClock, CalendarDays, Clock, EyeOff, MoreVertical, Users, Wrench } from "lucide-react";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PriceInput } from "@/components/ui/price-input";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { computeAge } from "@/lib/age";
import { TAX_INCLUDED_SUFFIX, formatColonesTaxIncluded, splitPricingLabel } from "@/lib/pricing";
import { StatusFilterTabs, proposalBucket, proposalStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";

type ProposalStatus = "pending" | "accepted" | "declined";

type MyProposal = {
  id: string;
  project_id: string;
  price?: number;
  message: string;
  status: ProposalStatus;
  created_at: string;
  archived_by_professional?: boolean;
  projects?: {
    title: string;
    status: string;
    category_id?: string | null;
    profiles: { full_name: string; phone?: string; avatar_url?: string };
  };
};

type OpenProject = {
  id: string;
  title: string;
  description: string;
  budget_min?: number;
  budget_max?: number;
  timeline?: string;
  created_at: string;
  category_id?: string | null;
  categories?: { name: string };
  provincias?: { name: string };
  cantones?: { name: string };
  client_identity_status?: "verified" | "pending" | "unverified" | null;
  profiles?: { full_name: string; avatar_url?: string };
  proposals?: { id: string }[];
  for_someone_else?: boolean;
  beneficiary_name?: string | null;
  beneficiary_dob?: string | null;
  beneficiary_is_minor?: boolean;
};

// UN color por significado, no un color por estado: azul de marca = está vivo
// ahora; gris = pasó o está en pausa; rojo = SOLO lo que salió mal (cancelado,
// no seleccionado). Un empleo cerrado suele ser el final feliz — pintarlo de
// rojo lo hacía leer como error, y con todo de colores el color deja de decir.
const STATUS_VARIANT: Record<ProposalStatus, "default" | "muted" | "error"> = {
  pending: "default",
  accepted: "default",
  declined: "error",
};

function projStatusVariant(status?: string): "muted" | "error" | "default" {
  switch (status) {
    case "completed": return "muted";
    case "cancelled": return "error";
    default: return "default";
  }
}

interface ProposalsTabProps {
  categoryId?: string;
  /** The professions on the pro's profile — the "Oportunidades" list can be filtered by
   *  them (the filter only appears when there's more than one). */
  professions?: string[];
  /** The pro's services — used to SURFACE projects whose text matches them. */
  services?: { name?: string }[];
}

const NO_OPEN_PROJECTS: OpenProject[] = [];
const NO_MY_PROPOSALS: MyProposal[] = [];

export function ProposalsTab({ categoryId, professions = [], services = [] }: ProposalsTabProps) {
  const t = useTranslations("proposalsTab");
  const tEtapas = useTranslations("statusTabs");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";

  // Filter "Oportunidades" by profession. "Todas" is the default so the pro sees
  // EVERY open opportunity at once; the per-profession chips (built after the
  // counts, ordered by how many each has, empty ones hidden) refine from there.
  const profLabel = (id: string) => (id === "all" ? t("allServices") : getCategoryLabel(id, locale));
  const showProfFilter = professions.length > 1;

  // Significant words (≥4 chars) from the pro's service names — used to flag
  // projects whose title/description mention what the pro actually offers, and to
  // surface those first. Simple keyword overlap (no auto-routing/notifications).
  const serviceTerms = useMemo(() => {
    const terms = new Set<string>();
    for (const s of services) {
      for (const w of String(s?.name ?? "").toLowerCase().split(/[^a-záéíóúñü0-9]+/i)) {
        if (w.length >= 4) terms.add(w);
      }
    }
    return [...terms];
  }, [services]);
  function matchesServices(p: { title?: string; description?: string }): boolean {
    if (serviceTerms.length === 0) return false;
    const text = `${p.title ?? ""} ${p.description ?? ""}`.toLowerCase();
    return serviceTerms.some((term) => text.includes(term));
  }
  // Project lifecycle label (mirrors solicitudes) shown for an ACCEPTED proposal.
  const projStatusLabel = (status?: string): string => {
    const k = ["in_progress", "awaiting_confirmation", "completed", "cancelled"].includes(status ?? "") ? status! : "accepted";
    return t(`projStatus.${k}`);
  };
  const { user } = useAuth();
  // UNA sola fila de navegación: el embudo completo del profesional, desde la
  // oportunidad sin postular hasta lo que no se concretó. Solo se dibujan las
  // etapas con contenido, así que lo normal son dos o tres pestañas, no cinco.
  // El filtro por servicio es nivel 2 y vive en un chip con hoja, no en una
  // segunda fila que compita con esta.
  type StageKey = "nuevas" | "pendientes" | "en_curso" | "finalizadas";
  const [stage, setStage] = useState<StageKey>("nuevas");
  // Both lists live in the shared cache (same keys the notification prefetch
  // warms): switching tabs or coming back paints them at once, then refreshes.
  // The key ignores `categoryId`: the API matches by the pro's professions and
  // only falls back to that parameter for a profile without any.
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
  const { data: myProposals, setData: setMyProposals } = mineResource;
  const loading = openResource.loading || mineResource.loading;
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedMine, setExpandedMine] = useState<string | null>(null);
  const [proposalForms, setProposalForms] = useState<Record<string, { price: string; message: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  // Projects already proposed to: the server's list, plus what was just sent or
  // withdrawn here (cleared once the refresh that follows lands).
  const [submittedOverrides, setSubmittedOverrides] = useState<Record<string, boolean>>({});
  const submitted = useMemo(() => {
    const next = new Set(myProposals.map((p) => p.project_id));
    for (const [projectId, on] of Object.entries(submittedOverrides)) {
      if (on) next.add(projectId);
      else next.delete(projectId);
    }
    return next;
  }, [myProposals, submittedOverrides]);
  const refreshTimerRef = useRef<number | null>(null);
  const lastSilentRefreshRef = useRef(0);
  const targetProjectRetryRef = useRef(0);
  const targetProjectRef = useRef<string | null>(null);
  const targetProjectHandledRef = useRef(false);
  // Oportunidades browse: which profession is filtered and the locally-dismissed
  // ("No me interesa") opportunities.
  const [profFilter, setProfFilter] = useState<string>("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const stageCounts = useMemo(() => {
    const buckets = bucketCounts(myProposals.map((item) => proposalBucket(item.status, item.projects?.status)));
    const nuevas = openProjects.filter((item) => !submitted.has(item.id) && !dismissed.has(item.id)).length;
    const counts: Record<string, number> = { ...buckets, nuevas };
    return counts;
  }, [myProposals, openProjects, submitted, dismissed]);

  // El modelo compartido ya separa "pendientes" de "en_curso": la etapa de una
  // propuesta es directamente su cubeta.
  const fineStage = useCallback(
    (proposalStatus: string, projectStatus?: string | null) => proposalBucket(proposalStatus, projectStatus),
    [],
  );

  // Orden de línea de tiempo: sin postular → esperando → trabajando → terminó
  // → no pasó. Las cuatro últimas son las mismas de solicitudes y proyectos.
  const stageDefs = useMemo(() => [
    { key: "nuevas", label: t("tabNew") },
    { key: "pendientes", label: tEtapas("enviadas") },
    { key: "en_curso", label: tEtapas("en_curso") },
    { key: "finalizadas", label: tEtapas("finalizadas") },
  ], [locale]);

  // "Nuevas" siempre está (es la puerta a las oportunidades); las etapas de tus
  // propuestas solo aparecen cuando tienen algo.
  const availableStages = useMemo(
    () => stageDefs.filter((group) => group.key === "nuevas" || (stageCounts[group.key] ?? 0) > 0),
    [stageDefs, stageCounts],
  );
  const effectiveStage = (availableStages.some((group) => group.key === stage)
    ? stage
    : (availableStages[0]?.key ?? "nuevas")) as StageKey;
  const stageLabel = (id: string) => stageDefs.find((group) => group.key === id)?.label ?? id;

  // The active profession resolves AFTER profTabs (first = most opportunities).
  // Count of AVAILABLE opportunities per profession (excludes proposed/dismissed) → the
  // count badge on each filter tab.
  const profCounts = useMemo(() => {
    const visibles = openProjects
      .filter((p) => !submitted.has(p.id) && !dismissed.has(p.id))
      .map((p) => p.category_id ?? null);
    const counts: Record<string, number> = Object.fromEntries(professions.map((p) => [p, visibles.filter((id) => id === p).length]));
    counts.all = visibles.length;
    return counts;
  }, [openProjects, submitted, dismissed, professions]);

  const profTabs = useMemo(() => {
    const conDatos = professions.filter((p) => (profCounts[p] ?? 0) > 0);
    conDatos.sort((a, b) => (profCounts[b] ?? 0) - (profCounts[a] ?? 0));
    return [{ id: "all" }, ...conDatos.map((p) => ({ id: p }))];
  }, [professions, profCounts]);

  // The chosen profession, else the FIRST chip (the one with most opportunities).
  const activeProf = professions.includes(profFilter) ? profFilter : "all";

  // Re-fetch quietly; cached rows stay on screen until the answer lands.
  const refreshOpen = openResource.refresh;
  const refreshMine = mineResource.refresh;
  async function fetchOpenProjects() {
    await Promise.all([refreshOpen(), refreshMine()]);
  }
  async function fetchMyProposals() {
    await refreshMine();
  }

  const refreshSoon = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 1600 ? 1600 - elapsed : 700;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      void fetchOpenProjects().then(() => setSubmittedOverrides({}));
      void fetchMyProposals();
    }, delay);
    // fetchOpenProjects/fetchMyProposals are intentionally not dependencies; their
    // inputs are read from the current render and refreshed again by polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const projectId = searchParams.get("project");
    if (!projectId) return;
    if (targetProjectRef.current !== projectId) {
      targetProjectRef.current = projectId;
      targetProjectRetryRef.current = 0;
      targetProjectHandledRef.current = false;
    }
    if (targetProjectHandledRef.current) return;

    const mine = myProposals.find((p) => p.project_id === projectId);
    if (mine) {
      targetProjectRetryRef.current = 0;
      targetProjectHandledRef.current = true;
      const id = window.setTimeout(() => {
        setStage(fineStage(mine.status, mine.projects?.status) as StageKey);
        setExpandedMine(mine.id);
        window.setTimeout(() => document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
      }, 0);
      return () => window.clearTimeout(id);
    }

    const open = openProjects.find((p) => p.id === projectId);
    if (open) {
      targetProjectRetryRef.current = 0;
      targetProjectHandledRef.current = true;
      const id = window.setTimeout(() => {
        setStage("nuevas");
        if (open.category_id && professions.includes(open.category_id)) setProfFilter(open.category_id);
        setDismissed((prev) => {
          if (!prev.has(projectId)) return prev;
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
        setExpandedProject(projectId);
        window.setTimeout(() => document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 160);
      }, 0);
      return () => window.clearTimeout(id);
    }

    if (targetProjectRetryRef.current >= 8) return;
    targetProjectRetryRef.current += 1;
    const id = window.setTimeout(() => {
      void fetchOpenProjects().then(() => setSubmittedOverrides({}));
      void fetchMyProposals();
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProposals, openProjects, searchParams]);

  async function submitProposal(projectId: string) {
    const form = proposalForms[projectId];
    if (!form?.message?.trim()) return;

    setSubmitting(projectId);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          price: form.price || null,
          message: form.message,
        }),
      });
      // 409 = a proposal already exists for this project, so treat it as sent.
      if (res.ok || res.status === 409) {
        setSubmittedOverrides((prev) => ({ ...prev, [projectId]: true }));
        setExpandedProject(null);
        setProposalForms((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        void fetchOpenProjects().then(() => setSubmittedOverrides({}));
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

  // Mis propuestas is a collapsible accordion (sprint 449) — same card language as the
  // other panel sections (one open at a time).
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ price: string; message: string }>({ price: "", message: "" });
  // Withdraw-a-proposal clean confirm modal (replaces the old browser confirm()).
  const [withdrawTarget, setWithdrawTarget] = useState<MyProposal | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [actionsMenuFor, setActionsMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (!actionsMenuFor) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(`[data-proposal-actions="${actionsMenuFor}"]`)) setActionsMenuFor(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsMenuFor(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsMenuFor]);

  function startEdit(p: MyProposal) {
    setEditing(p.id);
    setEditForm({ price: p.price ? String(p.price) : "", message: p.message });
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, price: editForm.price || null, message: editForm.message }),
    });
    if (res.ok) {
      setMyProposals((prev) => prev.map((p) => (p.id === id ? { ...p, price: editForm.price ? Number(editForm.price) : undefined, message: editForm.message } : p)));
      setEditing(null);
    }
  }

  // Withdraw (retirar) a sent proposal — confirmed via a clean on-brand modal, not a
  // browser confirm(). Deletes the proposal so the client no longer sees it.
  async function confirmWithdraw() {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    const res = await fetch(`/api/proposals?id=${withdrawTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setMyProposals((prev) => prev.filter((p) => p.id !== withdrawTarget.id));
      // Retiring frees the opportunity: drop it from the "already-proposed" set so it
      // reappears in Oportunidades (the browse list hides only still-proposed projects,
      // and refetches mine=true on every switch back, so the project is available again).
      setSubmittedOverrides((prev) => ({ ...prev, [withdrawTarget.project_id]: false }));
      setDismissed((prev) => {
        if (!prev.has(withdrawTarget.project_id)) return prev;
        const next = new Set(prev);
        next.delete(withdrawTarget.project_id);
        return next;
      });
      setStage("nuevas");
      const opportunity = openProjects.find((project) => project.id === withdrawTarget.project_id);
      if (opportunity?.category_id && professions.includes(opportunity.category_id)) setProfFilter(opportunity.category_id);
      void fetchOpenProjects().then(() => setSubmittedOverrides({}));
    }
    setWithdrawing(false);
    setWithdrawTarget(null);
  }

  async function markWorkDone(projectId: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, action: "work_done" }),
    });
    if (res.ok) {
      setMyProposals((prev) =>
        prev.map((p) => (p.project_id === projectId && p.projects ? { ...p, projects: { ...p.projects, status: "awaiting_confirmation" } } : p))
      );
    } else {
      const j = await res.json().catch(() => ({}));
      void showMessage({ title: errorTitle, description: j.error ?? t("markWorkDoneError"), tone: "danger" });
    }
  }

  function updateForm(projectId: string, field: "price" | "message", value: string) {
    setProposalForms((prev) => ({
      ...prev,
      [projectId]: { ...(prev[projectId] ?? { price: "", message: "" }), [field]: value },
    }));
  }

  const inputClass =
    "w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  // "No me interesa": locally hide an opportunity, persisted per browser (no backend).
  const DISMISS_KEY = "cc_opps_dismissed";
  useEffect(() => {
    queueMicrotask(() => {
      try { const raw = localStorage.getItem(DISMISS_KEY); if (raw) setDismissed(new Set(JSON.parse(raw))); } catch {}
    });
  }, []);
  function dismissOpportunity(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setExpandedProject((cur) => (cur === id ? null : cur));
  }

  // Relative time → "hace 30 minutos" / "hace 2 horas" / "hace 3 días", then the actual
  // DATE once it's ~1 week old (shared helper, sprint 528).
  function relativeTime(iso: string): string {
    return formatRelativeOrDate(iso, locale);
  }
  function budgetTextFor(p: OpenProject): string {
    if (p.budget_min && p.budget_max) return t("range", { min: `₡${p.budget_min.toLocaleString("es-CR")}`, max: `₡${p.budget_max.toLocaleString("es-CR")}` });
    if (p.budget_min) return t("from", { amount: `₡${p.budget_min.toLocaleString("es-CR")}` });
    if (p.budget_max) return t("upTo", { amount: `₡${p.budget_max.toLocaleString("es-CR")}` });
    return t("budgetTBD");
  }

  async function archiveProposal(id: string) {
    const res = await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "archive" }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("archiveError"), tone: "danger" });
      return;
    }
    setMyProposals((prev) => prev.filter((p) => p.id !== id));
    if (expandedMine === id) setExpandedMine(null);
  }
  function hasBudget(p: OpenProject): boolean {
    return Boolean(p.budget_min || p.budget_max);
  }
  function clientIdentityText(status?: OpenProject["client_identity_status"]): string {
    if (status === "verified") return t("clientIdentityVerified");
    if (status === "pending") return t("clientIdentityPending");
    return t("clientIdentityUnverified");
  }
  function ageLabel(dob?: string | null) {
    const age = dob ? computeAge(dob) : null;
    if (!age) return null;
    if (age.years > 0) return t("yearsOld", { count: age.years });
    const months = Math.max(1, age.months);
    return t("monthsOld", { count: months });
  }

  // Expanded opportunity content: only what is NOT already present in the
  // closed summary card. Summary owns title, budget, and service. Expanded owns
  // zone/timeline/published context, description, client identity status and actions.
  function renderDetail(project: OpenProject) {
    const alreadySubmitted = submitted.has(project.id);
    const form = proposalForms[project.id] ?? { price: "", message: "" };
    const zona = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
    return (
      <div className="flex flex-col">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {(zona || project.timeline) && (
            <div className="flex flex-col gap-2">
              {zona && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldZone")}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{zona}</p>
                  </div>
                </div>
              )}
              {project.timeline && (
                <div className="flex items-start gap-2.5">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldDeadline")}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{project.timeline}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {project.description && (
            <div className="flex items-start gap-2.5">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("projectDescription")}</p>
                <ExpandableText text={project.description} lines={6} className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]" />
              </div>
            </div>
          )}

          {project.profiles?.full_name && (
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("verificationLabel")}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]">
                  {clientIdentityText(project.client_identity_status)}
                </p>
              </div>
            </div>
          )}

          {project.for_someone_else && (
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("projectForLabel")}</p>
                <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{project.beneficiary_name || t("otherPerson")}</p>
                {ageLabel(project.beneficiary_dob) && (
                  <p className="mt-0.5 text-[12px] text-[#6b7280]">{t("fieldAge")} {ageLabel(project.beneficiary_dob)}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldPublished")}</p>
              <p className="mt-0.5 text-[13px] font-medium text-[#374151]">{relativeTime(project.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-[#eef2f6] p-4 sm:p-5">
          {alreadySubmitted ? (
            <p className="text-center text-[13px] text-[#6b7280]">{t("alreadyProposedNote")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#374151]">{t("yourPrice")} <span className="font-normal text-[#6b7280]">{t("optional")}</span></label>
                <PriceInput value={form.price} onChange={(v) => updateForm(project.id, "price", v)} suffix={TAX_INCLUDED_SUFFIX} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#374151]">{t("yourMessage")} <span className="text-red-500">*</span></label>
                <textarea value={form.message} onChange={(e) => updateForm(project.id, "message", e.target.value)} maxLength={500} className={`${inputClass} min-h-[100px] resize-none`} />
                {form.message.length >= 500 && <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: 500 })}</p>}
              </div>
              <Button onClick={() => submitProposal(project.id)} disabled={!form.message.trim() || submitting === project.id} loading={submitting === project.id} className="w-full rounded-lg">{t("sendProposal")}</Button>
              <button type="button" onClick={() => dismissOpportunity(project.id)} className="mx-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:text-[#6b7280]">
                <EyeOff className="h-3.5 w-3.5" /> {t("dismiss")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    const hasLoadedItems = openProjects.length > 0 || myProposals.length > 0;
    return <PanelListSkeleton rows={3} withTabs hasData={hasLoadedItems} />;
  }

  return (
    <div>
      {/* El servicio encabeza "Nuevas", donde la lista puede pasar de quince. En
          las etapas de tus propias propuestas el servicio se lee en la tarjeta. */}
      {effectiveStage === "nuevas" && showProfFilter && profTabs.length > 2 && (
        <div className="mb-3">
          <StatusFilterTabs tabs={profTabs} value={activeProf} onChange={setProfFilter} labelFor={profLabel} counts={profCounts} variant="chips" />
        </div>
      )}

      {/* El embudo completo en una sola fila. */}
      {availableStages.length > 0 && (
        <div className="mb-4">
          <StatusFilterTabs
            tabs={availableStages.map((group) => ({ id: group.key }))}
            value={effectiveStage}
            onChange={(id) => setStage(id as StageKey)}
            labelFor={stageLabel}
            counts={stageCounts}
          />
        </div>
      )}

      {/* Nuevas — oportunidades abiertas sin propuesta */}
      {effectiveStage === "nuevas" && (
        <div>
          {openProjects.length === 0 ? (
            <PanelEmptyState icon={Handshake} title={t("emptyBrowse")} description={t("emptyBrowseSub")} />
          ) : (
            <div className="flex flex-col gap-4">
              {(() => {
                // Hide opportunities already proposed to (they live in "Mis propuestas") and
                // ones the pro dismissed; show the active profession's projects (+ uncategorized,
                // visible to everyone); surface service matches first.
                const list = openProjects
                  .filter((p) => !submitted.has(p.id) && !dismissed.has(p.id))
                  .filter((p) => activeProf === "all" || !p.category_id || p.category_id === activeProf)
                  .sort((a, b) => Number(matchesServices(b)) - Number(matchesServices(a)));
                if (list.length === 0) return <p className="text-sm text-[#6b7280] text-center py-12">{t("noneInView")}</p>;
                return (
                  <div className="ccr-native-safe-list-end flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[13px] font-semibold text-[#162543]">{t("availableTitle")}</p>
                    </div>
                    {list.map((project) => {
                      const isExpanded = expandedProject === project.id;
                      return (
                        <Card id={`project-${project.id}`} key={project.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", isExpanded && "shadow-md ring-1 ring-[#d8eef8]")}>
                          <button
                            type="button"
                            onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                            aria-expanded={isExpanded}
                            className={cn("group flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:p-5", isExpanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
                              <Handshake className="h-[18px] w-[18px]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2.5">
                                <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{project.title}</span>
                                <ExpandToggle open={isExpanded} className="mt-0 shrink-0" />
                              </div>
                              <div className="mt-2 flex flex-col items-start gap-1.5 text-[13px]">
                                {project.category_id && (
                                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#374151]">
                                    <Wrench className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                    <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldService")}</span> <span className="text-[#374151]">{getCategoryLabel(project.category_id, locale)}</span></span>
                                  </span>
                                )}
                                <span className="inline-flex w-full max-w-full items-center text-[#374151]">
                                  <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldBudget")}</span> <span className={hasBudget(project) ? "font-semibold text-[#111827]" : "text-[#374151]"}>{budgetTextFor(project)}</span></span>
                                </span>
                              </div>
                            </div>
                          </button>
                          {isExpanded && <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white">{renderDetail(project)}</div>}
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Propuestas por etapa */}
      {effectiveStage !== "nuevas" && (
        <div>
          {myProposals.length === 0 ? (
            <PanelEmptyState icon={Handshake} title={t("emptyMine")} description={t("emptyMineSub")} />
          ) : (
            <div className="ccr-native-safe-list-end flex flex-col gap-4">
              {(() => {
                // Orden por prioridad de acción: lo que exige trabajo primero,
                // lo anterior al final. Un grupo vacío no se dibuja; con un chip
                // activo se muestra solo esa etapa (sin encabezado redundante).
                const grouped = new Map<string, typeof myProposals>();
                for (const item of myProposals) {
                  const key = fineStage(item.status, item.projects?.status);
                  const list = grouped.get(key) ?? [];
                  list.push(item);
                  grouped.set(key, list);
                }
                const visibleGroups = availableStages.filter((group) => group.key === effectiveStage);
                if (visibleGroups.length === 0) return <p className="text-sm text-[#6b7280] text-center py-8">{t("noneInView")}</p>;
                return visibleGroups.map((group) => (
                  <section key={group.key} className="flex flex-col gap-3">
                    {(grouped.get(group.key) ?? []).map((p) => {
                  const isOpen = expandedMine === p.id;
                  const ps = p.projects?.status;
                  const phone = p.projects?.profiles?.phone;
                  const clientName = p.projects?.profiles?.full_name;
                  const canMarkCompleted = p.status === "accepted" && ps === "in_progress";
                  const sentDate = formatRelativeOrDate(p.created_at, locale);
                  const proposalPriceParts = p.price ? splitPricingLabel(formatColonesTaxIncluded(p.price)) : null;
                  return (
                    <Card id={`project-${p.project_id}`} key={p.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", isOpen && "shadow-md ring-1 ring-[#d8eef8]")}>
                      {/* COLLAPSED header — client avatar + project title (primary) + a status chip
                          (a SENT proposal genuinely IS "Pendiente" until the client decides — unlike
                          auto-confirm bookings — so that badge is kept here); key fact = YOUR price; a
                          2-line message preview while collapsed. Same card language as the rest. */}
                      <button
                        type="button"
                        onClick={() => setExpandedMine(isOpen ? null : p.id)}
                        aria-expanded={isOpen}
                        className={cn("group w-full text-left p-4 sm:p-5 flex items-start gap-3.5 hover:bg-[#f9fbfd] transition-colors", isOpen ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
                          <Handshake className="h-[18px] w-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2.5">
                            <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{p.projects?.title ?? t("projectFallback")}</span>
                            {p.status !== "pending" && !canMarkCompleted && !proposalStatusRedundant(p.status, ps) && (
                              p.status === "accepted" ? (
                                <Badge variant={projStatusVariant(ps)} className="shrink-0 text-[11px] font-semibold">{projStatusLabel(ps)}</Badge>
                              ) : (
                                <Badge variant={STATUS_VARIANT[p.status]} className="shrink-0 text-[11px] font-semibold">{t(`status.${p.status}`)}</Badge>
                              )
                            )}
                          </div>
                          <div className="mt-2 flex flex-col items-start gap-1.5 text-[13px]">
                            <span className="inline-flex w-full max-w-full items-center text-[#374151]">
                              <span className="truncate font-semibold">
                                <span className="font-medium text-[#9ca3af]">{t("yourPriceLabel")}</span>{" "}
                                <span className={proposalPriceParts ? "text-[#111827]" : "text-[#374151]"}>
                                  {proposalPriceParts ? (
                                    <>
                                      {proposalPriceParts.amount}
                                      <span className="ml-1 text-[10px] font-semibold tracking-wide text-[#9ca3af]">{proposalPriceParts.taxSuffix}</span>
                                    </>
                                  ) : t("priceTBD")}
                                </span>
                              </span>
                            </span>
                          </div>
                        </div>
                        <ExpandToggle open={isOpen} />
                      </button>

                      {isOpen && (
                        <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5 flex flex-col gap-3.5">
                          {(clientName || sentDate) && (
                            <div className="flex flex-col gap-2">
                              {clientName && (
                                <div className="flex items-start gap-2.5">
                                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("clientInfo")}</p>
                                    <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{clientName}</p>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-start gap-2.5">
                                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldSent")}</p>
                                  <p className="mt-0.5 text-[13px] font-medium text-[#374151]">{sentDate}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {p.message && (
                            <div className="flex items-start gap-2.5">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("yourMessage")}</p>
                                <ExpandableText text={p.message} lines={2} className="mt-0.5 min-w-0 text-[13px] leading-relaxed text-[#4b5563]" />
                              </div>
                            </div>
                          )}
                          {/* Client contact — revealed once the proposal is accepted (still active). */}
                          {p.status === "accepted" && ps !== "cancelled" && phone && (
                            <div>
                              <div className="flex items-start gap-2.5">
                                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldPhone")}</p>
                                  <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{phone}</p>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* Client cancelled the request after accepting → tell the pro (no actions). */}
                          {p.status === "accepted" && ps === "cancelled" && (
                            <div className="rounded-lg bg-[#fef2f2] border border-[#fee2e2] px-2.5 py-1.5">
                              <p className="text-[11px] font-semibold text-[#b91c1c]">{t("clientCancelled")}</p>
                            </div>
                          )}

                          {/* Frequent actions stay visible. Destructive and archival actions use overflow. */}
                          {(() => {
                            const actions: ReactNode[] = [];
                            const secondaryActions: ReactNode[] = [];
                            const actionButtonClass = "h-10 w-full rounded-lg px-3 text-sm font-bold sm:min-w-[10rem] sm:flex-1";
                            if (p.status === "pending") {
                              actions.push(<Button key="edit" size="sm" variant="outline" className={actionButtonClass} onClick={() => startEdit(p)}>{t("editProposal")}</Button>);
                              secondaryActions.push(<button key="withdraw" role="menuitem" type="button" className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50" onClick={() => { setActionsMenuFor(null); setWithdrawTarget(p); }}>{t("withdraw")}</button>);
                            } else if (p.status === "accepted") {
                              if (ps !== "cancelled") {
                                actions.push(
                                  <DirectChatLauncher key="chat" proposalId={p.id} professionalName={clientName || (locale === "en" ? "Client" : "Cliente")} contextTitle={p.projects?.title} buttonLabel={t("openChat")} openDirectly initialMessage={t("proposalChatGreeting", { title: p.projects?.title || t("projectFallback") })} tone={canMarkCompleted ? "contrast" : "primary"} compact className={`${actionButtonClass} disabled:cursor-wait`} />
                                );
                              }
                              if (canMarkCompleted) actions.push(<Button key="done" size="sm" className={actionButtonClass} onClick={() => markWorkDone(p.project_id)}>{t("markCompleted")}</Button>);
                            }
                            if (p.status === "declined" || ps === "cancelled") {
                              secondaryActions.push(<button key="archive" role="menuitem" type="button" className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]" onClick={() => { setActionsMenuFor(null); archiveProposal(p.id); }}>{t("archive")}</button>);
                            }
                            if (actions.length === 0 && secondaryActions.length === 0) return null;
                            return (
                              <div className="flex items-start gap-2 border-t border-[#eef2f6] pt-3">
                                {actions.length > 0 && <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap">{actions}</div>}
                                {secondaryActions.length > 0 && (
                                  <div className="relative ml-auto shrink-0" data-proposal-actions={p.id}>
                                    <button type="button" aria-label={t("moreOptions")} aria-haspopup="menu" aria-expanded={actionsMenuFor === p.id} onClick={() => setActionsMenuFor((current) => current === p.id ? null : p.id)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d7e1ea] text-[#718096] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] hover:text-[#162543] [.ccr-native-app_&]:h-11 [.ccr-native-app_&]:w-11">
                                      <MoreVertical className="h-5 w-5" />
                                    </button>
                                    {actionsMenuFor === p.id && <div role="menu" className="absolute bottom-[calc(100%+6px)] right-0 z-50 max-h-[calc(100dvh-2rem)] w-48 overflow-y-auto rounded-xl border border-[#dfe8f0] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]">{secondaryActions}</div>}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Inline edit form (pending only) */}
                          {editing === p.id && (
                            <div className="mt-2 pt-3 border-t border-[#f3f4f6] flex flex-col gap-3">
                              <div>
                                <label className="text-xs font-medium text-[#374151] block mb-1.5">{t("yourPrice")} <span className="text-[#6b7280] font-normal">{t("optional")}</span></label>
                                <PriceInput placeholder={t("pricePlaceholder")} value={editForm.price} onChange={(v) => setEditForm((f) => ({ ...f, price: v }))} suffix={TAX_INCLUDED_SUFFIX} />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-[#374151] block mb-1.5">{t("yourMessage")} <span className="text-red-500">*</span></label>
                                <textarea
                                  value={editForm.message}
                                  onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))}
                                  maxLength={500}
                                  className={`${inputClass} min-h-[90px] resize-none`}
                                />
                                {editForm.message.length >= 500 && (
                                  <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: 500 })}</p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveEdit(p.id)} disabled={!editForm.message.trim()}>{t("save")}</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                    })}
                  </section>
                ));
              })()}
            </div>
          )}
        </div>
      )}
      {dialogNode}

      {/* WITHDRAW proposal — clean on-brand confirm modal (replaces window.confirm). */}
      {withdrawTarget && (
        <Modal
          onClose={() => { if (!withdrawing) setWithdrawTarget(null); }}
          title={t("withdrawTitle")}
          size="sm"
          mobilePresentation="center"
          footerClassName="justify-center sm:justify-end"
          footer={(
            <>
              <Button variant="outline" size="sm" className="flex-1 rounded-lg sm:flex-none" onClick={() => setWithdrawTarget(null)} disabled={withdrawing}>{t("back")}</Button>
              <Button size="sm" className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 sm:flex-none" onClick={confirmWithdraw} disabled={withdrawing} loading={withdrawing}>{t("withdrawConfirm")}</Button>
            </>
          )}
        >
          <p className="text-sm leading-6 text-[#6b7280]">{t("withdrawBody")}</p>
        </Modal>
      )}
    </div>
  );
}
