"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Handshake, Phone, MapPin, CalendarClock, CalendarDays, Clock, EyeOff, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PriceInput } from "@/components/ui/price-input";
import { cn, getWhatsAppLink, formatRelativeOrDate } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { computeAge } from "@/lib/age";
import { TAX_INCLUDED_SUFFIX, formatColonesTaxIncluded, splitPricingLabel } from "@/lib/pricing";
import { StatusFilterTabs, PROYECTO_TABS, proposalMatches, proposalBucket, proposalStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { useAppDialog } from "@/hooks/use-app-dialog";

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

const STATUS_VARIANT: Record<ProposalStatus, "default" | "success" | "error"> = {
  pending: "default",
  accepted: "success",
  declined: "error",
};

function projStatusVariant(status?: string): "warning" | "success" | "error" | "default" {
  switch (status) {
    case "completed": return "success";
    case "cancelled": return "error";
    case "in_progress": return "default";
    case "awaiting_confirmation": return "default";
    default: return "success";
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

export function ProposalsTab({ categoryId, professions = [], services = [] }: ProposalsTabProps) {
  const t = useTranslations("proposalsTab");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";

  // Filter "Oportunidades" by profession — the user's ACTUAL professions only (no "all"
  // option); only surfaced when they have 2+ (defaults to the first profession).
  const profTabs = useMemo(() => professions.map((p) => ({ id: p })), [professions]);
  const profLabel = (id: string) => getCategoryLabel(id, locale);
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
  const [view, setView] = useState<"browse" | "mine">("browse");
  const [openProjects, setOpenProjects] = useState<OpenProject[]>([]);
  const [myProposals, setMyProposals] = useState<MyProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedMine, setExpandedMine] = useState<string | null>(null);
  const [proposalForms, setProposalForms] = useState<Record<string, { price: string; message: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState("activas");
  const openSnapshotRef = useRef("");
  const mineSnapshotRef = useRef("");
  const refreshTimerRef = useRef<number | null>(null);
  const lastSilentRefreshRef = useRef(0);
  const targetProjectRetryRef = useRef(0);
  const targetProjectRef = useRef<string | null>(null);
  const targetProjectHandledRef = useRef(false);
  // Oportunidades browse: which profession is filtered and the locally-dismissed
  // ("No me interesa") opportunities.
  const [profFilter, setProfFilter] = useState<string>("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // The active profession (no "all"): the chosen one, else the first profession.
  const activeProf = professions.includes(profFilter) ? profFilter : (professions[0] ?? "");
  // Count of AVAILABLE opportunities per profession (excludes proposed/dismissed) → the
  // count badge on each filter tab.
  const profCounts = useMemo(() => {
    const visible = openProjects.filter((p) => !submitted.has(p.id) && !dismissed.has(p.id));
    return Object.fromEntries(professions.map((p) => [p, visible.filter((o) => o.category_id === p).length]));
  }, [openProjects, submitted, dismissed, professions]);

  async function fetchOpenProjects(silent = false) {
    try {
      if (!silent) setLoading(true);
      const url = `/api/projects?role=professional${categoryId ? `&category=${categoryId}` : ""}`;
      const [projRes, mineRes] = await Promise.all([
        fetch(url, { cache: "no-store" }),
        fetch("/api/proposals?mine=true", { cache: "no-store" }),
      ]);
      const { projects } = await projRes.json();
      const { proposals } = await mineRes.json().catch(() => ({ proposals: [] }));
      const nextProjects = (projects ?? []) as OpenProject[];
      const nextProposals = (proposals ?? []) as MyProposal[];
      const snapshot = JSON.stringify(nextProjects.map((p: OpenProject) => `${p.id}:${p.created_at}`));
      openSnapshotRef.current = snapshot;
      setOpenProjects(nextProjects);
      setMyProposals(nextProposals);
      setSubmitted(new Set<string>(nextProposals.map((p) => p.project_id)));
    } catch (error) {
      console.error("[proposals-tab] opportunities load failed:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function fetchMyProposals(silent = false) {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/proposals?mine=true", { cache: "no-store" });
      const { proposals } = await res.json();
      const nextProposals = (proposals ?? []) as MyProposal[];
      const snapshot = JSON.stringify(nextProposals.map((p: MyProposal) => `${p.id}:${p.status}:${p.projects?.status ?? ""}`));
      mineSnapshotRef.current = snapshot;
      setMyProposals(nextProposals);
    } catch (error) {
      console.error("[proposals-tab] my proposals load failed:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const refreshSoon = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 900 ? 900 - elapsed : 350;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      if (view === "browse") void fetchOpenProjects(true);
      else void fetchMyProposals(true);
    }, delay);
    // fetchOpenProjects/fetchMyProposals are intentionally not dependencies; their
    // inputs are read from the current render through `view` and refreshed again by polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    queueMicrotask(() => {
      if (view === "browse") fetchOpenProjects();
      else fetchMyProposals();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, categoryId]);

  useEffect(() => {
    if (loading) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        if (view === "browse") void fetchOpenProjects(true);
        else void fetchMyProposals(true);
      }
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loading]);

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

  // SILENTLY revalidate when the pro returns to the tab/window — so a project the client
  // cancelled/deleted updates in the background, WITHOUT a jarring reload. The `silent` flag
  // skips the loading state, so the current view (selection, expanded card, scroll) is
  // preserved on refocus (the old non-silent refetch flashed the whole list as "loading").
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "visible") {
        if (view === "browse") fetchOpenProjects(true); else fetchMyProposals(true);
      }
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
        setView("mine");
        setProjectFilter(proposalBucket(mine.status, mine.projects?.status));
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
        setView("browse");
        if (open.category_id && professions.includes(open.category_id)) setProfFilter(open.category_id);
        setDismissed((prev) => {
          if (!prev.has(projectId)) return prev;
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
        setProjectFilter("activas");
        setExpandedProject(projectId);
        window.setTimeout(() => document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 160);
      }, 0);
      return () => window.clearTimeout(id);
    }

    if (targetProjectRetryRef.current >= 8) return;
    targetProjectRetryRef.current += 1;
    const id = window.setTimeout(() => {
      void fetchOpenProjects(true);
      void fetchMyProposals(true);
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
        setSubmitted((prev) => new Set([...prev, projectId]));
        setExpandedProject(null);
        setProposalForms((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        void Promise.all([fetchOpenProjects(true), fetchMyProposals(true)]);
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
      setSubmitted((prev) => { const next = new Set(prev); next.delete(withdrawTarget.project_id); return next; });
      setDismissed((prev) => {
        if (!prev.has(withdrawTarget.project_id)) return prev;
        const next = new Set(prev);
        next.delete(withdrawTarget.project_id);
        return next;
      });
      setProjectFilter("activas");
      const opportunity = openProjects.find((project) => project.id === withdrawTarget.project_id);
      if (opportunity?.category_id && professions.includes(opportunity.category_id)) setProfFilter(opportunity.category_id);
      void fetchOpenProjects(true);
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
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* Sub-nav */}
      <div className="flex gap-1 bg-[#f3f4f6] rounded-xl p-1 mb-6">
        {(["browse", "mine"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
              view === v ? "bg-white text-[#009FD9] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
            )}
          >
            {v === "browse" ? t("browse") : t("mine")}
          </button>
        ))}
      </div>

      {/* Browse open projects */}
      {view === "browse" && (
        <div>
          {openProjects.length === 0 ? (
            <div className="text-center py-16">
              <Handshake className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-medium text-[#374151]">{t("emptyBrowse")}</p>
              <p className="text-sm text-[#6b7280] mt-1">{t("emptyBrowseSub")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Filter by the pro's professions — only when they have more than one. */}
              {showProfFilter && (
                <StatusFilterTabs tabs={profTabs} value={activeProf} onChange={setProfFilter} labelFor={profLabel} counts={profCounts} />
              )}
              {(() => {
                // Hide opportunities already proposed to (they live in "Mis propuestas") and
                // ones the pro dismissed; show the active profession's projects (+ uncategorized,
                // visible to everyone); surface service matches first.
                const list = openProjects
                  .filter((p) => !submitted.has(p.id) && !dismissed.has(p.id))
                  .filter((p) => !p.category_id || p.category_id === activeProf)
                  .sort((a, b) => Number(matchesServices(b)) - Number(matchesServices(a)));
                if (list.length === 0) return <p className="text-sm text-[#6b7280] text-center py-12">{t("noneInView")}</p>;
                return (
                  <div className="flex flex-col gap-3">
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

      {/* My proposals */}
      {view === "mine" && (
        <div>
          {myProposals.length === 0 ? (
            <div className="text-center py-16">
              <Handshake className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-medium text-[#374151]">{t("emptyMine")}</p>
              <p className="text-sm text-[#6b7280] mt-1">{t("emptyMineSub")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <StatusFilterTabs tabs={PROYECTO_TABS} value={projectFilter} onChange={setProjectFilter} counts={bucketCounts(myProposals.map((p) => proposalBucket(p.status, p.projects?.status)))} />
              {(() => {
                const shown = myProposals.filter((p) => proposalMatches(projectFilter, p.status, p.projects?.status));
                if (shown.length === 0) return <p className="text-sm text-[#6b7280] text-center py-8">{t("noneInView")}</p>;
                return shown.map((p) => {
                  const isOpen = expandedMine === p.id;
                  const ps = p.projects?.status;
                  const phone = p.projects?.profiles?.phone;
                  const clientName = p.projects?.profiles?.full_name;
                  const canMarkCompleted = p.status === "accepted" && ps === "in_progress";
                  const wa = p.status === "accepted" && ps !== "cancelled" && phone
                    ? getWhatsAppLink(phone, t("waMessage", { name: (clientName ?? "").split(" ")[0], title: p.projects?.title ?? "" }))
                    : null;
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

                          {/* ACTIONS — surfaced as DIRECT buttons (no "···" overflow menu): a lone
                              action shouldn't hide behind a menu. pending → Editar propuesta + Retirar
                              propuesta (red, destructive); accepted+active → Contactar cliente (WhatsApp)
                              + Marcar completado (while in progress); finalizada / rechazada /
                              cliente-canceló → no actions. */}
                          {(() => {
                            const actions: ReactNode[] = [];
                            if (p.status === "pending") {
                              actions.push(<Button key="edit" size="sm" variant="outline" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => startEdit(p)}>{t("editProposal")}</Button>);
                              actions.push(<Button key="withdraw" size="sm" variant="outline" className="flex-1 sm:flex-none rounded-lg px-4 border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] hover:text-[#b91c1c] hover:border-[#fca5a5]" onClick={() => setWithdrawTarget(p)}>{t("withdraw")}</Button>);
                            } else if (p.status === "accepted") {
                              if (wa) {
                                actions.push(
                                  <Button key="wa" variant="whatsapp" size="sm" asChild className="flex-1 sm:flex-none rounded-lg px-4">
                                    <a href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="h-4 w-4 shrink-0" /> {t("contactClient")}</a>
                                  </Button>
                                );
                              }
                              if (canMarkCompleted) actions.push(<Button key="done" size="sm" variant="outline" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => markWorkDone(p.project_id)}>{t("markCompleted")}</Button>);
                            }
                            if (p.status === "declined" || ps === "cancelled") {
                              actions.push(<Button key="archive" size="sm" variant="outline" className="flex-1 sm:flex-none rounded-lg border-red-100 px-4 text-red-600 hover:bg-red-50" onClick={() => archiveProposal(p.id)}>{t("archive")}</Button>);
                            }
                            if (actions.length === 0) return null;
                            return <div className="flex flex-wrap items-center gap-2 border-t border-[#eef2f6] pt-3">{actions}</div>;
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
                });
              })()}
            </div>
          )}
        </div>
      )}
      {dialogNode}

      {/* WITHDRAW proposal — clean on-brand confirm modal (replaces window.confirm). */}
      {withdrawTarget && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !withdrawing && setWithdrawTarget(null)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t("withdrawTitle")} className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <h2 className="text-base font-bold text-[#111827]">{t("withdrawTitle")}</h2>
            <p className="mt-1 text-sm text-[#6b7280]">{t("withdrawBody")}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setWithdrawTarget(null)} disabled={withdrawing}>{t("back")}</Button>
              <Button size="sm" className="flex-1 rounded-lg bg-red-600 hover:bg-red-700" onClick={confirmWithdraw} disabled={withdrawing} loading={withdrawing}>{t("withdrawConfirm")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
