"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageUp, X, Loader2, Pencil } from "lucide-react";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MAX_PORTFOLIO_PHOTOS, cldThumb } from "@/lib/cloudinary";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getCategoryLabel } from "@/lib/data/categories";
import { casoProfession, type ServiceLike } from "@/lib/services";

// Casos de éxito (work photos) are organized BY PROFESSION (category). An item stores its
// `profession`; the legacy `serviceId` is kept for back-compat (existing photos derive their
// profession from the service's category — see `casoProfession`). The optional caption fields
// (title/description/client/date) turn a photo into a "caso de éxito" card (owner's mockup);
// they live in the same `portfolio_items` JSON column, so no migration — and stay optional, so
// a bare photo still renders fine and the public profile is unaffected.
export type PortfolioItem = {
  url: string;
  serviceId?: string;
  profession?: string;
  title?: string;
  description?: string;
  client?: string;
  date?: string;
};

interface PhotoGalleryProps {
  professionalId: string;
  initialUrls?: string[];
  initialItems?: PortfolioItem[];
  /** The pro's professions (category ids) — the sections casos are grouped under. */
  professions?: string[];
  /** The pro's services — only used to DERIVE the profession of legacy serviceId-tagged photos. */
  services?: ServiceLike[];
  onSaved?: () => void;
}

// Casos de éxito are grouped PER PROFESSION (category). Stored as portfolio_items
// [{ url, profession, serviceId? }]; portfolio_urls (flat) kept for back-compat and the
// 5-photo DB CHECK.
export function PhotoGallery({ professionalId, initialUrls = [], initialItems, professions = [], services = [], onSaved }: PhotoGalleryProps) {
  const locale = useLocale();
  const t = useTranslations("photoGallery");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  // Seed items from the tagged column, falling back to untagged flat urls.
  const seed: PortfolioItem[] = Array.isArray(initialItems) && initialItems.length > 0
    ? initialItems
    : initialUrls.map((url) => ({ url, profession: undefined }));
  const [items, setItems] = useState<PortfolioItem[]>(seed);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // Drag-and-drop: which profession group is currently being dragged over (Airbnb-style dropzone).
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  // App-wide autosave feedback.
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingProfessionRef = useRef<string | undefined>(undefined);

  const primary = professions[0];
  const profSet = new Set(professions);
  // The PROFESSION (category) a photo belongs to — explicit, else derived from its legacy
  // serviceId's service category, else the primary profession.
  const profOf = (it: PortfolioItem) => casoProfession(it, services, primary);

  // One section per PROFESSION (category), plus an "Otros trabajos" bucket for photos whose
  // profession isn't one of the current professions (e.g. from a removed profession) so none
  // are ever lost.
  const groups: { id: string; label: string }[] = professions.map((cat) => ({
    id: cat,
    label: getCategoryLabel(cat, locale),
  }));
  const hasOther = items.some((it) => { const p = profOf(it); return !p || !profSet.has(p); });
  if (hasOther) groups.push({ id: "__other__", label: t("otherWorks") });

  function itemsFor(groupId: string): PortfolioItem[] {
    if (groupId === "__other__") return items.filter((it) => { const p = profOf(it); return !p || !profSet.has(p); });
    return items.filter((it) => profOf(it) === groupId);
  }

  async function persist(next: PortfolioItem[]) {
    // Persist the derived profession on every item (lossless lazy migration; serviceId kept).
    const normalized = next.map((it) => ({ ...it, profession: profOf(it) || undefined }));
    next = normalized;
    setItems(next);
    setSaving(true);
    const supabase = createClient();
    const urls = next.map((it) => it.url);
    let { error } = await supabase
      .from("professionals")
      .update({ portfolio_items: next, portfolio_urls: urls })
      .eq("id", professionalId);
    // Retry without the tagged column if it isn't migrated yet.
    if (error && /portfolio_items|column|schema cache|PGRST204|could not find/i.test(error.message)) {
      ({ error } = await supabase.from("professionals").update({ portfolio_urls: urls }).eq("id", professionalId));
    }
    setSaving(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
    onSaved?.();
  }

  async function handleUpload(files: FileList, profession: string | undefined) {
    const remaining = MAX_PORTFOLIO_PHOTOS - items.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) {
      alert(t("maxAlert", { max: MAX_PORTFOLIO_PHOTOS }));
      return;
    }
    // Casos de éxito are grouped by PROFESSION — the photo is tagged with the chosen profession.
    setUploadingFor(profession ?? "__none__");
    try {
      const uploaded: PortfolioItem[] = [];
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "portfolio");
        const res = await fetch("/api/upload/photo", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) uploaded.push({ url: data.url, profession });
        else alert(data.error ?? t("uploadError"));
      }
      if (uploaded.length > 0) await persist([...items, ...uploaded]);
    } catch {
      alert(t("uploadError"));
    } finally {
      setUploadingFor(null);
    }
  }

  async function removePhoto(url: string) {
    await persist(items.filter((it) => it.url !== url));
  }

  // Caption editor (turns a photo into a "caso de éxito" card): title + description +
  // client + date, all optional. Keyed by the photo url.
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState<{ title: string; description: string; client: string; date: string }>({ title: "", description: "", client: "", date: "" });
  function openCaption(it: PortfolioItem) {
    setEditingUrl(it.url);
    setCaption({ title: it.title ?? "", description: it.description ?? "", client: it.client ?? "", date: it.date ?? "" });
  }
  async function saveCaption() {
    if (!editingUrl) return;
    const next = items.map((it) =>
      it.url === editingUrl
        ? {
            ...it,
            title: caption.title.trim() || undefined,
            description: caption.description.trim() || undefined,
            client: caption.client.trim() || undefined,
            date: caption.date.trim() || undefined,
          }
        : it
    );
    setEditingUrl(null);
    await persist(next);
  }

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(saving || !!uploadingFor, justSaved);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#6b7280]">
        {t.rich("intro", { ...rich, max: MAX_PORTFOLIO_PHOTOS })}
      </p>

      {professions.length === 0 && (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
          {t.rich("noServices", rich)}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files, pendingProfessionRef.current);
          e.target.value = "";
        }}
      />

      {groups.map((g) => {
        const list = itemsFor(g.id);
        const canAdd = g.id !== "__other__" && items.length < MAX_PORTFOLIO_PHOTOS;
        const isUploadingHere = uploadingFor === g.id;
        const isDragHere = dragGroup === g.id;
        const openPicker = () => { pendingProfessionRef.current = g.id; inputRef.current?.click(); };
        // Drag-and-drop handlers for THIS profession group. The `contains(relatedTarget)`
        // check keeps the highlight steady as the cursor moves over child elements (no flicker).
        const dnd = canAdd ? {
          onDragOver: (e: React.DragEvent) => { if (uploadingFor) return; e.preventDefault(); setDragGroup(g.id); },
          onDragLeave: (e: React.DragEvent) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragGroup((cur) => (cur === g.id ? null : cur)); },
          onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragGroup(null); if (!uploadingFor && e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files, g.id); },
        } : {};
        return (
          <div key={g.id}>
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-[#111827]">
                {g.label}
                {list.length > 0 && <span className="ml-1.5 text-[11px] font-normal text-[#9ca3af]">({list.length})</span>}
              </h4>
            </div>

            {list.length === 0 && canAdd ? (
              /* EMPTY profession → a prominent drag-and-drop zone (Airbnb/Dropbox-style):
                 cloud-image icon, "Arrastra tus fotos aquí", a browse button + format hint.
                 The whole zone is clickable AND a drop target; it highlights while dragging. */
              <button
                type="button"
                {...dnd}
                onClick={openPicker}
                disabled={!!uploadingFor}
                className={cn(
                  "w-full rounded-2xl border-2 border-dashed px-4 py-9 flex flex-col items-center justify-center text-center gap-2.5 transition-colors",
                  isDragHere ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#d1d5db] hover:border-[#009FD9] hover:bg-[#f9fbfe]",
                  !!uploadingFor && "opacity-60 cursor-not-allowed"
                )}
              >
                <span className="pointer-events-none flex flex-col items-center gap-2.5">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[#EBF5FB] text-[#009FD9]">
                    {isUploadingHere ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageUp className="h-6 w-6" />}
                  </span>
                  <span className="block">
                    <span className="block text-sm font-semibold text-[#111827]">{isDragHere ? t("dropActive") : t("dropTitle")}</span>
                    <span className="mt-0.5 block text-xs text-[#9ca3af]">{t("dropOr")}</span>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[13px] font-semibold text-[#374151]">
                    {t("dropBrowse")}
                  </span>
                  <span className="block text-[11px] text-[#9ca3af]">{t("dropHint", { max: MAX_PORTFOLIO_PHOTOS })}</span>
                </span>
              </button>
            ) : (
              /* Photos present → a CASE-CARD grid (owner's mockup): each card = the photo + its
                 profession tag + optional title/description/client·date caption, with edit/delete.
                 The grid is itself a drop target (ring highlight) and ends with an "Agregar más" tile. */
              <div {...dnd} className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-2xl transition-shadow", isDragHere && "ring-2 ring-[#009FD9] ring-offset-2")}>
                {list.map((it) => {
                  const hasCaption = !!(it.title || it.description || it.client || it.date);
                  return (
                    <div key={it.url} className="group flex flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
                      <div className="relative aspect-[4/3]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cldThumb(it.url, 600)} alt={it.title ?? ""} className="h-full w-full object-cover" />
                        <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <button onClick={() => openCaption(it)} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75" aria-label={t("edit")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removePhoto(it.url)} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-red-600" aria-label={t("remove")}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        {g.id !== "__other__" && <p className="text-[11px] font-semibold text-[#0089bb]">{g.label}</p>}
                        {hasCaption ? (
                          <>
                            {it.title && <p className="mt-0.5 line-clamp-1 text-sm font-bold text-[#162543] [overflow-wrap:anywhere]">{it.title}</p>}
                            {it.description && <p className="mt-0.5 line-clamp-2 text-xs text-[#6b7280] [overflow-wrap:anywhere]">{it.description}</p>}
                            {(it.client || it.date) && (
                              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                                {it.client && <span className="min-w-0 truncate font-medium text-[#374151]">{it.client}</span>}
                                {it.client && it.date && <span aria-hidden>·</span>}
                                {it.date && <span className="shrink-0">{it.date}</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          <button onClick={() => openCaption(it)} className="mt-0.5 self-start text-xs font-semibold text-[#0089bb] hover:underline">{t("addDetails")}</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {canAdd && (
                  <button
                    type="button"
                    onClick={openPicker}
                    disabled={!!uploadingFor}
                    className={cn(
                      "flex min-h-[180px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed transition-colors cursor-pointer",
                      isDragHere ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#d1d5db] hover:border-[#009FD9] hover:bg-[#f9fbfe]",
                      !!uploadingFor && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isUploadingHere ? (
                      <Loader2 className="h-6 w-6 text-[#009FD9] animate-spin" />
                    ) : (
                      <>
                        <ImageUp className="h-6 w-6 text-[#9ca3af]" />
                        <span className="text-xs text-[#6b7280]">{t("addMore")}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Caption editor — adds the "caso de éxito" details (all optional). */}
      {editingUrl && (
        <Modal
          onClose={() => setEditingUrl(null)}
          title={t("detailsTitle")}
          closeLabel={t("cancel")}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setEditingUrl(null)}>{t("cancel")}</Button>
              <Button type="button" onClick={saveCaption} loading={saving}>{t("save")}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cldThumb(editingUrl, 600)} alt="" className="h-40 w-full rounded-xl border border-[#e5e7eb] object-cover" />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("titleField")}</label>
              <input
                value={caption.title}
                onChange={(e) => setCaption((c) => ({ ...c, title: e.target.value }))}
                placeholder={t("titlePlaceholder")}
                maxLength={80}
                className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("descField")}</label>
              <textarea
                value={caption.description}
                onChange={(e) => setCaption((c) => ({ ...c, description: e.target.value }))}
                placeholder={t("descPlaceholder")}
                maxLength={160}
                className="min-h-[80px] w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("clientField")}</label>
                <input
                  value={caption.client}
                  onChange={(e) => setCaption((c) => ({ ...c, client: e.target.value }))}
                  placeholder={t("clientPlaceholder")}
                  maxLength={60}
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("dateField")}</label>
                <input
                  value={caption.date}
                  onChange={(e) => setCaption((c) => ({ ...c, date: e.target.value }))}
                  placeholder={t("datePlaceholder")}
                  maxLength={20}
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
