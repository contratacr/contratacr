"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, Tag, Loader2, HeartPulse, Video, Search, Plus, Trash2 } from "lucide-react";
import { ALL_CATEGORIES, autoEnglishCategoryLabel, classifySuggestedCategory, normalizeText } from "@/lib/data/categories";

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
  groupLabel: string;
  source: "base" | "custom";
  esSalud: boolean;
  supportsVideoconsulta: boolean;
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

function FlagPill({ active, icon, label }: { active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-[#EBF5FB] text-[#0077a3]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
      {icon} {label}
    </span>
  );
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

export function AdminCategories() {
  const [view, setView] = useState<"suggestions" | "catalog">("suggestions");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "health" | "video">("all");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [flagEdits, setFlagEdits] = useState<Record<string, { esSalud: boolean; supportsVideoconsulta: boolean }>>({});
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceFlags, setNewServiceFlags] = useState({ esSalud: false, supportsVideoconsulta: false });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const url = view === "catalog" ? "/api/admin/categories?status=catalog" : `/api/admin/categories?status=${status}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (view === "catalog") setCatalog(data.catalog ?? []);
        else setItems(data.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [view, status]);

  const nameOf = (i: Suggestion) => edits[i.id] ?? (i.suggested_name || i.label);
  const flagsOf = (i: Suggestion) => {
    const review = classifySuggestedCategory(nameOf(i));
    return flagEdits[i.id] ?? { esSalud: review.healthLikely, supportsVideoconsulta: review.videoConsultLikely };
  };

  const filteredCatalog = useMemo(() => {
    const q = normalizeText(query);
    return catalog.filter((item) => {
      if (catalogFilter === "health" && !item.esSalud) return false;
      if (catalogFilter === "video" && !item.supportsVideoconsulta) return false;
      if (!q) return true;
      return normalizeText(`${item.label} ${item.groupLabel} ${item.id}`).includes(q);
    });
  }, [catalog, catalogFilter, query]);

  async function decide(i: Suggestion, next: "approved" | "rejected") {
    let label: string | undefined;
    const flags = flagsOf(i);
    if (next === "approved") {
      label = nameOf(i).trim();
      if (!label) { window.alert("Escribe un nombre para la categoria antes de aprobar."); return; }
      const similar = findSimilarCategory(label);
      if (similar && !window.confirm(`Ya existe una categoria parecida: "${similar}".\n\nAgregar "${label}" de todos modos?`)) return;
    }
    setBusy(i.id);
    try {
      await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: i.id, status: next, label, labelEn: label ? autoEnglishCategoryLabel(label) : undefined, ...flags }),
      });
      setItems((prev) => prev.filter((x) => x.id !== i.id));
      window.dispatchEvent(new Event("focus"));
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
        body: JSON.stringify({ label, labelEn: autoEnglishCategoryLabel(label), ...newServiceFlags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "No se pudo agregar el servicio.");
        return;
      }
      setNewServiceName("");
      setNewServiceFlags({ esSalud: false, supportsVideoconsulta: false });
      setLoading(true);
      const data = await fetch("/api/admin/categories?status=catalog").then((r) => r.json());
      setCatalog(data.catalog ?? []);
    } finally {
      setBusy(null);
      setLoading(false);
    }
  }

  async function deleteService(item: CatalogCategory) {
    if (item.source !== "custom") return;
    if (!window.confirm(`Eliminar "${item.label}" del catalogo?`)) return;
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

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Tag className="h-5 w-5 text-[#009FD9]" />
            <h1 className="text-xl font-bold text-[#111827]">Servicios</h1>
          </div>
          <p className="max-w-2xl text-sm text-[#6b7280]">
            Revisa sugerencias y administra que servicios activan datos de salud o videoconsulta.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-sm">
          {[
            { id: "suggestions", label: "Sugerencias" },
            { id: "catalog", label: "Catalogo de servicios" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === view) return;
                setLoading(true);
                setView(tab.id as "suggestions" | "catalog");
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === tab.id ? "bg-[#009FD9] text-white" : "text-[#374151] hover:bg-[#f9fafb]"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === "suggestions" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <div className="py-16 text-center text-[#9ca3af]">
              <Tag className="mx-auto mb-2 h-10 w-10 text-[#cbd5e1]" />
              <p className="text-sm">No hay sugerencias {status === "pending" ? "pendientes" : status === "approved" ? "aprobadas" : "rechazadas"}.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((i) => {
                const flags = flagsOf(i);
                return (
                  <div key={i.id} className="flex flex-col gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      {status === "pending" ? (
                        <input
                          value={nameOf(i)}
                          onChange={(e) => setEdits((p) => ({ ...p, [i.id]: e.target.value }))}
                          aria-label="Nombre de la categoria"
                          className="-ml-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[#111827] hover:border-[#e5e7eb] focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-[#111827]">{i.suggested_name || i.label}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 px-0.5">
                        <p className="text-xs text-[#9ca3af]">Sugerida el {new Date(i.created_at).toLocaleDateString("es-CR")}</p>
                        <FlagPill active={flags.esSalud} icon={<HeartPulse className="h-3 w-3" />} label="Salud" />
                        <FlagPill active={flags.supportsVideoconsulta} icon={<Video className="h-3 w-3" />} label="Videoconsulta" />
                      </div>
                    </div>
                    {status === "pending" && (
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Toggle checked={flags.esSalud} label="Salud" onChange={(v) => setFlagEdits((p) => ({ ...p, [i.id]: { ...flags, esSalud: v } }))} />
                        <Toggle checked={flags.supportsVideoconsulta} label="Video" onChange={(v) => setFlagEdits((p) => ({ ...p, [i.id]: { ...flags, supportsVideoconsulta: v } }))} />
                        <button onClick={() => decide(i, "approved")} disabled={busy === i.id} className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50">
                          {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
                        </button>
                        <button onClick={() => decide(i, "rejected")} disabled={busy === i.id} className="inline-flex items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-sm font-medium text-[#374151] hover:bg-gray-50 disabled:opacity-50">
                          <X className="h-4 w-4" /> Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <form onSubmit={addService} className="mb-4 rounded-xl border border-[#e5e7eb] bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#8a94a6]">Agregar servicio</label>
                <input
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="Ejemplo: Cardiologia"
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
                {newServiceName.trim() && (
                  <p className="mt-1 text-xs text-[#8a94a6]">Inglés: {autoEnglishCategoryLabel(newServiceName)}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Toggle checked={newServiceFlags.esSalud} label="Salud" onChange={(v) => setNewServiceFlags((p) => ({ ...p, esSalud: v }))} />
                <Toggle checked={newServiceFlags.supportsVideoconsulta} label="Videoconsulta" onChange={(v) => setNewServiceFlags((p) => ({ ...p, supportsVideoconsulta: v }))} />
                <button
                  type="submit"
                  disabled={!newServiceName.trim() || busy === "new-service"}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#009FD9] px-4 text-sm font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50"
                >
                  {busy === "new-service" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Agregar
                </button>
              </div>
            </div>
          </form>

          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar categoria"
                className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
              />
            </div>
            <div className="flex gap-2">
              {[
                { id: "all", label: "Todas" },
                { id: "health", label: "Salud" },
                { id: "video", label: "Videoconsulta" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setCatalogFilter(filter.id as "all" | "health" | "video")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${catalogFilter === filter.id ? "border-[#009FD9] bg-[#EBF5FB] text-[#0077a3]" : "border-[#e5e7eb] bg-white text-[#374151]"}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
              {filteredCatalog.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 border-b border-[#f1f5f9] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#111827]">{item.label}</p>
                    <p className="text-xs text-[#9ca3af]">
                      {item.groupLabel} · {item.source === "base" ? "Base" : "Agregado"}
                      {item.source === "custom" && <> · EN: {item.labelEn || autoEnglishCategoryLabel(item.label)}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Toggle checked={item.esSalud} label="Salud" onChange={(v) => updateCatalogFlag(item, { esSalud: v })} />
                    <Toggle checked={item.supportsVideoconsulta} label="Videoconsulta" onChange={(v) => updateCatalogFlag(item, { supportsVideoconsulta: v })} />
                    {item.source === "custom" && (
                      <button
                        type="button"
                        onClick={() => deleteService(item)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </button>
                    )}
                    {busy === item.id && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
                  </div>
                </div>
              ))}
              {filteredCatalog.length === 0 && (
                <div className="py-14 text-center text-sm text-[#9ca3af]">No hay categorias con ese filtro.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
