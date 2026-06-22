"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FolderOpen, Send, ChevronDown } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriceInput } from "@/components/ui/price-input";
import { cn, getWhatsAppLink, getInitials } from "@/lib/utils";
import { StatusFilterTabs, PROYECTO_TABS, proposalMatches, proposalBucket, proposalStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";

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
  /** The pro's services — used to SURFACE projects whose text matches them. */
  services?: { name?: string }[];
}

export function ProposalsTab({ categoryId, services = [] }: ProposalsTabProps) {
  const t = useTranslations("proposalsTab");
  const locale = useLocale();

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

  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ price: string; message: string }>({ price: "", message: "" });

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

  async function cancelProposal(id: string) {
    if (!confirm(t("cancelConfirm"))) return;
    const res = await fetch(`/api/proposals?id=${id}`, { method: "DELETE" });
    if (res.ok) setMyProposals((prev) => prev.filter((p) => p.id !== id));
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
    "w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

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
              {/* Surface projects that match the pro's services first (stable sort,
                  no visible badge). */}
              {[...openProjects].sort((a, b) => Number(matchesServices(b)) - Number(matchesServices(a))).map((project) => {
                const isExpanded = expandedProject === project.id;
                const alreadySubmitted = submitted.has(project.id);
                const form = proposalForms[project.id] ?? { price: "", message: "" };
                const proposalCount = project.proposals?.length ?? 0;
                const budgetText = (project.budget_min || project.budget_max)
                  ? (project.budget_min && project.budget_max
                      ? t("range", { min: `₡${project.budget_min.toLocaleString("es-CR")}`, max: `₡${project.budget_max.toLocaleString("es-CR")}` })
                      : project.budget_min
                      ? t("from", { amount: `₡${project.budget_min.toLocaleString("es-CR")}` })
                      : t("upTo", { amount: `₡${project.budget_max!.toLocaleString("es-CR")}` }))
                  : t("budgetTBD");
                const hasZoneDeadline = (project.provincias?.name || project.cantones?.name) || project.timeline;

                return (
                  <Card key={project.id}>
                    {/* EXPANDABLE OPORTUNIDAD (sprint 430): COLLAPSED shows essentials — title ·
                        presupuesto · estado/categoría. Tapping reveals who posted, zona·plazo, the
                        full description, the proposals count, and the "Proponer" form. */}
                    <button
                      type="button"
                      onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                      aria-expanded={isExpanded}
                      className={cn("w-full text-left p-4 flex items-start gap-2.5 hover:bg-[#fafafa] transition-colors", isExpanded ? "rounded-t-2xl" : "rounded-2xl")}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={project.profiles?.avatar_url} className="object-cover" />
                        <AvatarFallback className="text-sm bg-[#EBF5FB] text-[#009FD9] font-bold">
                          {getInitials(project.profiles?.full_name ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[15px] font-semibold text-[#111827] min-w-0">{project.title}</span>
                          {alreadySubmitted ? (
                            <Badge variant="success" className="shrink-0 text-[11px] font-semibold">{t("alreadyProposed")}</Badge>
                          ) : project.categories?.name ? (
                            <Badge variant="muted" className="shrink-0 text-[11px] font-semibold">{project.categories.name}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[13px] truncate">
                          <span className="text-[#6b7280]">{t("fieldBudget")}</span>{" "}
                          <span className="font-medium text-[#374151]">{budgetText}</span>
                        </p>
                      </div>
                      <ChevronDown className={cn("h-5 w-5 text-[#9ca3af] shrink-0 mt-0.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-[#f3f4f6] flex flex-col gap-2.5">
                        {project.profiles?.full_name && (
                          <p className="text-[12.5px] text-[#6b7280] truncate">{project.profiles.full_name}</p>
                        )}
                        {hasZoneDeadline && (
                          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-[#6b7280]">
                            {(project.provincias?.name || project.cantones?.name) && (
                              <span><span className="text-[#6b7280]">{t("fieldZone")}</span> {[project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ")}</span>
                            )}
                            {project.timeline && (
                              <span><span className="text-[#6b7280]">{t("fieldDeadline")}</span> {project.timeline}</span>
                            )}
                          </p>
                        )}
                        {project.description && (
                          <p className="text-[13px] text-[#374151] whitespace-pre-line">{project.description}</p>
                        )}
                        <span className="text-xs text-[#6b7280]">{t("proposalsCount", { count: proposalCount })}</span>

                        {!alreadySubmitted && (
                          <div className="pt-2 border-t border-[#f3f4f6] flex flex-col gap-3">
                            <div>
                              <label className="text-xs font-medium text-[#374151] block mb-1.5">
                                {t("yourPrice")} <span className="text-[#6b7280] font-normal">{t("optional")}</span>
                              </label>
                              <PriceInput
                                placeholder={t("pricePlaceholder")}
                                value={form.price}
                                onChange={(v) => updateForm(project.id, "price", v)}
                              />
                              <p className="text-[11px] text-[#6b7280] mt-1">{t("priceHint")}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-[#374151] block mb-1.5">
                                {t("yourMessage")} <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                placeholder={t("messagePlaceholder")}
                                value={form.message}
                                onChange={(e) => updateForm(project.id, "message", e.target.value)}
                                className={`${inputClass} min-h-[100px] resize-none`}
                              />
                            </div>
                            <Button
                              size="sm"
                              onClick={() => submitProposal(project.id)}
                              disabled={!form.message.trim() || submitting === project.id}
                              loading={submitting === project.id}
                              className="w-full"
                            >
                              {t("sendProposal")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
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
                return shown.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[#111827] mb-1">
                          {p.projects?.title ?? t("projectFallback")}
                        </p>
                        {p.projects?.profiles?.full_name && (
                          <div className="flex items-center gap-2 mb-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={p.projects.profiles.avatar_url} />
                              <AvatarFallback className="text-[10px] bg-[#EBF5FB] text-[#009FD9] font-semibold">
                                {getInitials(p.projects.profiles.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium text-[#374151]">{p.projects.profiles.full_name}</span>
                          </div>
                        )}
                        {/* Client contact — shown to the pro once their proposal is accepted. */}
                        {p.status === "accepted" && p.projects?.profiles?.phone && (
                          <p className="text-xs text-[#374151] mb-2">
                            <span className="text-[#6b7280]">{t("fieldPhone")}</span> {p.projects.profiles.phone}
                          </p>
                        )}
                        <p className="text-xs text-[#6b7280] line-clamp-2 mb-2">{p.message}</p>
                        <p className="text-xs text-[#374151]">
                          {t("yourPriceLabel")}{" "}
                          {p.price
                            ? <span className="font-medium">₡{p.price.toLocaleString("es-CR")}</span>
                            : <span className="text-[#6b7280]">{t("priceTBD")}</span>}
                        </p>
                        <p className="text-xs text-[#6b7280] mt-1">
                          {new Date(p.created_at).toLocaleDateString(dateLocale)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* Status badge shown ONLY when it adds info beyond the active tab
                            (a sub-state like "En espera de confirmación" or a project the
                            client cancelled). When it just repeats the tab, it's hidden. */}
                        {!proposalStatusRedundant(p.status, p.projects?.status) && (
                          p.status === "accepted" ? (
                            <Badge variant={projStatusVariant(p.projects?.status)}>{projStatusLabel(p.projects?.status)}</Badge>
                          ) : (
                            <Badge variant={STATUS_VARIANT[p.status]}>{t(`status.${p.status}`)}</Badge>
                          )
                        )}

                        {p.status === "pending" && (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => startEdit(p)}>{t("edit")}</Button>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => cancelProposal(p.id)}>{t("cancel")}</Button>
                          </div>
                        )}

                        {/* Accepted + still active → contact + mark work done. Cancelled
                            by the client → no actions (auto-loses the accepted state). */}
                        {p.status === "accepted" && p.projects?.status !== "cancelled" && p.projects?.profiles?.phone && (
                          <Button size="sm" variant="whatsapp" asChild>
                            <a
                              href={getWhatsAppLink(
                                p.projects.profiles.phone,
                                t("waMessage", { name: p.projects.profiles.full_name.split(" ")[0], title: p.projects.title })
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <WhatsAppIcon className="h-3.5 w-3.5" />
                              {t("whatsapp")}
                            </a>
                          </Button>
                        )}
                        {p.status === "accepted" && p.projects?.status === "in_progress" && (
                          <Button size="sm" onClick={() => markWorkDone(p.project_id)}>
                            {t("markCompleted")}
                          </Button>
                        )}
                        {p.status === "accepted" && p.projects?.status === "cancelled" && (
                          <span className="text-xs text-red-500">{t("clientCancelled")}</span>
                        )}
                      </div>
                    </div>

                    {editing === p.id && (
                      <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-col gap-3">
                        <div>
                          <label className="text-xs font-medium text-[#374151] block mb-1.5">{t("yourPrice")} <span className="text-[#6b7280] font-normal">{t("optional")}</span></label>
                          <PriceInput placeholder={t("pricePlaceholder")} value={editForm.price} onChange={(v) => setEditForm((f) => ({ ...f, price: v }))} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#374151] block mb-1.5">{t("yourMessage")} <span className="text-red-500">*</span></label>
                          <textarea
                            value={editForm.message}
                            onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))}
                            className={`${inputClass} min-h-[90px] resize-none`}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(p.id)} disabled={!editForm.message.trim()}>{t("save")}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
