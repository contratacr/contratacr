"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, HeartPulse, Layers3, Loader2, Plus, Save, Search, Tag, Trash2, Video, X } from "lucide-react";
import {
  ALL_CATEGORIES,
  autoEnglishCategoryLabel,
  classifySuggestedCategory,
  normalizeText,
  searchCategories,
} from "@/lib/data/categories";

type Suggestion = {
  id: string;
  label: string;
  suggested_name?: string | null;
  status: string;
  created_at: string;
};

type CatalogCategory = {
  id: string;
  label: string;
  labelEn?: string;
  groupId: string;
  groupLabel: string;
  source: "base" | "custom";
  isHidden?: boolean;
  esSalud: boolean;
  supportsVideoconsulta: boolean;
};

type CatalogGroup = {
  id: string;
  label: string;
  labelEn?: string;
  iconKey?: string;
  sortOrder?: number;
};

const STATUSES = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
] as const;

function findSimilarCategory(name: string): string | null {
  const q = normalizeText(name.trim());
  if (q.length < 3) return null;
  for (const c of ALL_CATEGORIES) {
    const lbl = normalizeText(c.label);
    if (lbl === q) return c.label;
    if (q.length >= 4 && (lbl.includes(q) || (lbl.length >= 4 && q.includes(lbl)))) return c.label;
    if (c.keywords.some((k) => {
      const nk = normalizeText(k);
      return nk === q || (q.length >= 4 && nk.length >= 4 && (nk.includes(q) || q.includes(nk)));
    })) return c.label;
  }
  return null;
}

function suggestedGroupId(name: string, groups: CatalogGroup[]) {
  return searchCategories(name)[0]?.groupId || groups[0]?.id || "profesional";
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]">
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-[#009FD9]" : "bg-[#d1d5db]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-4" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#8a94a6]">{children}</label>;
}

export function AdminCategories() {
  const [view, setView] = useState<"suggestions" | "services" | "groups">("services");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<"all" | "custom" | "health" | "video">("all");
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, { label: string; labelEn: string; groupId: string }>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, { label: string; labelEn: string; sortOrder: number }>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [englishEdits, setEnglishEdits] = useState<Record<string, string>>({});
  const [suggestionGroups, setSuggestionGroups] = useState<Record<string, string>>({});
  const [flagEdits, setFlagEdits] = useState<Record<string, { esSalud: boolean; supportsVideoconsulta: boolean }>>({});
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceNameEn, setNewServiceNameEn] = useState("");
  const [newServiceGroupId, setNewServiceGroupId] = useState("profesional");
  const [newServiceFlags, setNewServiceFlags] = useState({ esSalud: false, supportsVideoconsulta: false });
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupNameEn, setNewGroupNameEn] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function loadCatalog() {
    const data = await fetch("/api/admin/categories?status=catalog").then((r) => r.json());
    setCatalog(data.catalog ?? []);
    setGroups(data.groups ?? []);
    if (!newServiceGroupId && data.groups?.[0]?.id) setNewServiceGroupId(data.groups[0].id);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        if (view === "suggestions") {
          const [suggestions, catalogData] = await Promise.all([
            fetch(`/api/admin/categories?status=${status}`).then((r) => r.json()),
            groups.length ? Promise.resolve(null) : fetch("/api/admin/categories?status=catalog").then((r) => r.json()),
          ]);
          if (cancelled) return;
          setItems(suggestions.categories ?? []);
          if (!groups.length && catalogData) {
            setCatalog(catalogData.catalog ?? []);
            setGroups(catalogData.groups ?? []);
          }
        } else {
          await loadCatalog();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status]);

  const nameOf = (i: Suggestion) => edits[i.id] ?? (i.suggested_name || i.label);
  const englishNameOf = (i: Suggestion) => englishEdits[i.id] ?? autoEnglishCategoryLabel(nameOf(i));
  const groupOfSuggestion = (i: Suggestion) => suggestionGroups[i.id] ?? suggestedGroupId(nameOf(i), groups);
  const flagsOf = (i: Suggestion) => {
    const review = classifySuggestedCategory(nameOf(i));
    return flagEdits[i.id] ?? { esSalud: review.healthLikely, supportsVideoconsulta: review.videoConsultLikely };
  };

  const filteredCatalog = useMemo(() => {
    const q = normalizeText(query);
    return catalog.filter((item) => {
      if (serviceFilter === "custom" && item.source !== "custom") return false;
      if (serviceFilter === "health" && !item.esSalud) return false;
      if (serviceFilter === "video" && !item.supportsVideoconsulta) return false;
      if (!q) return true;
      return normalizeText(`${item.label} ${item.labelEn ?? ""} ${item.groupLabel} ${item.id}`).includes(q);
    });
  }, [catalog, serviceFilter, query]);

  function draftOf(item: CatalogCategory) {
    return catalogDrafts[item.id] ?? {
      label: item.label,
      labelEn: item.labelEn || autoEnglishCategoryLabel(item.label),
      groupId: item.groupId,
    };
  }

  function groupDraftOf(group: CatalogGroup) {
    return groupDrafts[group.id] ?? {
      label: group.label,
      labelEn: group.labelEn || autoEnglishCategoryLabel(group.label),
      sortOrder: group.sortOrder ?? 100,
    };
  }

  function hasDraftChanges(item: CatalogCategory) {
    const draft = draftOf(item);
    return draft.label.trim() !== item.label || draft.labelEn.trim() !== (item.labelEn || autoEnglishCategoryLabel(item.label)) || draft.groupId !== item.groupId;
  }

  function hasGroupChanges(group: CatalogGroup) {
    const draft = groupDraftOf(group);
    return draft.label.trim() !== group.label || draft.labelEn.trim() !== (group.labelEn || autoEnglishCategoryLabel(group.label)) || draft.sortOrder !== (group.sortOrder ?? 100);
  }

  async function decide(i: Suggestion, next: "approved" | "rejected") {
    let label: string | undefined;
    const flags = flagsOf(i);
    if (next === "approved") {
      label = nameOf(i).trim();
      if (!label) { window.alert("Escribe un nombre para el servicio antes de aprobar."); return; }
      const similar = findSimilarCategory(label);
      if (similar && !window.confirm(`Ya existe un servicio parecido: "${similar}".\n\nAgregar "${label}" de todos modos?`)) return;
    }
    setBusy(i.id);
    try {
      await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: i.id, status: next, label, labelEn: label ? englishNameOf(i) : undefined, groupId: groupOfSuggestion(i), ...flags }),
      });
      setItems((prev) => prev.filter((x) => x.id !== i.id));
      window.dispatchEvent(new Event("focus"));
    } finally {
      setBusy(null);
    }
  }

  async function saveCatalogItem(item: CatalogCategory) {
    const draft = draftOf(item);
    const label = draft.label.trim();
    const labelEn = draft.labelEn.trim() || autoEnglishCategoryLabel(label);
    if (!label) { window.alert("El servicio necesita un nombre."); return; }
    setBusy(item.id);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          label,
          labelEn,
          groupId: draft.groupId,
          isHidden: false,
          esSalud: item.esSalud,
          supportsVideoconsulta: item.supportsVideoconsulta,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo guardar el servicio.");
        return;
      }
      setCatalog((prev) => prev.map((row) => row.id === item.id ? {
        ...row,
        label,
        labelEn,
        groupId: draft.groupId,
        groupLabel: groups.find((group) => group.id === draft.groupId)?.label ?? row.groupLabel,
      } : row));
      setCatalogDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveGroup(group: CatalogGroup) {
    const draft = groupDraftOf(group);
    const label = draft.label.trim();
    if (!label) return;
    setBusy(`group-${group.id}`);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "group", id: group.id, label, labelEn: draft.labelEn.trim() || autoEnglishCategoryLabel(label), sortOrder: draft.sortOrder }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo guardar la sección.");
        return;
      }
      await loadCatalog();
      setGroupDrafts((prev) => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  async function updateCatalogFlag(item: CatalogCategory, next: Partial<Pick<CatalogCategory, "esSalud" | "supportsVideoconsulta">>) {
    const updated = { ...item, ...next };
    setCatalog((prev) => prev.map((row) => row.id === item.id ? updated : row));
    setBusy(item.id);
    try {
      await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          label: item.label,
          labelEn: item.labelEn || autoEnglishCategoryLabel(item.label),
          groupId: item.groupId,
          isHidden: item.isHidden,
          esSalud: updated.esSalud,
          supportsVideoconsulta: updated.supportsVideoconsulta,
        }),
      });
    } finally {
      setBusy(null);
    }
  }

  async function addService(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = newServiceName.trim();
    if (!label) return;
    setBusy("new-service");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, labelEn: newServiceNameEn.trim() || autoEnglishCategoryLabel(label), groupId: newServiceGroupId, ...newServiceFlags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo agregar el servicio.");
        return;
      }
      setNewServiceName("");
      setNewServiceNameEn("");
      setNewServiceGroupId(groups[0]?.id || "profesional");
      setNewServiceFlags({ esSalud: false, supportsVideoconsulta: false });
      await loadCatalog();
    } finally {
      setBusy(null);
    }
  }

  async function addGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = newGroupName.trim();
    if (!label) return;
    setBusy("new-group");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "group", label, labelEn: newGroupNameEn.trim() || autoEnglishCategoryLabel(label) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo agregar la sección.");
        return;
      }
      setNewGroupName("");
      setNewGroupNameEn("");
      await loadCatalog();
    } finally {
      setBusy(null);
    }
  }

  async function deleteService(item: CatalogCategory) {
    const message = item.source === "base"
      ? `¿Ocultar "${item.label}" del catálogo?\n\nYa no aparecerá para nuevos perfiles, búsquedas o solicitudes. Los datos históricos que ya usaban este servicio se mantienen.`
      : `¿Eliminar "${item.label}"?\n\nEste servicio agregado se quitará del catálogo.`;
    if (!window.confirm(message)) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/admin/categories?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo eliminar el servicio.");
        return;
      }
      setCatalog((prev) => prev.filter((row) => row.id !== item.id));
    } finally {
      setBusy(null);
    }
  }

  async function deleteGroup(group: CatalogGroup) {
    const inUse = catalog.filter((item) => item.groupId === group.id).length;
    if (inUse > 0) {
      window.alert(`Esta sección tiene ${inUse} servicios. Mueve esos servicios antes de eliminarla.`);
      return;
    }
    if (!window.confirm(`¿Eliminar la sección "${group.label}"?`)) return;
    setBusy(`group-${group.id}`);
    try {
      const res = await fetch(`/api/admin/categories?groupId=${encodeURIComponent(group.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo eliminar la sección.");
        return;
      }
      await loadCatalog();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Tag className="h-5 w-5 text-[#009FD9]" />
            <h1 className="text-xl font-bold text-[#111827]">Catálogo de servicios</h1>
          </div>
          <p className="max-w-2xl text-sm text-[#6b7280]">
            Administra secciones, servicios, traducciones y reglas de salud o videoconsulta.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-1 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: "services", label: "Servicios", icon: Tag },
            { id: "groups", label: "Secciones", icon: Layers3 },
            { id: "suggestions", label: "Sugerencias", icon: Check },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === view) return;
                  setLoading(true);
                  setView(tab.id as "suggestions" | "services" | "groups");
                }}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${view === tab.id ? "bg-[#009FD9] text-white" : "text-[#374151] hover:bg-[#f9fafb]"}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "suggestions" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[#d8eef8] bg-[#f8fbfe] p-4">
            <p className="text-sm font-bold text-[#162543]">Revisión asistida</p>
            <p className="mt-1 text-sm leading-6 text-[#5f6b7a]">
              La app propone nombre en inglés, sección, salud y videoconsulta. El admin confirma o ajusta antes de publicar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (s.id === status) return;
                  setLoading(true);
                  setStatus(s.id);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${status === s.id ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#009FD9]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[#e5e7eb] bg-white py-16 text-center text-[#9ca3af]">
              <Tag className="mx-auto mb-2 h-10 w-10 text-[#cbd5e1]" />
              <p className="text-sm">No hay sugerencias {status === "pending" ? "pendientes" : status === "approved" ? "aprobadas" : "rechazadas"}.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
              {items.map((i) => {
                const flags = flagsOf(i);
                return (
                  <div key={i.id} className="grid gap-3 border-b border-[#f1f5f9] p-4 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_220px_210px_auto] xl:items-center">
                    <div className="min-w-0">
                      {status === "pending" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <FieldLabel>Servicio</FieldLabel>
                            <input
                              value={nameOf(i)}
                              onChange={(e) => {
                                setEdits((p) => ({ ...p, [i.id]: e.target.value }));
                                setEnglishEdits((p) => p[i.id] ? p : ({ ...p, [i.id]: autoEnglishCategoryLabel(e.target.value) }));
                              }}
                              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                            />
                          </div>
                          <div>
                            <FieldLabel>Inglés</FieldLabel>
                            <input
                              value={englishNameOf(i)}
                              onChange={(e) => setEnglishEdits((p) => ({ ...p, [i.id]: e.target.value }))}
                              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-[#111827]">{i.suggested_name || i.label}</p>
                      )}
                      <p className="mt-2 text-xs text-[#9ca3af]">Sugerida el {new Date(i.created_at).toLocaleDateString("es-CR")}</p>
                    </div>
                    {status === "pending" && (
                      <>
                        <div>
                          <FieldLabel>Sección</FieldLabel>
                          <select
                            value={groupOfSuggestion(i)}
                            onChange={(e) => setSuggestionGroups((p) => ({ ...p, [i.id]: e.target.value }))}
                            className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                          >
                            {groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Toggle checked={flags.esSalud} label="Salud" onChange={(v) => setFlagEdits((p) => ({ ...p, [i.id]: { ...flags, esSalud: v } }))} />
                          <Toggle checked={flags.supportsVideoconsulta} label="Video" onChange={(v) => setFlagEdits((p) => ({ ...p, [i.id]: { ...flags, supportsVideoconsulta: v } }))} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button onClick={() => decide(i, "approved")} disabled={busy === i.id} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#16a34a] px-3 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50">
                            {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
                          </button>
                          <button onClick={() => decide(i, "rejected")} disabled={busy === i.id} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#374151] hover:bg-gray-50 disabled:opacity-50">
                            <X className="h-4 w-4" /> Rechazar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {view === "services" && (
        <section className="space-y-4">
          <form onSubmit={addService} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto] lg:items-end">
              <div>
                <FieldLabel>Servicio en español</FieldLabel>
                <input
                  value={newServiceName}
                  onChange={(e) => {
                    setNewServiceName(e.target.value);
                    if (!newServiceNameEn) setNewServiceNameEn(autoEnglishCategoryLabel(e.target.value));
                  }}
                  placeholder="Ejemplo: Cardiología"
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <div>
                <FieldLabel>Servicio en inglés</FieldLabel>
                <input
                  value={newServiceNameEn}
                  onChange={(e) => setNewServiceNameEn(e.target.value)}
                  placeholder="English service name"
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <div>
                <FieldLabel>Sección</FieldLabel>
                <select
                  value={newServiceGroupId}
                  onChange={(e) => setNewServiceGroupId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                >
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Toggle checked={newServiceFlags.esSalud} label="Salud" onChange={(v) => setNewServiceFlags((p) => ({ ...p, esSalud: v }))} />
                <Toggle checked={newServiceFlags.supportsVideoconsulta} label="Video" onChange={(v) => setNewServiceFlags((p) => ({ ...p, supportsVideoconsulta: v }))} />
                <button type="submit" disabled={!newServiceName.trim() || busy === "new-service"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#009FD9] px-4 text-sm font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">
                  {busy === "new-service" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Agregar
                </button>
              </div>
            </div>
          </form>

          <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar servicio o sección"
                className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "all", label: "Todos" },
                { id: "custom", label: "Agregados" },
                { id: "health", label: "Salud" },
                { id: "video", label: "Video" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setServiceFilter(filter.id as "all" | "custom" | "health" | "video")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${serviceFilter === filter.id ? "border-[#009FD9] bg-[#EBF5FB] text-[#0077a3]" : "border-[#e5e7eb] bg-white text-[#374151]"}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
              {filteredCatalog.map((item) => (
                <div key={item.id} className="grid gap-3 border-b border-[#f1f5f9] p-4 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_220px_210px_auto] xl:items-center">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <input
                      value={draftOf(item).label}
                      onChange={(e) => setCatalogDrafts((prev) => {
                        const draft = draftOf(item);
                        const previousAuto = autoEnglishCategoryLabel(draft.label);
                        const nextLabel = e.target.value;
                        return { ...prev, [item.id]: { ...draft, label: nextLabel, labelEn: draft.labelEn === previousAuto ? autoEnglishCategoryLabel(nextLabel) : draft.labelEn } };
                      })}
                      aria-label="Nombre del servicio"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <input
                      value={draftOf(item).labelEn}
                      onChange={(e) => setCatalogDrafts((prev) => ({ ...prev, [item.id]: { ...draftOf(item), labelEn: e.target.value } }))}
                      aria-label="Nombre del servicio en inglés"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                  </div>
                  <select
                    value={draftOf(item).groupId}
                    onChange={(e) => setCatalogDrafts((prev) => ({ ...prev, [item.id]: { ...draftOf(item), groupId: e.target.value } }))}
                    aria-label="Sección del servicio"
                    className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#64748b] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                  >
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                  </select>
                  <div className="flex flex-wrap gap-1.5">
                    <Toggle checked={item.esSalud} label="Salud" onChange={(v) => updateCatalogFlag(item, { esSalud: v })} />
                    <Toggle checked={item.supportsVideoconsulta} label="Video" onChange={(v) => updateCatalogFlag(item, { supportsVideoconsulta: v })} />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {hasDraftChanges(item) && (
                      <button type="button" onClick={() => saveCatalogItem(item)} disabled={busy === item.id} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#009FD9] px-3 text-xs font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">
                        <Save className="h-3.5 w-3.5" /> Guardar
                      </button>
                    )}
                    <button type="button" onClick={() => deleteService(item)} disabled={busy === item.id} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                    {busy === item.id && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
                  </div>
                </div>
              ))}
              {filteredCatalog.length === 0 && <div className="py-14 text-center text-sm text-[#9ca3af]">No hay servicios con ese filtro.</div>}
            </div>
          )}
        </section>
      )}

      {view === "groups" && (
        <section className="space-y-4">
          <form onSubmit={addGroup} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <div>
                <FieldLabel>Sección en español</FieldLabel>
                <input
                  value={newGroupName}
                  onChange={(e) => {
                    setNewGroupName(e.target.value);
                    if (!newGroupNameEn) setNewGroupNameEn(autoEnglishCategoryLabel(e.target.value));
                  }}
                  placeholder="Ejemplo: Servicios náuticos"
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <div>
                <FieldLabel>Sección en inglés</FieldLabel>
                <input
                  value={newGroupNameEn}
                  onChange={(e) => setNewGroupNameEn(e.target.value)}
                  placeholder="English section name"
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <button type="submit" disabled={!newGroupName.trim() || busy === "new-group"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#009FD9] px-4 text-sm font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">
                {busy === "new-group" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Agregar sección
              </button>
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
              {groups.map((group) => {
                const draft = groupDraftOf(group);
                const inUse = catalog.filter((item) => item.groupId === group.id).length;
                return (
                  <div key={group.id} className="grid gap-3 border-b border-[#f1f5f9] p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] lg:items-center">
                    <input
                      value={draft.label}
                      onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [group.id]: { ...draft, label: e.target.value } }))}
                      aria-label="Nombre de la sección"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <input
                      value={draft.labelEn}
                      onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [group.id]: { ...draft, labelEn: e.target.value } }))}
                      aria-label="Nombre de la sección en inglés"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [group.id]: { ...draft, sortOrder: Number(e.target.value) || 100 } }))}
                      aria-label="Orden"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <div className="flex justify-end gap-2">
                      {hasGroupChanges(group) && (
                        <button type="button" onClick={() => saveGroup(group)} disabled={busy === `group-${group.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#009FD9] px-3 text-xs font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">
                          <Save className="h-3.5 w-3.5" /> Guardar
                        </button>
                      )}
                      <button type="button" onClick={() => deleteGroup(group)} disabled={busy === `group-${group.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
