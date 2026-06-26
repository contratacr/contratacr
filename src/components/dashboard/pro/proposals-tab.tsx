"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Coins, FileText, Handshake, Phone, ChevronDown, MapPin, CalendarClock, CalendarDays, Clock, EyeOff, Users, Wrench } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PriceInput } from "@/components/ui/price-input";
import { cn, getWhatsAppLink, formatRelativeOrDate } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { StatusFilterTabs, PROYECTO_TABS, proposalMatches, proposalBucket, proposalStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { ExpandableText } from "@/components/ui/expandable-text";

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
  client_identity_status?: "verified" | "pending" | "unverified" | null;
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
    if (!silent) setLoading(true);
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
    if (!silent) setLoading(false);
  }

  async function fetchMyProposals(silent = false) {
    if (!silent) setLoading(true);
    const res = await fetch("/api/proposals?mine=true");
    const { proposals } = await res.json();
    setMyProposals(proposals ?? []);
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      if (view === "browse") fetchOpenProjects();
      else fetchMyProposals();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
    if (res.ok) {
      setMyProposals((prev) => prev.filter((p) => p.id !== withdrawTarget.id));
      // Retiring frees the opportunity: drop it from the "already-proposed" set so it
      // reappears in Oportunidades (the browse list hides only still-proposed projects,
      // and refetches mine=true on every switch back, so the project is available again).
      setSubmitted((prev) => { const next = new Set(prev); next.delete(withdrawTarget.project_id); return next; });
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

  // CR calendar day (so "Nueva" means posted TODAY in Costa Rica, not a UTC day).
  const crDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const isToday = (iso: string) => crDay(new Date(iso)) === crDay(new Date());
  // Relative time → "hace 30 minutos" / "hace 2 horas" / "hace 3 días", then the actual
  // DATE once it's ~1 week old (shared helper, sprint 528). The "Nueva" badge still flags today.
  function relativeTime(iso: string): string {
    return formatRelativeOrDate(iso, locale);
  }
  function budgetTextFor(p: OpenProject): string {
    if (p.budget_min && p.budget_max) return t("range", { min: `₡${p.budget_min.toLocaleString("es-CR")}`, max: `₡${p.budget_max.toLocaleString("es-CR")}` });
    if (p.budget_min) return t("from", { amount: `₡${p.budget_min.toLocaleString("es-CR")}` });
    if (p.budget_max) return t("upTo", { amount: `₡${p.budget_max.toLocaleString("es-CR")}` });
    return t("budgetTBD");
  }
  function hasBudget(p: OpenProject): boolean {
    return Boolean(p.budget_min || p.budget_max);
  }
  function clientIdentityText(status?: OpenProject["client_identity_status"]): string {
    if (status === "verified") return t("clientIdentityVerified");
    if (status === "pending") return t("clientIdentityPending");
    return t("clientIdentityUnverified");
  }

  // Expanded opportunity content: only what is NOT already present in the
  // closed summary card. Summary owns title, budget, zone, timeline, posted time
  // and client name. Expanded owns description, client identity status and the
  // proposal form/actions.
  function renderDetail(project: OpenProject) {
    const alreadySubmitted = submitted.has(project.id);
    const form = proposalForms[project.id] ?? { price: "", message: "" };
    return (
      <div className="flex flex-col">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("clientInfo")}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]">
                  {clientIdentityText(project.client_identity_status)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[#eef2f6] p-4 sm:p-5">
          {alreadySubmitted ? (
            <p className="text-center text-[13px] text-[#6b7280]">{t("alreadyProposedNote")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#374151]">{t("yourPrice")} <span className="font-normal text-[#6b7280]">{t("optional")}</span></label>
                <PriceInput value={form.price} onChange={(v) => updateForm(project.id, "price", v)} />
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
                const newCount = list.filter((p) => isToday(p.created_at)).length;
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[13px] font-semibold text-[#162543]">{t("availableTitle")}</p>
                      {newCount > 0 && <span className="rounded-full bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-semibold text-[#0089bb]">{t("newCount", { count: newCount })}</span>}
                    </div>
                    {list.map((project) => {
                      const isExpanded = expandedProject === project.id;
                      const zona = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
                      return (
                        <Card key={project.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", isExpanded && "shadow-md ring-1 ring-[#d8eef8]")}>
                          <button
                            type="button"
                            onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                            aria-expanded={isExpanded}
                            className={cn("group flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:p-5", isExpanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#0089bb]">
                              <Handshake className="h-[18px] w-[18px]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2.5">
                                <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{project.title}</span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                  {isToday(project.created_at) && <Badge variant="success" className="text-[10px] font-semibold">{t("new")}</Badge>}
                                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200", isExpanded ? "border-[#ccecf8] bg-[#EBF5FB] text-[#009FD9]" : "border-[#eef2f6] bg-white text-[#9ca3af] group-hover:border-[#d8eef8] group-hover:text-[#009FD9]")}>
                                    <ChevronDown className={cn("h-[18px] w-[18px] transition-transform", isExpanded && "rotate-180")} />
                                  </span>
                                </span>
                              </div>
                              <div className="mt-2 flex flex-col items-start gap-1.5 text-[13px]">
                                <span className={cn("inline-flex w-full max-w-full items-center gap-2", hasBudget(project) ? "font-semibold text-[#0089bb]" : "text-[#6b7280]")}>
                                  <Coins className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                  <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldBudget")}</span> <span className={hasBudget(project) ? "text-[#0089bb]" : "text-[#374151]"}>{budgetTextFor(project)}</span></span>
                                </span>
                                {project.categories?.name && (
                                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#374151]">
                                    <Wrench className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                    <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldService")}</span> <span className="text-[#374151]">{project.categories.name}</span></span>
                                  </span>
                                )}
                                {zona && (
                                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#6b7280]">
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                    <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldZone")}</span> <span className="text-[#374151]">{zona}</span></span>
                                  </span>
                                )}
                                {project.timeline && (
                                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#6b7280]">
                                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                    <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldDeadline")}</span> <span className="text-[#374151]">{project.timeline}</span></span>
                                  </span>
                                )}
                                <span className="inline-flex w-full max-w-full items-center gap-2 text-[#9ca3af]">
                                  <Clock className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                  <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldPublished")}</span> <span className="text-[#374151]">{relativeTime(project.created_at)}</span></span>
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
                  const wa = p.status === "accepted" && ps !== "cancelled" && phone
                    ? getWhatsAppLink(phone, t("waMessage", { name: (clientName ?? "").split(" ")[0], title: p.projects?.title ?? "" }))
                    : null;
                  const sentDate = formatRelativeOrDate(p.created_at, locale);
                  return (
                    <Card key={p.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", isOpen && "shadow-md ring-1 ring-[#d8eef8]")}>
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
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#0089bb]">
                          <Handshake className="h-[18px] w-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2.5">
                            <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{p.projects?.title ?? t("projectFallback")}</span>
                            {!proposalStatusRedundant(p.status, ps) && (
                              p.status === "accepted" ? (
                                <Badge variant={projStatusVariant(ps)} className="shrink-0 text-[11px] font-semibold">{projStatusLabel(ps)}</Badge>
                              ) : (
                                <Badge variant={STATUS_VARIANT[p.status]} className="shrink-0 text-[11px] font-semibold">{t(`status.${p.status}`)}</Badge>
                              )
                            )}
                          </div>
                          <div className="mt-2 flex flex-col items-start gap-1.5 text-[13px]">
                            <span className="inline-flex w-full max-w-full items-center gap-2 text-[#374151]">
                              <Coins className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                              <span className="truncate font-semibold">
                                <span className="font-medium text-[#9ca3af]">{t("yourPriceLabel")}</span> <span className={p.price ? "text-[#0089bb]" : "text-[#374151]"}>{p.price ? `₡${p.price.toLocaleString("es-CR")}` : t("priceTBD")}</span>
                              </span>
                            </span>
                            {clientName && (
                              <span className="inline-flex w-full max-w-full items-center gap-2">
                                <Users className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                <span className="truncate text-[#374151]">{clientName}</span>
                              </span>
                            )}
                            <span className="inline-flex w-full max-w-full items-center gap-2">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                              <span className="truncate text-[#374151]">{t("sentOn", { date: sentDate })}</span>
                            </span>
                          </div>
                        </div>
                        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200", isOpen ? "border-[#ccecf8] bg-[#EBF5FB] text-[#009FD9]" : "border-[#eef2f6] bg-white text-[#9ca3af] group-hover:border-[#d8eef8] group-hover:text-[#009FD9]")}>
                          <ChevronDown className={cn("h-[18px] w-[18px] transition-transform duration-200", isOpen && "rotate-180")} />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5 flex flex-col gap-3.5">
                          {p.message && (
                            <div className="flex flex-col gap-2.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9ca3af]">{t("myProposal")}</p>
                              <div className="flex flex-col gap-2.5">
                                <div className="flex items-start gap-2.5">
                                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("yourMessage")}</p>
                                    <ExpandableText text={p.message} lines={5} className="mt-0.5 min-w-0 text-[13px] leading-relaxed text-[#4b5563]" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* Client contact — revealed once the proposal is accepted (still active). */}
                          {p.status === "accepted" && ps !== "cancelled" && phone && (
                            <div className="border-t border-[#eef2f6] pt-3">
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
                              if (ps === "in_progress") actions.push(<Button key="done" size="sm" variant="outline" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => markWorkDone(p.project_id)}>{t("markCompleted")}</Button>);
                            }
                            if (actions.length === 0) return null;
                            return <div className="flex flex-wrap items-center gap-2 border-t border-[#eef2f6] pt-3">{actions}</div>;
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
