"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Send, ChevronDown, ChevronUp, MapPin, Clock, Coins, User, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, getWhatsAppLink } from "@/lib/utils";

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
    profiles: { full_name: string; phone?: string };
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
  categories?: { name: string; icon: string };
  provincias?: { name: string };
  cantones?: { name: string };
  profiles?: { full_name: string };
  proposals?: { id: string }[];
};

const STATUS_VARIANT: Record<ProposalStatus, "warning" | "success" | "error"> = {
  pending: "warning",
  accepted: "success",
  declined: "error",
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  declined: "Rechazada",
};

interface ProposalsTabProps {
  categoryId?: string;
}

export function ProposalsTab({ categoryId }: ProposalsTabProps) {
  const [view, setView] = useState<"browse" | "mine">("browse");
  const [openProjects, setOpenProjects] = useState<OpenProject[]>([]);
  const [myProposals, setMyProposals] = useState<MyProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [proposalForms, setProposalForms] = useState<Record<string, { price: string; message: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (view === "browse") {
      fetchOpenProjects();
    } else {
      fetchMyProposals();
    }
  }, [view]);

  async function fetchOpenProjects() {
    setLoading(true);
    const url = `/api/projects?role=professional${categoryId ? `&category=${categoryId}` : ""}`;
    const res = await fetch(url);
    const { projects } = await res.json();
    setOpenProjects(projects ?? []);
    setLoading(false);
  }

  async function fetchMyProposals() {
    setLoading(true);
    const res = await fetch("/api/proposals?mine=true");
    const { proposals } = await res.json();
    setMyProposals(proposals ?? []);
    setLoading(false);
  }

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

    if (res.ok) {
      setSubmitted((prev) => new Set([...prev, projectId]));
      setExpandedProject(null);
    }
    setSubmitting(null);
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
            {v === "browse" ? "Proyectos disponibles" : "Mis propuestas"}
          </button>
        ))}
      </div>

      {/* Browse open projects */}
      {view === "browse" && (
        <div>
          {openProjects.length === 0 ? (
            <div className="text-center py-16">
              <FolderOpen className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-medium text-[#374151]">No hay proyectos disponibles en tu zona</p>
              <p className="text-sm text-[#9ca3af] mt-1">Los proyectos de clientes aparecerán aquí.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {openProjects.map((project) => {
                const isExpanded = expandedProject === project.id;
                const alreadySubmitted = submitted.has(project.id);
                const form = proposalForms[project.id] ?? { price: "", message: "" };
                const proposalCount = project.proposals?.length ?? 0;

                return (
                  <Card key={project.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {project.categories && (
                              <span className="text-sm">{project.categories.icon}</span>
                            )}
                            <span className="font-semibold text-[#111827] text-sm">{project.title}</span>
                          </div>
                          <p className="text-sm text-[#6b7280] line-clamp-2 mb-2">{project.description}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-[#9ca3af]">
                            {project.profiles?.full_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {project.profiles.full_name.split(" ")[0]}
                              </span>
                            )}
                            {(project.provincias?.name || project.cantones?.name) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ")}
                              </span>
                            )}
                            {project.timeline && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {project.timeline}
                              </span>
                            )}
                            {(project.budget_min || project.budget_max) && (
                              <span className="flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                {project.budget_min && project.budget_max
                                  ? `₡${project.budget_min.toLocaleString("es-CR")} – ₡${project.budget_max.toLocaleString("es-CR")}`
                                  : project.budget_min
                                  ? `Desde ₡${project.budget_min.toLocaleString("es-CR")}`
                                  : `Hasta ₡${project.budget_max!.toLocaleString("es-CR")}`}
                              </span>
                            )}
                            <span>{proposalCount} propuesta{proposalCount !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        {!alreadySubmitted && (
                          <button
                            onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                            className="flex items-center gap-1 text-sm font-medium text-[#009FD9] hover:underline shrink-0"
                          >
                            {isExpanded ? (
                              <>Cerrar <ChevronUp className="h-4 w-4" /></>
                            ) : (
                              <>Proponer <ChevronDown className="h-4 w-4" /></>
                            )}
                          </button>
                        )}
                        {alreadySubmitted && (
                          <Badge variant="success">Propuesta enviada</Badge>
                        )}
                      </div>

                      {isExpanded && !alreadySubmitted && (
                        <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-col gap-3">
                          <div>
                            <label className="text-xs font-medium text-[#374151] block mb-1.5">
                              Tu precio (₡) <span className="text-[#9ca3af] font-normal">opcional</span>
                            </label>
                            <input
                              type="number"
                              placeholder="Ej: 50000"
                              value={form.price}
                              onChange={(e) => updateForm(project.id, "price", e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[#374151] block mb-1.5">
                              Tu mensaje <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              placeholder="Describí cómo podés ayudar, tu experiencia, y por qué elegirte..."
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
                            <Send className="h-4 w-4" />
                            Enviar propuesta
                          </Button>
                        </div>
                      )}
                    </CardContent>
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
              <p className="font-medium text-[#374151]">No enviaste propuestas todavía</p>
              <p className="text-sm text-[#9ca3af] mt-1">Explorá proyectos disponibles y envía tu primera propuesta.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {myProposals.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[#111827] mb-1">
                          {p.projects?.title ?? "Proyecto"}
                        </p>
                        {p.projects?.profiles?.full_name && (
                          <p className="flex items-center gap-1 text-xs text-[#6b7280] mb-1">
                            <User className="h-3 w-3" />
                            {p.projects.profiles.full_name.split(" ")[0]}
                          </p>
                        )}
                        <p className="text-xs text-[#6b7280] line-clamp-2 mb-2">{p.message}</p>
                        {p.price && (
                          <p className="text-xs text-[#374151]">
                            Tu precio: <span className="font-medium">₡{p.price.toLocaleString("es-CR")}</span>
                          </p>
                        )}
                        <p className="text-xs text-[#9ca3af] mt-1">
                          {new Date(p.created_at).toLocaleDateString("es-CR")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Badge variant={STATUS_VARIANT[p.status]}>
                          {STATUS_LABEL[p.status]}
                        </Badge>
                        {p.status === "accepted" && p.projects?.profiles?.phone && (
                          <Button size="sm" variant="whatsapp" asChild>
                            <a
                              href={getWhatsAppLink(
                                p.projects.profiles.phone,
                                `Hola ${p.projects.profiles.full_name.split(" ")[0]}, soy el profesional cuya propuesta aceptaste en ContrataCR para "${p.projects.title}".`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              WhatsApp
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
