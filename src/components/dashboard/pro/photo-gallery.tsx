"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageUp, X, Loader2, Plus, Pencil, Trash2, Images, CalendarDays, Heart } from "lucide-react";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { cldThumb } from "@/lib/cloudinary";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { getCategoryLabel } from "@/lib/data/categories";
import { CASE_PHOTOS_PER_CASE, casoProfession, type ServiceLike } from "@/lib/services";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { deleteOwnedMediaUrls } from "@/lib/client-media-cleanup";

// NEW per-profession model (sprint 493): a "caso de éxito" is a CASE (service done · for whom ·
// when · up to 3 photos), and there can be up to 3 cases PER PROFESSION (the old overall limit of
// 5 is gone). Stored in `portfolio_items` (JSON). `portfolio_urls` is kept (flattened, capped at 5)
// only to satisfy the legacy DB CHECK + search thumbnails.
export type SuccessCase = {
  id: string;
  profession: string;   // category id
  title?: string;       // the service done
  description?: string; // a short pitch shown to clients on the public case card
  recipient?: string;   // for whom (name / short description)
  date?: string;        // when (free text, e.g. "Mayo 2024")
  photos: string[];     // up to MAX_PHOTOS_PER_CASE
  likes?: number;       // public likes (read-only here)
};
// Legacy item shape (photos-only) — read for back-compat so nothing is lost.
type LegacyItem = { url?: string; serviceId?: string; profession?: string };

export const MAX_CASES_PER_PROFESSION = 10;
export const MAX_PHOTOS_PER_CASE = CASE_PHOTOS_PER_CASE;

interface PhotoGalleryProps {
  professionalId: string;
  initialUrls?: string[];
  initialItems?: (SuccessCase | LegacyItem)[];
  /** The pro's professions (category ids) — cases are organized per profession. */
  professions?: string[];
  /** The pro's services — only used to DERIVE the profession of legacy serviceId-tagged photos. */
  services?: ServiceLike[];
  onSaved?: (intent?: "section" | "internal") => void;
}

function genId() {
  return `case_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Read BOTH shapes: new cases (have `photos[]`) pass through; legacy photos (`{url}`) are grouped
// by profession into untitled cases (≤3 photos each) so existing work is never lost.
export function seedCases(items: (SuccessCase | LegacyItem)[] | undefined, urls: string[], services: ServiceLike[], primary?: string): SuccessCase[] {
  const list = Array.isArray(items) && items.length > 0 ? items : urls.map((url) => ({ url }));
  const cases: SuccessCase[] = [];
  const legacyByProf = new Map<string, string[]>();
  for (const it of list) {
    if (it && Array.isArray((it as SuccessCase).photos)) {
      const c = it as SuccessCase;
      cases.push({ ...c, photos: c.photos.slice(0, MAX_PHOTOS_PER_CASE) });
    } else {
      const li = it as LegacyItem;
      if (!li.url) continue;
      const prof = casoProfession(li, services, primary) || primary || "";
      const arr = legacyByProf.get(prof) ?? [];
      arr.push(li.url);
      legacyByProf.set(prof, arr);
    }
  }
  for (const [prof, photos] of legacyByProf) {
    for (let i = 0; i < photos.length; i += MAX_PHOTOS_PER_CASE) {
      cases.push({ id: genId(), profession: prof, photos: photos.slice(i, i + MAX_PHOTOS_PER_CASE) });
    }
  }
  return cases;
}

export function PhotoGallery({ professionalId, initialUrls = [], initialItems, professions = [], services = [], onSaved }: PhotoGalleryProps) {
  const locale = useLocale();
  const t = useTranslations("photoGallery");
  const { dialogNode, showMessage, confirm } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const primary = professions[0];

  const [cases, setCases] = useState<SuccessCase[]>(() => seedCases(initialItems, initialUrls, services, primary));
  const initialCasesRef = useRef<SuccessCase[]>(cases);
  // Filter is always a real profession (no "Todas") — defaults to the first.
  const [activeProf, setActiveProf] = useState<string>(professions[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  useReportSaveStatus(saving, justSaved, dirty);

  // The add/edit case modal — `draft != null` means open.
  const [draft, setDraft] = useState<SuccessCase | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the active filter valid if the pro's professions change (e.g. after editing
  // services) — fall back to the first so cases never silently disappear.
  const label = (id: string) => getCategoryLabel(id, locale);
  const countFor = (prof: string) => cases.filter((c) => c.profession === prof).length;
  const selectedProf = professions.includes(activeProf) ? activeProf : professions[0] ?? "";
  const targetProf = selectedProf;
  const inputClass = "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  async function persist(next: SuccessCase[], options: { intent?: "section" | "internal" } = {}) {
    setCases(next);
    setSaving(true);
    try {
      const supabase = createClient();
      // portfolio_urls (capped at 5) keeps the legacy DB CHECK + search thumbnails happy.
      const urls = next.flatMap((c) => c.photos).slice(0, 5);
      let { error } = await supabase.from("professionals").update({ portfolio_items: next, portfolio_urls: urls }).eq("id", professionalId);
      if (error && /portfolio_items|column|schema cache|PGRST204|could not find/i.test(error.message)) {
        ({ error } = await supabase.from("professionals").update({ portfolio_urls: urls }).eq("id", professionalId));
      }
      if (error) throw error;
      const previousUrls = new Set(initialCasesRef.current.flatMap((item) => item.photos));
      const nextUrls = new Set(next.flatMap((item) => item.photos));
      await deleteOwnedMediaUrls([...previousUrls].filter((url) => !nextUrls.has(url)));
      setJustSaved(true);
      setDirty(false);
      initialCasesRef.current = next;
      setTimeout(() => setJustSaved(false), 2500);
      onSaved?.(options.intent ?? "section");
      return true;
    } catch {
      void showMessage({
        title: errorTitle,
        description: locale === "en" ? "We couldn't save your success stories. Try again." : "No pudimos guardar tus casos de éxito. Intenta de nuevo.",
        tone: "danger",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    const prof = targetProf || primary || "";
    setDraft({ id: genId(), profession: prof, photos: [] });
  }
  function openEdit(c: SuccessCase) { setDraft({ ...c, photos: [...c.photos] }); }

  async function uploadPhotos(files: FileList) {
    if (!draft) return;
    const remaining = MAX_PHOTOS_PER_CASE - draft.photos.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) {
      void showMessage({ title: errorTitle, description: t("maxPhotosAlert", { max: MAX_PHOTOS_PER_CASE }), tone: "danger" });
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of toUpload) {
        try {
          const preparedFile = await prepareImageForUpload(file, { maxDimension: 1600 });
          const fd = new FormData(); fd.append("file", preparedFile); fd.append("type", "portfolio");
          const upload = await uploadPhotoFormDataWithRetry(fd);
          if (upload.ok && upload.data.url) urls.push(upload.data.url);
          else void showMessage({ title: errorTitle, description: upload.data.error ?? t("uploadError"), tone: "danger" });
        } catch (error) {
          const code = getImageUploadPreparationErrorCode(error);
          void showMessage({ title: errorTitle, description: code === "too_large" ? t("uploadTooLarge") : code === "unsupported" ? t("uploadUnsupported") : t("uploadError"), tone: "danger" });
        }
      }
      if (urls.length) setDraft((d) => (d ? { ...d, photos: [...d.photos, ...urls].slice(0, MAX_PHOTOS_PER_CASE) } : d));
    } catch {
      void showMessage({ title: errorTitle, description: t("uploadError"), tone: "danger" });
    } finally { setUploading(false); }
  }

  function saveCase() {
    if (!draft || draft.photos.length === 0) return;
    const exists = cases.some((c) => c.id === draft.id);
    const next = exists ? cases.map((c) => (c.id === draft.id ? draft : c)) : [...cases, draft];
    setDraft(null);
    void persist(next, { intent: "internal" });
  }
  // Se elimina de inmediato, así que se pregunta antes: ya no hay un "Guardar"
  // que permita deshacerlo saliendo de la sección.
  async function deleteCase(id: string) {
    const result = await confirm({
      title: locale === "en" ? "Delete success story" : "Eliminar caso de éxito",
      description: locale === "en"
        ? "This success story and its photos will be removed from your profile."
        : "Este caso de éxito y sus fotos se quitarán de tu perfil.",
      confirmLabel: locale === "en" ? "Delete" : "Eliminar",
      cancelLabel: locale === "en" ? "Cancel" : "Cancelar",
      tone: "danger",
    });
    if (!result.confirmed) return;
    setJustSaved(false);
    await persist(cases.filter((c) => c.id !== id), { intent: "internal" });
  }

  function cancelChanges() {
    const savedUrls = new Set(initialCasesRef.current.flatMap((item) => item.photos));
    void deleteOwnedMediaUrls(cases.flatMap((item) => item.photos).filter((url) => !savedUrls.has(url)));
    setCases(initialCasesRef.current);
    setDraft(null);
    setDirty(false);
    setJustSaved(false);
  }

  const shownCases = cases.filter((c) => c.profession === selectedProf);
  const addProf = targetProf || primary || "";
  const addFull = !!addProf && countFor(addProf) >= MAX_CASES_PER_PROFESSION;
  const draftIsEdit = !!draft && cases.some((c) => c.id === draft.id);

  function closeDraft() {
    if (draft) {
      const retainedUrls = new Set(cases.flatMap((item) => item.photos));
      void deleteOwnedMediaUrls(draft.photos.filter((url) => !retainedUrls.has(url)));
    }
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {professions.length === 0 && (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">{t.rich("noServices", rich)}</div>
      )}

      {/* Filter by profession — underline tabs + count badges (shared StatusFilterTabs);
          only when the pro has 2+ professions. */}
      {professions.length > 1 && (
        <StatusFilterTabs
          tabs={professions.map((p) => ({ id: p }))}
          value={selectedProf}
          onChange={setActiveProf}
          labelFor={label}
          counts={Object.fromEntries(professions.map((p) => [p, countFor(p)]))}
          variant="chips"
        />
      )}

      {/* One-per-row case cards: outcome summary + small proof photo stack. */}
      {shownCases.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {shownCases.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
              <div className="p-4">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                  <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0089bb]">{label(c.profession)}</p>
                  {c.title && <p className="mt-1 text-[16px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{c.title}</p>}
                  {c.description && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{c.description}</p>}
                  {c.recipient && (
                    <p className="mt-2 text-xs font-medium text-[#374151] [overflow-wrap:anywhere]">{c.recipient}</p>
                  )}
                  </div>

                  {c.photos.length > 0 && (
                    <div className="flex shrink-0 -space-x-3 pt-1 sm:self-auto">
                      {c.photos.slice(0, MAX_PHOTOS_PER_CASE).map((url) => (
                      <div
                        key={`${c.id}-${url}`}
                        className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-white bg-[#f3f4f6] shadow-sm sm:h-16 sm:w-16"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cldThumb(url, 220)} alt={c.title ?? ""} className="h-full w-full object-cover" />
                      </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#9ca3af]">
                    {c.photos.length > 0 && <span className="inline-flex items-center gap-1"><Images className="h-3 w-3 text-[#374151]" /> {t("photosCount", { count: c.photos.length })}</span>}
                    {c.date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 text-[#374151]" /> {c.date}</span>}
                    {typeof c.likes === "number" && c.likes > 0 && <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3 text-[#374151]" /> {c.likes}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <AppTooltip label={t("edit")}>
                      <button onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors" aria-label={t("edit")}><Pencil className="h-3.5 w-3.5" /></button>
                    </AppTooltip>
                    <AppTooltip label={t("remove")}>
                      <button onClick={() => void deleteCase(c.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-red-50 hover:text-red-500 transition-colors" aria-label={t("remove")}><Trash2 className="h-3.5 w-3.5" /></button>
                    </AppTooltip>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agregar nuevo caso de éxito (dashed, full width). */}
      <div className={cn(shownCases.length === 0 && "ccr-empty-state flex min-h-[18rem] items-center sm:min-h-[20rem]")}>
        <button
          type="button"
          onClick={openAdd}
          disabled={addFull || professions.length === 0}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors",
            shownCases.length === 0 && "min-h-40",
            addFull || professions.length === 0 ? "cursor-not-allowed border-[#e5e7eb] opacity-60" : "border-[#bfdbfe] hover:border-[#009FD9] hover:bg-[#EBF5FB]",
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#EBF5FB] text-[#009FD9]">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-base font-bold text-[#0089bb]">{t("addCase")}</span>
          <span className="max-w-sm text-sm leading-relaxed text-[#9ca3af]">{addFull ? t("maxCasesHint", { max: MAX_CASES_PER_PROFESSION }) : t("addCaseHint")}</span>
        </button>
      </div>

      {/* ── Add / edit case ─────────────────────────────────────────────── */}
      <div className="hidden">
        <button
          type="button"
          onClick={cancelChanges}
          disabled={!dirty || saving || uploading}
          className="hidden h-10 rounded-xl px-4 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-45 sm:inline-flex sm:items-center sm:justify-center"
        >
          {locale === "en" ? "Cancel" : "Cancelar"}
        </button>
        <button
          type="button"
          onClick={() => void persist(cases)}
          disabled={!dirty || saving || uploading}
          className="h-10 w-full rounded-xl bg-[#009FD9] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0089bb] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-white sm:w-auto"
        >
          {saving ? (locale === "en" ? "Saving..." : "Guardando...") : locale === "en" ? "Save changes" : "Guardar cambios"}
        </button>
      </div>
      {draft && (
        <Modal
          onClose={closeDraft}
          title={draftIsEdit ? t("editCase") : t("newCase")}
          closeLabel={t("cancel")}
          mobilePresentation="fullscreen"
          footer={
            <>
              <Button type="button" variant="outline" onClick={closeDraft}>{t("cancel")}</Button>
              <Button type="button" onClick={saveCase} loading={saving} disabled={draft.photos.length === 0}>{t("save")}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {professions.length > 1 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("caseProfession")}</label>
                <Select value={draft.profession} onValueChange={(value) => setDraft((d) => (d ? { ...d, profession: value } : d))}>
                  <SelectTrigger className="border-[#e5e7eb] px-3.5 text-[#111827] focus-visible:ring-2 focus-visible:ring-[#009FD9]/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {professions.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("casePhotos", { max: MAX_PHOTOS_PER_CASE })}</label>
              <div className="grid grid-cols-3 gap-2">
                {draft.photos.map((url) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-[#e5e7eb]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cldThumb(url, 400)} alt="" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => setDraft((d) => (d ? { ...d, photos: d.photos.filter((u) => u !== url) } : d))} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-red-600" aria-label={t("remove")}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {draft.photos.length < MAX_PHOTOS_PER_CASE && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#d1d5db] text-[#9ca3af] transition-colors hover:border-[#009FD9] hover:bg-[#f9fbfe]">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /> : <><ImageUp className="h-5 w-5" /><span className="text-[11px]">{t("addPhoto")}</span></>}
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadPhotos(e.target.files); e.target.value = ""; }} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("caseTitle")}</label>
              <input value={draft.title ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))} placeholder={t("caseTitlePlaceholder")} maxLength={80} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("caseDescription")}</label>
              <textarea value={draft.description ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))} placeholder={t("caseDescriptionPlaceholder")} maxLength={200} rows={3} className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("caseRecipient")}</label>
              <input value={draft.recipient ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, recipient: e.target.value } : d))} placeholder={t("caseRecipientPlaceholder")} maxLength={120} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">{t("caseDate")}</label>
              <input value={draft.date ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, date: e.target.value } : d))} placeholder={t("caseDatePlaceholder")} maxLength={20} className={inputClass} />
            </div>
          </div>
        </Modal>
      )}
      <UnsavedChangesGuard dirty={dirty} onSave={() => persist(cases)} onDiscard={cancelChanges} />
      {dialogNode}
    </div>
  );
}
