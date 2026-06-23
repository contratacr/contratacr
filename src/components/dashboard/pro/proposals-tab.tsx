"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FolderOpen, Send, ChevronDown, MapPin, Wallet, CalendarClock, FileSearch, Lightbulb, Clock, EyeOff } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriceInput } from "@/components/ui/price-input";
import { cn, getWhatsAppLink, getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { StatusFilterTabs, PROYECTO_TABS, proposalMatches, proposalBucket, proposalStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { CardActionsMenu, type CardAction } from "@/components/dashboard/card-actions-menu";

type ProposalStatus = "pending" | "accepted" | "declined";

type MyProposal = {
  id: string;
  project_id: string;
  price?: number;
  message: string;
  status: ProposalStatus;
  created_at: string;
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
  profiles?: { full_name: string; avatar_url?: string };
  proposals?: { id: string }[];
};

const STATUS_VARIANT: Record<ProposalStatus, "warning" | "success" | "error"> = {
  pending: "warning",
  accepted: "success",
  declined: "error",
};

function projStatusVariant(status?: string): "warning" | "success" | "error" | "default" {
  switch (status) {
    case "completed": return "success";
    case "cancelled": return "error";
    case "awaiting_confirmation": return "warning";
    default: return "warning";
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

  // Filter "Oportunidades" by profession — only surfaced when the pro has 2+ professions.
  const profTabs = useMemo(() => [{ id: "all" }, ...professions.map((p) => ({ id: p }))], [professions]);
  const profLabel = (id: string) => (id === "all" ? t("allProfessions") : getCategoryLabel(id, locale));
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
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
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
  const [proposalForms, setProposalForms] = useState<Record<string, { price: string; message: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState("activas");
  // Oportunidades browse: which profession is filtered, which card drives the desktop
  // detail pane, and the locally-dismissed ("No me interesa") opportunities.
  const [profFilter, setProfFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function fetchOpenProjects() {
    setLoading(true);
    const url = `/api/projects?role=professional${categoryId ? `&category=${categoryId}` : ""}`;
    // Fetch open projects + this pro's existing proposals so we can flag the
    // projects they already proposed to (no duplicate proposals allowed).
    const [projRes, mineRes] = await Promise.all([
      fetch(url),
      fetch("/api/proposals?mine=true"),
    ]);
    const { projects } = await projRes.json();
    const { proposals } = await mineRes.json().catch(() => ({ proposals: [] }));
    setOpenProjects(projects ?? []);
    setSubmitted(new Set<string>((proposals ?? []).map((p: { project_id: string }) => p.project_id)));
    setLoading(false);
  }

  async function fetchMyProposals() {
    setLoading(true);
    const res = await fetch("/api/proposals?mine=true");
    const { proposals } = await res.json();
    setMyProposals(proposals ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (view === "browse") fetchOpenProjects();
    else fetchMyProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Refetch when the pro returns to the tab/window so a project cancelled or
  // deleted by the client updates automatically (no stale "Aceptada").
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "visible") {
        if (view === "browse") fetchOpenProjects(); else fetchMyProposals();
      }
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function submitProposal(projectId: string) {
    const form = proposalForms[projectId];
    if (!form?.message?.trim()) return;

    setSubmitting(projectId);
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        price: form.price || null,
        message: form.message,
      }),
    });

    // 409 = a proposal already exists for this project → treat as submitted.
    if (res.ok || res.status === 409) {
      setSubmitted((prev) => new Set([...prev, projectId]));
      setExpandedProject(null);
    }
    setSubmitting(null);
  }

  // Mis propuestas is a collapsible accordion (sprint 449) — same card language as the
  // other panel sections (one open at a time).
  const [expandedMine, setExpandedMine] = useState<string | null>(null);
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
    if (res.ok) setMyProposals((prev) => prev.filter((p) => p.id !== withdrawTarget.id));
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
      alert(j.error ?? t("markWorkDoneError"));
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
    try { const raw = localStorage.getItem(DISMISS_KEY); if (raw) setDismissed(new Set(JSON.parse(raw))); } catch {}
  }, []);
  function dismissOpportunity(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setSelectedId((cur) => (cur === id ? null : cur));
    setExpandedProject((cur) => (cur === id ? null : cur));
  }

  // CR calendar day (so "Nueva" means posted TODAY in Costa Rica, not a UTC day).
  const crDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const isToday = (iso: string) => crDay(new Date(iso)) === crDay(new Date());
  // "hace 1 h" / "hace 3 días" / "hace 2 semanas" / "hace 1 mes" — from the post date.
  function relativeTime(iso: string): string {
    const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (hours < 24) return t("agoHours", { count: Math.max(1, hours) });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("agoDays", { count: days });
    if (days < 30) return t("agoWeeks", { count: Math.floor(days / 7) });
    return t("agoMonths", { count: Math.max(1, Math.floor(days / 30)) });
  }
  function budgetTextFor(p: OpenProject): string {
    if (p.budget_min && p.budget_max) return t("range", { min: `₡${p.budget_min.toLocaleString("es-CR")}`, max: `₡${p.budget_max.toLocaleString("es-CR")}` });
    if (p.budget_min) return t("from", { amount: `₡${p.budget_min.toLocaleString("es-CR")}` });
    if (p.budget_max) return t("upTo", { amount: `₡${p.budget_max.toLocaleString("es-CR")}` });
    return t("budgetTBD");
  }

  // The opportunity DETAIL (Upwork/job-board) — rendered in the desktop right pane AND
  // inline on mobile (accordion). Header (badges + title + zona·publicada) → "el cliente
  // espera" callout → description → budget·fecha meta → client → the proposal FORM (tip +
  // price + message + Enviar + "No me interesa"), or the "ya enviaste" note. Tasteful icons:
  // GREY for the meta (wallet/calendar/location/clock), BRAND-BLUE for the two accents
  // (callout + consejo). Same submit handler/state as before.
  function renderDetail(project: OpenProject) {
    const alreadySubmitted = submitted.has(project.id);
    const form = proposalForms[project.id] ?? { price: "", message: "" };
    const zona = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
    return (
      <div className="flex flex-col">
        <div className="flex flex-col gap-3.5 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {isToday(project.created_at) && <Badge variant="success" className="text-[10px] font-semibold">{t("new")}</Badge>}
              {project.timeline && <Badge variant="muted" className="text-[10px] font-semibold">{project.timeline}</Badge>}
            </div>
            <h3 className="mt-1.5 text-[18px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{project.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-[#6b7280]">
              {zona && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#9ca3af]" />{zona}</span>}
              {zona && <span aria-hidden>·</span>}
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-[#9ca3af]" />{t("postedAgo", { time: relativeTime(project.created_at) })}</span>
            </p>
          </div>

          {/* Motivational callout — a single brand accent icon, not a colorful one. */}
          <div className="flex items-start gap-2.5 rounded-xl bg-[#EBF5FB] px-3.5 py-3">
            <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-[#0089bb]" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#162543]">{t("waitingTitle")}</p>
              <p className="text-[12px] text-[#6b7280]">{t("waitingBody")}</p>
            </div>
          </div>

          {project.description && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9ca3af]">{t("projectDescription")}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#374151] whitespace-pre-line [overflow-wrap:anywhere]">{project.description}</p>
            </div>
          )}

          <div className="grid grid-cols-1 divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#eef0f2] bg-[#f9fafb] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <Wallet className="h-4 w-4 shrink-0 text-[#9ca3af]" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("budgetLabel")}</p>
                <p className="truncate text-[13px] font-semibold text-[#0089bb]">{budgetTextFor(project)}</p>
              </div>
            </div>
            {project.timeline && (
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <CalendarClock className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("timelineLabel")}</p>
                  <p className="truncate text-[13px] font-medium text-[#374151]">{project.timeline}</p>
                </div>
              </div>
            )}
          </div>

          {project.profiles?.full_name && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9ca3af]">{t("clientInfo")}</p>
              <div className="mt-1.5 flex items-center gap-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={project.profiles.avatar_url} className="object-cover" />
                  <AvatarFallback className="text-[11px] bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(project.profiles.full_name)}</AvatarFallback>
                </Avatar>
                <p className="min-w-0 truncate text-[13px] font-medium text-[#374151]">{project.profiles.full_name}</p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[#f3f4f6] bg-[#fafbfc] p-4 sm:p-5">
          {alreadySubmitted ? (
            <p className="text-center text-[13px] text-[#6b7280]">{t("alreadyProposedNote")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#0089bb]" />
                <p className="text-[12px] text-[#6b7280]"><span className="font-semibold text-[#162543]">{t("tipLabel")}</span> {t("tipBody")}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#374151]">{t("yourPrice")} <span className="font-normal text-[#6b7280]">{t("optional")}</span></label>
                <PriceInput value={form.price} onChange={(v) => updateForm(project.id, "price", v)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#374151]">{t("yourMessage")} <span className="text-red-500">*</span></label>
                <textarea value={form.message} onChange={(e) => updateForm(project.id, "message", e.target.value)} maxLength={500} className={`${inputClass} min-h-[100px] resize-none`} />
                {form.message.length >= 500 && <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: 500 })}</p>}
              </div>
              <Button onClick={() => submitProposal(project.id)} disabled={!form.message.trim() || submitting === project.id} loading={submitting === project.id} className="w-full">{t("sendProposal")}</Button>
              <p className="text-center text-[11px] text-[#9ca3af]">{t("proposalFree")}</p>
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
              <FolderOpen className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-medium text-[#374151]">{t("emptyBrowse")}</p>
              <p className="text-sm text-[#6b7280] mt-1">{t("emptyBrowseSub")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Filter by the pro's professions — only when they have more than one. */}
              {showProfFilter && (
                <StatusFilterTabs tabs={profTabs} value={profFilter} onChange={setProfFilter} labelFor={profLabel} />
              )}
              {(() => {
                // Hide opportunities already proposed to (they live in "Mis propuestas") and
                // ones the pro dismissed; then filter by profession; surface service matches first.
                const list = openProjects
                  .filter((p) => !submitted.has(p.id) && !dismissed.has(p.id))
                  .filter((p) => profFilter === "all" || p.category_id === profFilter)
                  .sort((a, b) => Number(matchesServices(b)) - Number(matchesServices(a)));
                if (list.length === 0) return <p className="text-sm text-[#6b7280] text-center py-12">{t("noneInView")}</p>;
                // Desktop: the active opportunity drives the right detail pane (default = first).
                const activeProject = list.find((p) => p.id === selectedId) ?? list[0];
                const newCount = list.filter((p) => isToday(p.created_at)).length;
                return (
                  /* MASTER–DETAIL (Upwork/job-board): a compact LIST on the left + the selected
                     opportunity's DETAIL on the right (desktop); on mobile it's one column where
                     tapping a card expands the SAME detail inline (accordion). */
                  <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-5">
                    <div className="flex flex-col gap-2.5 lg:min-w-0">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[13px] font-semibold text-[#162543]">{t("availableTitle")}</p>
                        {newCount > 0 && <span className="rounded-full bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-semibold text-[#0089bb]">{t("newCount", { count: newCount })}</span>}
                      </div>
                      {list.map((project) => {
                        const isExpanded = expandedProject === project.id;
                        const isActive = activeProject?.id === project.id;
                        const zona = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
                        return (
                          <Card key={project.id} className={cn("transition-colors", isActive && "lg:border-[#009FD9] lg:bg-[#f8fcff] lg:ring-1 lg:ring-[#009FD9]/30")}>
                            <button
                              type="button"
                              onClick={() => { setSelectedId(project.id); setExpandedProject(isExpanded ? null : project.id); }}
                              aria-expanded={isExpanded}
                              className={cn("flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-[#fafafa]", isExpanded ? "rounded-t-2xl lg:rounded-2xl" : "rounded-2xl")}
                            >
                              <span className={cn("hidden w-1 self-stretch rounded-full lg:block", isActive ? "bg-[#009FD9]" : "bg-transparent")} aria-hidden />
                              <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={project.profiles?.avatar_url} className="object-cover" />
                                <AvatarFallback className="text-sm bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(project.profiles?.full_name ?? "?")}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  {/* No profession on the card (it's implicit from the feed/filter). */}
                                  <span className="min-w-0 truncate text-[14px] font-semibold text-[#162543]">{project.title}</span>
                                  {isToday(project.created_at) && <Badge variant="success" className="shrink-0 text-[10px] font-semibold">{t("new")}</Badge>}
                                </div>
                                {(zona || project.timeline) && <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">{[zona, project.timeline].filter(Boolean).join(" · ")}</p>}
                                <div className="mt-1 flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate text-[13px] font-semibold text-[#0089bb]">{budgetTextFor(project)}</span>
                                  <span className="shrink-0 text-[11px] text-[#9ca3af]">{relativeTime(project.created_at)}</span>
                                </div>
                              </div>
                            </button>
                            {isExpanded && <div className="border-t border-[#f3f4f6] lg:hidden">{renderDetail(project)}</div>}
                          </Card>
                        );
                      })}
                    </div>
                    <div className="hidden lg:block lg:sticky lg:top-4">
                      {activeProject && <Card className="overflow-hidden">{renderDetail(activeProject)}</Card>}
                    </div>
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
              <Send className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-medium text-[#374151]">{t("emptyMine")}</p>
              <p className="text-sm text-[#6b7280] mt-1">{t("emptyMineSub")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <StatusFilterTabs tabs={PROYECTO_TABS} value={projectFilter} onChange={setProjectFilter} counts={bucketCounts(myProposals.map((p) => proposalBucket(p.status, p.projects?.status)))} />
              {(() => {
                const shown = myProposals.filter((p) => proposalMatches(projectFilter, p.status, p.projects?.status));
                if (shown.length === 0) return <p className="text-sm text-[#6b7280] text-center py-8">{t("noneInView")}</p>;
                return shown.map((p) => {
                  const isOpen = expandedMine === p.id;
                  const ps = p.projects?.status;
                  const phone = p.projects?.profiles?.phone;
                  const clientName = p.projects?.profiles?.full_name;
                  const wa = p.status === "accepted" && ps !== "cancelled" && phone
                    ? getWhatsAppLink(phone, t("waMessage", { name: (clientName ?? "").split(" ")[0], title: p.projects?.title ?? "" }))
                    : null;
                  const sentDate = new Date(p.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <Card key={p.id}>
                      {/* COLLAPSED header — client avatar + project title (primary) + a status chip
                          (a SENT proposal genuinely IS "Pendiente" until the client decides — unlike
                          auto-confirm bookings — so that badge is kept here); key fact = YOUR price; a
                          2-line message preview while collapsed. Same card language as the rest. */}
                      <button
                        type="button"
                        onClick={() => setExpandedMine(isOpen ? null : p.id)}
                        aria-expanded={isOpen}
                        className={cn("w-full text-left p-4 flex items-start gap-2.5 hover:bg-[#fafafa] transition-colors", isOpen ? "rounded-t-2xl" : "rounded-2xl")}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={p.projects?.profiles?.avatar_url} />
                          <AvatarFallback className="text-sm bg-[#EBF5FB] text-[#009FD9] font-bold">
                            {getInitials(clientName ?? "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[15px] font-semibold text-[#111827] min-w-0 truncate">{p.projects?.title ?? t("projectFallback")}</span>
                            {!proposalStatusRedundant(p.status, ps) && (
                              p.status === "accepted" ? (
                                <Badge variant={projStatusVariant(ps)} className="shrink-0 text-[11px] font-semibold">{projStatusLabel(ps)}</Badge>
                              ) : (
                                <Badge variant={STATUS_VARIANT[p.status]} className="shrink-0 text-[11px] font-semibold">{t(`status.${p.status}`)}</Badge>
                              )
                            )}
                          </div>
                          <p className="mt-0.5 text-[13px] truncate">
                            <span className="text-[#6b7280]">{t("yourPriceLabel")}</span>{" "}
                            {p.price
                              ? <span className="font-medium text-[#374151]">₡{p.price.toLocaleString("es-CR")}</span>
                              : <span className="text-[#6b7280]">{t("priceTBD")}</span>}
                          </p>
                          {!isOpen && p.message && (
                            <p className="mt-1 text-[13px] text-[#6b7280] leading-snug line-clamp-2 [overflow-wrap:anywhere]">{p.message}</p>
                          )}
                        </div>
                        <ChevronDown className={cn("h-5 w-5 text-[#9ca3af] shrink-0 mt-0.5 transition-transform duration-200", isOpen && "rotate-180")} />
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 pt-3 border-t border-[#f3f4f6] flex flex-col gap-2.5">
                          {clientName && <p className="text-[12.5px] text-[#6b7280] truncate">{clientName}</p>}
                          {p.message && <p className="text-[13px] text-[#374151] whitespace-pre-line [overflow-wrap:anywhere]">{p.message}</p>}
                          <p className="text-[11px] text-[#9ca3af]">{t("sentOn", { date: sentDate })}</p>
                          {/* Client contact — revealed once the proposal is accepted (still active). */}
                          {p.status === "accepted" && ps !== "cancelled" && phone && (
                            <p className="text-xs text-[#374151]"><span className="text-[#6b7280]">{t("fieldPhone")}</span> {phone}</p>
                          )}
                          {/* Client cancelled the request after accepting → tell the pro (no actions). */}
                          {p.status === "accepted" && ps === "cancelled" && (
                            <div className="rounded-lg bg-[#fef2f2] border border-[#fee2e2] px-2.5 py-1.5">
                              <p className="text-[11px] font-semibold text-[#b91c1c]">{t("clientCancelled")}</p>
                            </div>
                          )}

                          {/* ACTIONS — PRIMARY visible + "···" overflow menu (consistent with the
                              other sections). pending → Editar propuesta (primary) + Retirar (menu,
                              destructive); accepted+active → Contactar cliente (WhatsApp primary) +
                              Marcar completado (menu, while in progress); finalizada / rechazada /
                              cliente-canceló → no actions. */}
                          {(() => {
                            const menu: CardAction[] = [];
                            let primary: ReactNode = null;
                            if (p.status === "pending") {
                              primary = <Button size="sm" variant="outline" className="flex-1 sm:flex-none rounded-full px-4" onClick={() => startEdit(p)}>{t("editProposal")}</Button>;
                              menu.push({ label: t("withdraw"), onClick: () => setWithdrawTarget(p), destructive: true });
                            } else if (p.status === "accepted") {
                              if (wa) {
                                primary = (
                                  <Button variant="whatsapp" size="sm" asChild className="flex-1 sm:flex-none rounded-full px-4">
                                    <a href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="h-4 w-4" /> {t("contactClient")}</a>
                                  </Button>
                                );
                              }
                              if (ps === "in_progress") menu.push({ label: t("markCompleted"), onClick: () => markWorkDone(p.project_id) });
                            }
                            if (!primary && menu.length === 0) return null;
                            return (
                              <div className="flex items-center gap-2">
                                {primary}
                                {menu.length > 0 && (
                                  <div className={primary ? "" : "ml-auto"}>
                                    <CardActionsMenu actions={menu} label={t("actions")} />
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
                                <PriceInput placeholder={t("pricePlaceholder")} value={editForm.price} onChange={(v) => setEditForm((f) => ({ ...f, price: v }))} />
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

      {/* WITHDRAW proposal — clean on-brand confirm modal (replaces window.confirm). */}
      {withdrawTarget && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !withdrawing && setWithdrawTarget(null)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t("withdrawTitle")} className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <h2 className="text-base font-bold text-[#111827]">{t("withdrawTitle")}</h2>
            <p className="mt-1 text-sm text-[#6b7280]">{t("withdrawBody")}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => setWithdrawTarget(null)} disabled={withdrawing}>{t("back")}</Button>
              <Button size="sm" className="flex-1 rounded-full bg-red-600 hover:bg-red-700" onClick={confirmWithdraw} disabled={withdrawing} loading={withdrawing}>{t("withdrawConfirm")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
