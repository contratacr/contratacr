"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Layers3, Loader2, Plus, Save, Search, Tag, Trash2, X } from "lucide-react";
import {
  ALL_CATEGORIES,
  autoEnglishCategoryLabel,
  classifySuggestedCategory,
  normalizeText,
  searchCategories,
} from "@/lib/data/categories";
import { notifyCategoryCatalogChanged } from "@/lib/data/use-custom-categories";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

type Suggestion = {
  id: string;
  label: string;
  labelEn?: string | null;
  suggested_name?: string | null;
  suggested_by?: string | null;
  suggestedByName?: string | null;
  suggestedByEmail?: string | null;
  suggestedByBusinessName?: string | null;
  review_reason?: string | null;
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
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]">
      <span className={`grid h-5 w-5 place-items-center rounded-[4px] border bg-white ${checked ? "border-[#009FD9] text-[#009FD9]" : "border-[#b8c5d3] text-transparent"}`} aria-hidden="true">
        <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
      </span>
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#8a94a6]">{children}</label>;
}

type AdminDialogState = {
  title: string;
  description: string;
  detail?: string;
  input?: {
    value: string;
    placeholder?: string;
    maxLength?: number;
    onChange: (value: string) => void;
    label?: string;
  };
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm?: () => void | Promise<void>;
  rejectSuggestionId?: string;
};

const REVIEW_REASON_MAX_LENGTH = 1000;

function AdminDialog({
  dialog,
  busy,
  onClose,
  onConfirm,
}: {
  dialog: AdminDialogState | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!dialog) return null;

  const danger = dialog.tone === "danger";
  return (
    <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[80] flex items-center justify-center bg-[#0f172a]/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" className="app-centered-modal max-h-[calc(var(--app-visual-viewport-height)-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[#e5e7eb] bg-white shadow-2xl">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p id="admin-dialog-title" className="text-lg font-bold text-[#111827]">{dialog.title}</p>
              <p className="mt-2 text-sm leading-6 text-[#4b5563]">{dialog.description}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="rounded-full p-1 text-[#9ca3af] transition hover:bg-[#f3f4f6] hover:text-[#111827] disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
          </div>
          {dialog.detail && (
            <div className={`mt-4 rounded-xl border px-3 py-2 text-sm leading-5 ${danger ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]" : "border-[#bfdbfe] bg-[#eff6ff] text-[#1e3a8a]"}`}>
              {dialog.detail}
            </div>
          )}
          {dialog.input && (
            <div className="mt-4 space-y-1.5">
              {dialog.input.label && <p className="text-xs font-semibold text-[#4b5563]">{dialog.input.label}</p>}
              <textarea
                value={dialog.input.value}
                onChange={(e) => dialog.input?.onChange?.(e.target.value)}
                maxLength={dialog.input.maxLength}
                placeholder={dialog.input.placeholder}
                rows={3}
                className="h-24 w-full rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/20"
              />
              {dialog.input.maxLength && (
                <p className="text-right text-[11px] font-medium text-[#9ca3af]">
                  {dialog.input.value.length}/{dialog.input.maxLength}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#eef2f7] bg-[#f8fafc] p-4 sm:flex-row sm:justify-end">
          {dialog.cancelLabel && (
            <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d1d5db] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:opacity-50">
              {dialog.cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-50 ${danger ? "bg-[#dc2626] hover:bg-[#b91c1c]" : "bg-[#009FD9] hover:bg-[#0089bb]"}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminCategories() {
  const [view, setView] = useState<"suggestions" | "services" | "groups">("services");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<"all" | "custom" | "health" | "video">("all");
  // Professionals per service (primary category or secondary profession) from
  // /api/admin/coverage, so the catalogue shows which services have supply.
  const [proCounts, setProCounts] = useState<Record<string, { professionals: number; verified: number }>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, { label: string; labelEn: string; groupId: string }>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, { label: string; labelEn: string; sortOrder: number }>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [englishEdits, setEnglishEdits] = useState<Record<string, string>>({});
  const [manualEnglishEdits, setManualEnglishEdits] = useState<Record<string, boolean>>({});
  const [suggestionGroups, setSuggestionGroups] = useState<Record<string, string>>({});
  const [flagEdits, setFlagEdits] = useState<Record<string, { esSalud: boolean; supportsVideoconsulta: boolean }>>({});
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceNameEn, setNewServiceNameEn] = useState("");
  const [newServiceNameEnManual, setNewServiceNameEnManual] = useState(false);
  const [, setNewServiceNameManual] = useState(false);
  const [newServiceGroupId, setNewServiceGroupId] = useState("profesional");
  const [newServiceFlags, setNewServiceFlags] = useState({ esSalud: false, supportsVideoconsulta: false });
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupNameEn, setNewGroupNameEn] = useState("");
  const [, setNewGroupNameManual] = useState(false);
  const [newGroupNameEnManual, setNewGroupNameEnManual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AdminDialogState | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const rejectReasonRefs = useRef<Record<string, string>>({});
  const translatedSuggestionIds = useRef<Set<string>>(new Set());

  function showNotice(title: string, description: string, detail?: string, tone: AdminDialogState["tone"] = "default") {
    setDialog({ title, description, detail, tone, confirmLabel: "Entendido" });
  }

  async function confirmDialogAction() {
    const onConfirm = dialog?.onConfirm;
    if (!onConfirm) {
      setDialog(null);
      return;
    }
    const currentDialog = dialog;
    setDialogBusy(true);
    try {
      await onConfirm();
      setDialog((latest) => {
        if (latest !== currentDialog) return latest;
        if (currentDialog?.rejectSuggestionId) {
          delete rejectReasonRefs.current[currentDialog.rejectSuggestionId];
        }
        return null;
      });
    } finally {
      setDialogBusy(false);
    }
  }

  function closeDialog() {
    if (dialog?.rejectSuggestionId) {
      delete rejectReasonRefs.current[dialog.rejectSuggestionId];
    }
    setDialog(null);
  }

  async function loadCatalog() {
    const [data, suggestions] = await Promise.all([
      fetch("/api/admin/categories?status=catalog").then((r) => r.json()),
      fetch("/api/admin/categories?status=pending").then((r) => r.json()),
    ]);
    setCatalog(data.catalog ?? []);
    setGroups(data.groups ?? []);
    setPendingCount(suggestions.pendingCount ?? 0);
    if (!newServiceGroupId && data.groups?.[0]?.id) setNewServiceGroupId(data.groups[0].id);
    void fetch("/api/admin/coverage")
      .then((r) => r.json())
      .then((coverage: { services?: Array<{ id: string; professionals: number; verified: number }> }) => {
        setProCounts(Object.fromEntries((coverage.services ?? []).map((service) => [service.id, { professionals: service.professionals, verified: service.verified }])));
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (view === "suggestions") {
          const [suggestions, catalogData] = await Promise.all([
            fetch(`/api/admin/categories?status=${status}`).then((r) => r.json()),
            groups.length ? Promise.resolve(null) : fetch("/api/admin/categories?status=catalog").then((r) => r.json()),
          ]);
          if (cancelled) return;
          setItems(suggestions.categories ?? []);
          setPendingCount(suggestions.pendingCount ?? 0);
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

  const hasLocalEdits =
    busy !== null ||
    newServiceName.trim().length > 0 ||
    newServiceNameEn.trim().length > 0 ||
    newGroupName.trim().length > 0 ||
    newGroupNameEn.trim().length > 0 ||
    Object.keys(catalogDrafts).length > 0 ||
    Object.keys(groupDrafts).length > 0 ||
    Object.keys(edits).length > 0 ||
    Object.keys(englishEdits).length > 0 ||
    Object.keys(manualEnglishEdits).length > 0 ||
    Object.keys(suggestionGroups).length > 0 ||
    Object.keys(flagEdits).length > 0;

  useAdminAutoRefresh(() => {
    if (hasLocalEdits) return;
    const run = async () => {
      if (view === "suggestions") {
        const [suggestions, catalogData] = await Promise.all([
          fetch(`/api/admin/categories?status=${status}`).then((r) => r.json()),
          groups.length ? Promise.resolve(null) : fetch("/api/admin/categories?status=catalog").then((r) => r.json()),
        ]);
        setItems(suggestions.categories ?? []);
        setPendingCount(suggestions.pendingCount ?? 0);
        if (!groups.length && catalogData) {
          setCatalog(catalogData.catalog ?? []);
          setGroups(catalogData.groups ?? []);
        }
      } else {
        await loadCatalog();
      }
    };
    void run();
  }, [groups.length, hasLocalEdits, status, view]);

  const nameOf = (i: Suggestion) => edits[i.id] ?? (i.suggested_name || i.label);
  const englishNameOf = (i: Suggestion) => englishEdits[i.id] ?? i.labelEn ?? autoEnglishCategoryLabel(nameOf(i));
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

  // Without a search or filter the catalogue is long; show it per category,
  // collapsed, with what each category holds. A search flattens it again.
  const flatCatalog = !!normalizeText(query) || serviceFilter !== "all";
  const catalogSections = useMemo(() => {
    if (flatCatalog) return [{ id: "all", label: "", items: filteredCatalog }];
    const order = new Map(groups.map((group, index) => [group.id, index]));
    const sections = new Map<string, { id: string; label: string; items: CatalogCategory[] }>();
    for (const item of filteredCatalog) {
      const section = sections.get(item.groupId) ?? { id: item.groupId, label: item.groupLabel, items: [] };
      section.items.push(item);
      sections.set(item.groupId, section);
    }
    return [...sections.values()].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.label.localeCompare(b.label, "es"));
  }, [filteredCatalog, flatCatalog, groups]);

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
    return draft.label.trim() !== group.label || draft.labelEn.trim() !== (group.labelEn || autoEnglishCategoryLabel(group.label));
  }

  function suggestionSender(i: Suggestion) {
    const name = i.suggestedByBusinessName || i.suggestedByName;
    if (name && i.suggestedByEmail) return `${name} · ${i.suggestedByEmail}`;
    return name || i.suggestedByEmail || "";
  }

  async function fetchEnglishSuggestion(label: string) {
    const clean = label.trim();
    if (!clean) return "";
    try {
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      if (!res.ok) return autoEnglishCategoryLabel(clean);
      const data = await res.json();
      return typeof data.labelEn === "string" && data.labelEn.trim() ? data.labelEn.trim() : autoEnglishCategoryLabel(clean);
    } catch {
      return autoEnglishCategoryLabel(clean);
    }
  }

  async function fetchSpanishSuggestion(label: string) {
    const clean = label.trim();
    if (!clean) return "";
    try {
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, target: "es" }),
      });
      if (!res.ok) return clean;
      const data = await res.json();
      return typeof data.labelEs === "string" && data.labelEs.trim() ? data.labelEs.trim() : clean;
    } catch {
      return clean;
    }
  }

  useEffect(() => {
    if (view !== "suggestions" || status !== "pending" || !items.length) return;
    const missing = items.filter((item) => {
      return !manualEnglishEdits[item.id] && !englishEdits[item.id] && !item.labelEn && !translatedSuggestionIds.current.has(item.id);
    });
    if (!missing.length) return;

    let cancelled = false;
    missing.forEach((item) => translatedSuggestionIds.current.add(item.id));

    const run = async () => {
      const translated = await Promise.all(missing.map(async (item) => {
        const labelEn = await fetchEnglishSuggestion(nameOf(item));
        return [item.id, labelEn] as const;
      }));
      if (cancelled) return;
      setEnglishEdits((prev) => {
        const next = { ...prev };
        for (const [id, labelEn] of translated) {
          if (labelEn && !manualEnglishEdits[id]) next[id] = labelEn;
        }
        return next;
      });
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status, items, englishEdits, manualEnglishEdits]);

  async function refreshSuggestionEnglish(i: Suggestion) {
    if (manualEnglishEdits[i.id]) return;
    const translated = await fetchEnglishSuggestion(nameOf(i));
    if (translated && !manualEnglishEdits[i.id]) setEnglishEdits((p) => ({ ...p, [i.id]: translated }));
  }

  async function refreshNewServiceEnglish() {
    if (newServiceNameEnManual) return;
    const translated = await fetchEnglishSuggestion(newServiceName);
    if (translated && !newServiceNameEnManual) setNewServiceNameEn(translated);
  }

  async function refreshNewServiceSpanish() {
    if (newServiceName.trim()) return;
    const translated = await fetchSpanishSuggestion(newServiceNameEn);
    if (translated && !newServiceName.trim()) setNewServiceName(translated);
  }

  async function refreshNewGroupEnglish() {
    if (newGroupNameEnManual) return;
    const translated = await fetchEnglishSuggestion(newGroupName);
    if (translated && !newGroupNameEnManual) setNewGroupNameEn(translated);
  }

  async function refreshNewGroupSpanish() {
    if (newGroupName.trim()) return;
    const translated = await fetchSpanishSuggestion(newGroupNameEn);
    if (translated && !newGroupName.trim()) setNewGroupName(translated);
  }

  async function refreshCatalogEnglish(item: CatalogCategory) {
    const draft = draftOf(item);
    const previousAuto = autoEnglishCategoryLabel(draft.label);
    const shouldRefreshEnglish = draft.labelEn === previousAuto || normalizeText(draft.labelEn) === normalizeText(draft.label);
    if (!shouldRefreshEnglish) return;
    const translated = await fetchEnglishSuggestion(draft.label);
    if (!translated) return;
    setCatalogDrafts((prev) => ({ ...prev, [item.id]: { ...draftOf(item), labelEn: translated } }));
  }

  async function applySuggestionDecision(
    i: Suggestion,
    next: "approved" | "rejected",
    label?: string,
    labelEn?: string,
    groupId?: string,
    flags?: { esSalud: boolean; supportsVideoconsulta: boolean },
    reviewReason?: string
  ) {
    setBusy(i.id);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: i.id,
          status: next,
          label,
          labelEn,
          groupId: groupId ?? groupOfSuggestion(i),
          reviewReason,
          ...(flags ?? flagsOf(i)),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        showNotice(
          next === "approved" ? "No se pudo aprobar la sugerencia" : "No se pudo rechazar la sugerencia",
          data.error || "Intenta de nuevo."
        );
        return;
      }

      setItems((prev) => prev.filter((x) => x.id !== i.id));
      if (next === "approved" || next === "rejected") setPendingCount((count) => Math.max(0, count - 1));
      if (next === "approved") notifyCategoryCatalogChanged();
    } finally {
      setBusy(null);
    }
  }

  async function decide(i: Suggestion, next: "approved" | "rejected") {
    let label: string | undefined;
    const flags = flagsOf(i);
    const groupId = groupOfSuggestion(i);
    const labelEn = next === "approved" ? englishNameOf(i) : undefined;
    if (next === "approved") {
      label = nameOf(i).trim();
      if (!label) {
        showNotice("Falta el nombre del servicio", "Agrega el nombre antes de aprobar esta sugerencia.");
        return;
      }
      const similar = findSimilarCategory(label);
      if (similar) {
        setDialog({
          title: "Servicio parecido encontrado",
          description: `Ya existe un servicio parecido: "${similar}".`,
          detail: `Puedes revisar la sugerencia o aprobar "${label}" de todos modos si realmente es un servicio distinto.`,
          confirmLabel: "Aprobar de todos modos",
          cancelLabel: "Revisar",
          onConfirm: () => applySuggestionDecision(i, next, label, labelEn, groupId, flags),
        });
        return;
      }
    }

    if (next === "rejected") {
      const existing = rejectReasonRefs.current[i.id] ?? i.review_reason ?? "";
      rejectReasonRefs.current[i.id] = existing;
      setDialog({
        title: "Rechazar sugerencia",
        description: `Si quieres, agrega un motivo para ayudar a quien sugirió el servicio.`,
        detail: `Sugerencia: "${nameOf(i)}".`,
        confirmLabel: "Rechazar",
        cancelLabel: "Cancelar",
        tone: "danger",
        rejectSuggestionId: i.id,
        input: {
          label: "Motivo (opcional)",
          placeholder: "Ej. Servicio duplicado o no suficientemente específico",
          maxLength: REVIEW_REASON_MAX_LENGTH,
          value: existing,
          onChange: (value) => {
            rejectReasonRefs.current[i.id] = value;
            setDialog((prev) => {
              if (!prev?.input) return prev;
              return {
                ...prev,
                input: {
                  ...prev.input,
                  value,
                },
              };
            });
          },
        },
        onConfirm: () => applySuggestionDecision(i, next, label, labelEn, groupId, flags, (rejectReasonRefs.current[i.id] ?? "").trim()),
      });
      return;
    }

    await applySuggestionDecision(i, next, label, labelEn, groupId, flags);
  }

  async function saveCatalogItem(item: CatalogCategory) {
    const draft = draftOf(item);
    const label = draft.label.trim();
    const labelEn = draft.labelEn.trim() || autoEnglishCategoryLabel(label);
    if (!label) { showNotice("Falta el nombre del servicio", "Agrega el nombre antes de guardar los cambios."); return; }
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
        showNotice("No se pudo guardar el servicio", data.error || "Inténtalo de nuevo.");
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
      notifyCategoryCatalogChanged();
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
        showNotice("No se pudo guardar la categoría", data.error || "Inténtalo de nuevo.");
        return;
      }
      await loadCatalog();
      setGroupDrafts((prev) => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
      notifyCategoryCatalogChanged();
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
      notifyCategoryCatalogChanged();
    } finally {
      setBusy(null);
    }
  }

  async function addService(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = newServiceName.trim() || await fetchSpanishSuggestion(newServiceNameEn);
    const labelEn = newServiceNameEn.trim() || await fetchEnglishSuggestion(label);
    if (!label && !labelEn) return;
    setBusy("new-service");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, labelEn, groupId: newServiceGroupId, ...newServiceFlags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showNotice("No se pudo agregar el servicio", data.error || "Inténtalo de nuevo.");
        return;
      }
      setNewServiceName("");
      setNewServiceNameEn("");
      setNewServiceNameManual(false);
      setNewServiceNameEnManual(false);
      setNewServiceGroupId(groups[0]?.id || "profesional");
      setNewServiceFlags({ esSalud: false, supportsVideoconsulta: false });
      await loadCatalog();
      notifyCategoryCatalogChanged();
    } finally {
      setBusy(null);
    }
  }

  async function addGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = newGroupName.trim() || await fetchSpanishSuggestion(newGroupNameEn);
    const labelEn = newGroupNameEn.trim() || await fetchEnglishSuggestion(label);
    if (!label && !labelEn) return;
    setBusy("new-group");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "group", label, labelEn }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showNotice("No se pudo agregar la categoría", data.error || "Inténtalo de nuevo.");
        return;
      }
      setNewGroupName("");
      setNewGroupNameEn("");
      setNewGroupNameManual(false);
      setNewGroupNameEnManual(false);
      await loadCatalog();
      notifyCategoryCatalogChanged();
    } finally {
      setBusy(null);
    }
  }

  async function deleteService(item: CatalogCategory) {
    const isBase = item.source === "base";
    const inUse = proCounts[item.id]?.professionals ?? 0;
    if (inUse > 0) {
      showNotice(
        isBase ? "No se puede ocultar todavía" : "No se puede eliminar todavía",
        `${inUse} ${inUse === 1 ? "profesional ofrece" : "profesionales ofrecen"} "${item.label}". Si lo quitas, quedarían con un servicio que ya no existe.`,
        "Reasígnalos a otro servicio desde sus perfiles y vuelve a intentarlo.",
        "danger"
      );
      return;
    }
    setDialog({
      title: isBase ? "Ocultar servicio" : "Eliminar servicio",
      description: isBase
        ? `"${item.label}" dejará de aparecer para nuevos perfiles, búsquedas y solicitudes.`
        : `"${item.label}" dejará de aparecer en el catálogo de la app.`,
      detail: "Los datos históricos se mantienen.",
      confirmLabel: isBase ? "Ocultar servicio" : "Eliminar servicio",
      cancelLabel: "Cancelar",
      tone: "danger",
      onConfirm: () => deleteServiceConfirmed(item),
    });
  }

  async function deleteServiceConfirmed(item: CatalogCategory) {
    setBusy(item.id);
    try {
      const res = await fetch(`/api/admin/categories?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showNotice("No se pudo eliminar el servicio", data.error || "Inténtalo de nuevo.", undefined, "danger");
        return;
      }
      setCatalog((prev) => prev.filter((row) => row.id !== item.id));
      notifyCategoryCatalogChanged();
    } finally {
      setBusy(null);
    }
  }

  async function deleteGroup(group: CatalogGroup) {
    const inUse = catalog.filter((item) => item.groupId === group.id).length;
    if (inUse > 0) {
      showNotice(
        "Esta categoría todavía tiene servicios",
        `Tiene ${inUse} servicio${inUse === 1 ? "" : "s"} asociado${inUse === 1 ? "" : "s"}.`,
        "Mueve esos servicios a otra categoría y vuelve a intentarlo."
      );
      return;
    }
    setDialog({
      title: "Eliminar categoría",
      description: `"${group.label}" dejará de aparecer en el catálogo.`,
      detail: "Esta acción solo oculta la categoría. No elimina servicios ni datos históricos.",
      confirmLabel: "Eliminar categoría",
      cancelLabel: "Cancelar",
      tone: "danger",
      onConfirm: () => deleteGroupConfirmed(group),
    });
  }

  async function deleteGroupConfirmed(group: CatalogGroup) {
    setBusy(`group-${group.id}`);
    try {
      const res = await fetch(`/api/admin/categories?groupId=${encodeURIComponent(group.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showNotice("No se pudo eliminar la categoría", data.error || "Inténtalo de nuevo.", undefined, "danger");
        return;
      }
      await loadCatalog();
      notifyCategoryCatalogChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Tag className="h-5 w-5 text-[#009FD9]" />
            <h1 className="text-xl font-bold text-[#111827]">Catálogo de servicios</h1>
          </div>
          <p className="max-w-2xl text-sm text-[#6b7280]">
            Administra categorías, servicios, traducciones y reglas de salud o videoconsulta.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-1 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: "services", label: "Servicios", icon: Tag },
            { id: "groups", label: "Categorías", icon: Layers3 },
            { id: "suggestions", label: "Sugerencias", icon: Check, count: pendingCount },
          ].map((tab) => {
            const Icon = tab.icon;
            const count = "count" in tab ? (tab.count ?? 0) : 0;
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
                {count > 0 && (
                  <span className={`ml-0.5 rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums ${view === tab.id ? "bg-white/20 text-white" : "bg-[#EBF5FB] text-[#0077a3]"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {view === "suggestions" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[#d8eef8] bg-[#f8fbfe] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-[#162543]">Revisión asistida</p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#0077a3] shadow-sm">
                {pendingCount} pendientes
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#5f6b7a]">
              La app propone nombre en inglés, categoría, salud y videoconsulta. El admin confirma o ajusta antes de publicar.
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
                const sender = suggestionSender(i);
                return (
                  <div key={i.id} className="grid gap-3 border-b border-[#f1f5f9] p-4 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_220px_210px_auto] xl:items-start">
                    <div className="min-w-0">
                      {status === "pending" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <FieldLabel>Servicio</FieldLabel>
                            <input
                              value={nameOf(i)}
                              onChange={(e) => {
                                const nextLabel = e.target.value;
                                setEdits((p) => ({ ...p, [i.id]: nextLabel }));
                                if (!manualEnglishEdits[i.id]) {
                                  setEnglishEdits((p) => ({ ...p, [i.id]: autoEnglishCategoryLabel(nextLabel) }));
                                }
                              }}
                              onBlur={() => refreshSuggestionEnglish(i)}
                              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                            />
                          </div>
                          <div>
                            <FieldLabel>Inglés</FieldLabel>
                            <input
                              value={englishNameOf(i)}
                              onChange={(e) => {
                                setManualEnglishEdits((p) => ({ ...p, [i.id]: true }));
                                setEnglishEdits((p) => ({ ...p, [i.id]: e.target.value }));
                              }}
                              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-[#111827]">{i.suggested_name || i.label}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#9ca3af]">
                        <span>Sugerida el {new Date(i.created_at).toLocaleDateString("es-CR")}</span>
                        {sender && <span className="text-[#64748b]">Sugerida por {sender}</span>}
                      </div>
                      {status === "rejected" && i.review_reason && (
                        <p className="mt-2 text-xs text-[#c2410c] [overflow-wrap:anywhere] break-words">
                          Motivo anterior: {i.review_reason}
                        </p>
                      )}
                    </div>
                    {status === "pending" && (
                      <>
                        <div>
                          <FieldLabel>Categoría</FieldLabel>
                          <select
                            value={groupOfSuggestion(i)}
                            onChange={(e) => setSuggestionGroups((p) => ({ ...p, [i.id]: e.target.value }))}
                            className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                          >
                            {groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-1.5 xl:pt-5">
                          <Toggle checked={flags.esSalud} label="Salud" onChange={(v) => setFlagEdits((p) => ({ ...p, [i.id]: { ...flags, esSalud: v } }))} />
                          <Toggle checked={flags.supportsVideoconsulta} label="Video" onChange={(v) => setFlagEdits((p) => ({ ...p, [i.id]: { ...flags, supportsVideoconsulta: v } }))} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 xl:pt-5">
                          <button onClick={() => decide(i, "approved")} disabled={busy !== null} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#16a34a] px-3 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50">
                            {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
                          </button>
                          <button onClick={() => decide(i, "rejected")} disabled={busy !== null} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#374151] hover:bg-gray-50 disabled:opacity-50">
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
                    const nextLabel = e.target.value;
                    setNewServiceNameManual(true);
                    setNewServiceName(nextLabel);
                    if (!newServiceNameEnManual) setNewServiceNameEn(autoEnglishCategoryLabel(nextLabel));
                  }}
                  onBlur={refreshNewServiceEnglish}
                  placeholder=""
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <div>
                <FieldLabel>Servicio en inglés</FieldLabel>
                <input
                  value={newServiceNameEn}
                  onChange={(e) => {
                    setNewServiceNameEnManual(true);
                    setNewServiceNameEn(e.target.value);
                  }}
                  onBlur={refreshNewServiceSpanish}
                  placeholder=""
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <div>
                <FieldLabel>Categoría</FieldLabel>
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
                <button type="submit" disabled={(!newServiceName.trim() && !newServiceNameEn.trim()) || busy === "new-service"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#009FD9] px-4 text-sm font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">
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
                placeholder="Buscar servicio o categoría"
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
              {catalogSections.map((section) => {
                const open = flatCatalog || (openGroups[section.id] ?? false);
                const sectionPros = section.items.reduce((sum, item) => sum + (proCounts[item.id]?.professionals ?? 0), 0);
                const withSupply = section.items.filter((item) => (proCounts[item.id]?.professionals ?? 0) > 0).length;
                return (
                <div key={section.id} className="border-b border-[#f1f5f9] last:border-b-0">
                  {!flatCatalog && (
                    <button
                      type="button"
                      onClick={() => setOpenGroups((current) => ({ ...current, [section.id]: !open }))}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 bg-[#f8fafc] px-4 py-3 text-left hover:bg-[#f1f5f9]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#111827]">{section.label}</span>
                        <span className="block text-xs text-[#6b7280]">{section.items.length} servicios · {withSupply} con profesionales · {sectionPros.toLocaleString("es-CR")} profesionales</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[#9ca3af] transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  )}
                  {open && section.items.map((item) => (
                <div key={item.id} className="grid gap-3 border-b border-[#f1f5f9] p-4 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_220px_210px_auto] xl:items-center">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <input
                      value={draftOf(item).label}
                      onChange={(e) => setCatalogDrafts((prev) => {
                        const draft = draftOf(item);
                        const previousAuto = autoEnglishCategoryLabel(draft.label);
                        const nextLabel = e.target.value;
                        const shouldRefreshEnglish = draft.labelEn === previousAuto || normalizeText(draft.labelEn) === normalizeText(draft.label);
                        return { ...prev, [item.id]: { ...draft, label: nextLabel, labelEn: shouldRefreshEnglish ? autoEnglishCategoryLabel(nextLabel) : draft.labelEn } };
                      })}
                      onBlur={() => refreshCatalogEnglish(item)}
                      aria-label="Nombre del servicio"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <input
                      value={draftOf(item).labelEn}
                      onChange={(e) => setCatalogDrafts((prev) => ({ ...prev, [item.id]: { ...draftOf(item), labelEn: e.target.value } }))}
                      aria-label="Nombre del servicio en inglés"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#374151] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <p className={`text-[11px] font-semibold sm:col-span-2 ${(proCounts[item.id]?.professionals ?? 0) === 0 ? "text-[#b91c1c]" : "text-[#6b7280]"}`}>
                      {(proCounts[item.id]?.professionals ?? 0).toLocaleString("es-CR")} profesionales · {(proCounts[item.id]?.verified ?? 0).toLocaleString("es-CR")} verificados
                      {flatCatalog ? ` · ${item.groupLabel}` : ""}
                    </p>
                  </div>
                  <select
                    value={draftOf(item).groupId}
                    onChange={(e) => setCatalogDrafts((prev) => ({ ...prev, [item.id]: { ...draftOf(item), groupId: e.target.value } }))}
                    aria-label="Categoría del servicio"
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
                </div>
                );
              })}
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
                <FieldLabel>Categoría en español</FieldLabel>
                <input
                  value={newGroupName}
                  onChange={(e) => {
                    const nextLabel = e.target.value;
                    setNewGroupNameManual(true);
                    setNewGroupName(nextLabel);
                    if (!newGroupNameEnManual) setNewGroupNameEn(autoEnglishCategoryLabel(nextLabel));
                  }}
                  onBlur={refreshNewGroupEnglish}
                  placeholder=""
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <div>
                <FieldLabel>Categoría en inglés</FieldLabel>
                <input
                  value={newGroupNameEn}
                  onChange={(e) => {
                    setNewGroupNameEnManual(true);
                    setNewGroupNameEn(e.target.value);
                  }}
                  onBlur={refreshNewGroupSpanish}
                  placeholder=""
                  className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                />
              </div>
              <button type="submit" disabled={(!newGroupName.trim() && !newGroupNameEn.trim()) || busy === "new-group"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#009FD9] px-4 text-sm font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50">
                {busy === "new-group" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Agregar categoría
              </button>
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
              {groups.map((group) => {
                const draft = groupDraftOf(group);
                return (
                  <div key={group.id} className="grid gap-3 border-b border-[#f1f5f9] p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                    <input
                      value={draft.label}
                      onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [group.id]: { ...draft, label: e.target.value } }))}
                      aria-label="Nombre de la categoría"
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
                    />
                    <input
                      value={draft.labelEn}
                      onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [group.id]: { ...draft, labelEn: e.target.value } }))}
                      aria-label="Nombre de la categoría en inglés"
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
      <AdminDialog
        dialog={dialog}
        busy={dialogBusy}
        onClose={() => {
          if (!dialogBusy) {
            closeDialog();
          }
        }}
        onConfirm={confirmDialogAction}
      />
    </>
  );
}
