"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Upload, X, Loader2 } from "lucide-react";
import { SaveStatus } from "@/components/dashboard/save-status";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MAX_PORTFOLIO_PHOTOS, cldThumb } from "@/lib/cloudinary";
import { getCategoryLabel } from "@/lib/data/categories";
import { serviceLabelMap, type ServiceLike } from "@/lib/services";

// Photos are tied to a SERVICE INSTANCE by `serviceId` (not by name/profession),
// so several services with the same name (e.g. three "Otro servicio") keep their
// own photos. `profession` is retained for back-compat with older items.
export type PortfolioItem = { url: string; serviceId?: string; profession?: string };

interface PhotoGalleryProps {
  professionalId: string;
  initialUrls?: string[];
  initialItems?: PortfolioItem[];
  /** The pro's categories — used only for the legacy profession-tagged fallback. */
  professions?: string[];
  /** The pro's services — casos de éxito attach to a specific service instance. */
  services?: ServiceLike[];
  onSaved?: () => void;
}

// Casos de éxito (work photos) are attached PER SERVICE INSTANCE. Stored as
// portfolio_items [{ url, serviceId, profession? }]; portfolio_urls (flat) kept
// for back-compat and the 5-photo DB CHECK.
export function PhotoGallery({ professionalId, initialUrls = [], initialItems, services = [], onSaved }: PhotoGalleryProps) {
  const locale = useLocale();
  const t = useTranslations("photoGallery");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  // Seed items from the tagged column, falling back to untagged flat urls.
  const seed: PortfolioItem[] = Array.isArray(initialItems) && initialItems.length > 0
    ? initialItems
    : initialUrls.map((url) => ({ url, profession: undefined }));
  const [items, setItems] = useState<PortfolioItem[]>(seed);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // App-wide autosave feedback.
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingServiceRef = useRef<string | undefined>(undefined);

  // Unique, disambiguated label per service (handles duplicate names).
  const labels = serviceLabelMap(services);
  const serviceIds = new Set(services.map((s) => s.id));

  // One section per SERVICE (labeled with its profession for context), plus an
  // "Otros trabajos" bucket for photos not tied to a current service (legacy /
  // profession-tagged / from a deleted service) so none are ever lost.
  const groups: { id: string; label: string; sub?: string }[] = services.map((s) => ({
    id: s.id,
    label: labels.get(s.id) ?? s.name,
    sub: s.category ? getCategoryLabel(s.category, locale) : undefined,
  }));
  const hasOther = items.some((it) => !it.serviceId || !serviceIds.has(it.serviceId));
  if (hasOther) groups.push({ id: "__other__", label: t("otherWorks") });

  function itemsFor(groupId: string): PortfolioItem[] {
    if (groupId === "__other__") return items.filter((it) => !it.serviceId || !serviceIds.has(it.serviceId));
    return items.filter((it) => it.serviceId === groupId);
  }

  async function persist(next: PortfolioItem[]) {
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

  async function handleUpload(files: FileList, serviceId: string | undefined) {
    const remaining = MAX_PORTFOLIO_PHOTOS - items.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) {
      alert(t("maxAlert", { max: MAX_PORTFOLIO_PHOTOS }));
      return;
    }
    // Carry the service's profession too (context for the public profile grouping).
    const profession = services.find((s) => s.id === serviceId)?.category;
    setUploadingFor(serviceId ?? "__none__");
    try {
      const uploaded: PortfolioItem[] = [];
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "portfolio");
        const res = await fetch("/api/upload/photo", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) uploaded.push({ url: data.url, serviceId, profession });
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

  return (
    <div className="flex flex-col gap-6">
      {/* App-wide autosave: uploads/changes persist immediately; consistent status. */}
      <SaveStatus saving={saving || !!uploadingFor} saved={justSaved} />
      <p className="text-sm text-[#6b7280]">
        {t.rich("intro", { ...rich, max: MAX_PORTFOLIO_PHOTOS })}
      </p>

      {services.length === 0 && (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
          {t.rich("noServices", rich)}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files, pendingServiceRef.current);
          e.target.value = "";
        }}
      />

      {groups.map((g) => {
        const list = itemsFor(g.id);
        const canAdd = g.id !== "__other__" && items.length < MAX_PORTFOLIO_PHOTOS;
        const isUploadingHere = uploadingFor === g.id;
        return (
          <div key={g.id}>
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-[#111827]">
                {g.label}
                {list.length > 0 && <span className="ml-1.5 text-[11px] font-normal text-[#9ca3af]">({list.length})</span>}
              </h4>
              {g.sub && <p className="text-[11px] text-[#9ca3af]">{g.sub}</p>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {list.map((it) => (
                <div key={it.url} className="relative group aspect-square rounded-2xl overflow-hidden border border-[#e5e7eb]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cldThumb(it.url, 400)} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(it.url)}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    aria-label={t("remove")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {canAdd && (
                <button
                  onClick={() => { pendingServiceRef.current = g.id; inputRef.current?.click(); }}
                  disabled={!!uploadingFor}
                  className={cn(
                    "aspect-square rounded-2xl border-2 border-dashed border-[#d1d5db] flex flex-col items-center justify-center gap-2",
                    "hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-all cursor-pointer",
                    !!uploadingFor && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isUploadingHere ? (
                    <Loader2 className="h-6 w-6 text-[#009FD9] animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-[#9ca3af]" />
                      <span className="text-xs text-[#6b7280]">{t("addPhoto")}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
