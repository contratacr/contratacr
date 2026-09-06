"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CategorySearch } from "@/components/ui/category-search";
import { SelectMenu } from "@/components/ui/select-menu";
import { AlertCircle, ArrowLeft, CheckCircle2, X } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";
import { useLocale } from "next-intl";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

const PROJECT_DESCRIPTION_MAX_LENGTH = 300;
const LAST_ZONE_KEY = "ccr:last-request-zone";

type ProjectErrorField = "category" | "description";

// Publicar una solicitud: el cliente elige el servicio, cuenta qué hay que hacer y
// publica. La zona se recuerda de la última vez. Sin título (lo arma el servidor),
// sin presupuesto, sin plazo, sin cédula ni teléfono: el cliente es quien escribe
// después por WhatsApp al profesional que le responda.
export function PublishProjectModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const t = useTranslations("publicarProyecto");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const initialCategoryId = searchParams.get("categoria") || "";

  const [form, setForm] = useState({
    categoryId: initialCategoryId,
    description: "",
    provinciaId: searchParams.get("provincia") || "",
    cantonId: searchParams.get("canton") || "",
  });
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ProjectErrorField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<{ notifiedCount: number; service: string } | null>(null);
  const categoryFieldRef = useRef<HTMLDivElement>(null);
  const descriptionFieldRef = useRef<HTMLDivElement>(null);

  // La zona se recuerda entre solicitudes: casi siempre es la misma casa.
  useEffect(() => {
    if (form.provinciaId) return;
    try {
      const raw = window.localStorage.getItem(LAST_ZONE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { provinciaId?: string; cantonId?: string };
      if (saved?.provinciaId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm((f) => ({ ...f, provinciaId: saved.provinciaId ?? "", cantonId: saved.cantonId ?? "" }));
      }
    } catch { /* sin zona guardada */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reportError(message: string, field: ProjectErrorField, ref: RefObject<HTMLDivElement | null>) {
    setError(message);
    setErrorField(field);
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      ref.current?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)")?.focus({ preventScroll: true });
    });
  }

  const selectedProvincia = PROVINCES.find((p) => p.id === form.provinciaId);
  const cantons = selectedProvincia?.cantons ?? [];

  function update(field: keyof typeof form, value: string) {
    const nextValue = field === "description" ? value.slice(0, PROJECT_DESCRIPTION_MAX_LENGTH) : value;
    setForm((f) => ({ ...f, [field]: nextValue, ...(field === "provinciaId" ? { cantonId: "" } : {}) }));
    if (errorField === field) {
      setError(null);
      setErrorField(null);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const releaseBodyScroll = lockBodyScroll();
    return () => { document.removeEventListener("keydown", onKey); releaseBodyScroll(); };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (published) { onClose(); return; }
    setError(null);
    setErrorField(null);
    if (!form.categoryId) { reportError(t("errCategory"), "category", categoryFieldRef); return; }
    if (!form.description.trim()) { reportError(t("errDescription"), "description", descriptionFieldRef); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH),
          categoryId: form.categoryId,
          provinciaId: form.provinciaId || null,
          cantonId: form.cantonId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("errPublish"));
        return;
      }
      try {
        window.localStorage.setItem(LAST_ZONE_KEY, JSON.stringify({ provinciaId: form.provinciaId, cantonId: form.cantonId }));
      } catch { /* sin almacenamiento */ }
      onSuccess?.();
      setPublished({
        notifiedCount: typeof data.notifiedCount === "number" ? data.notifiedCount : 0,
        service: getCategoryLabel(form.categoryId, locale),
      });
    } catch {
      setError(t("errUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldLabel = "mb-1.5 block text-[15px] font-semibold text-[#162543]";

  return (
    <div className="app-modal-screen fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 hidden bg-black/50 backdrop-blur-sm sm:block" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-project-title"
        className="app-fullscreen-modal relative z-10 flex h-[var(--app-visual-viewport-height)] min-h-0 w-full max-h-[var(--app-visual-viewport-height)] flex-col overflow-hidden bg-white shadow-none sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:shadow-2xl"
      >
        <div className="relative flex shrink-0 items-center justify-center gap-3 border-b border-[#f3f4f6] px-14 py-4 sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0 text-center sm:text-left">
            <h2 id="publish-project-title" className="text-lg font-bold text-[#111827]">{t("title")}</h2>
            <p className="mt-0.5 hidden text-xs text-[#6b7280] sm:block">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 shrink-0 items-center justify-center rounded-lg text-[#162543] transition-colors hover:bg-[#f3f4f6] sm:static sm:h-8 sm:w-8 sm:translate-y-0"
          >
            <ArrowLeft className="h-5 w-5 sm:hidden" />
            <X className="hidden h-5 w-5 sm:block" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col sm:flex-none">
          {published ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center sm:py-12">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[#e8f8fe] text-[#009FD9]">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h3 className="text-xl font-bold text-[#111827]">{t("successTitle")}</h3>
              <p className="max-w-[22rem] text-[15px] font-medium leading-relaxed text-[#162543]">
                {t("successNotified", { count: published.notifiedCount, service: published.service })}
              </p>
              <p className="max-w-[22rem] text-sm leading-relaxed text-[#6b7280]">{t("successNext")}</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-[#f4f7fa] px-4 py-5 sm:max-h-[calc(90vh-145px)] sm:flex-none">
              <div className="flex flex-col gap-6 rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
                <div ref={categoryFieldRef}>
                  <label className={fieldLabel}>{t("category")}</label>
                  <CategorySearch
                    value={form.categoryId}
                    onChange={(id) => update("categoryId", id)}
                    placeholder={t("categoryPlaceholder")}
                    error={errorField === "category" ? error ?? undefined : undefined}
                  />
                </div>

                <div ref={descriptionFieldRef}>
                  <label className={fieldLabel}>{t("description")}</label>
                  <textarea
                    className="min-h-[132px] w-full resize-none break-words rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-[#111827] placeholder:text-[#9ca3af] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9] aria-[invalid=true]:border-red-400"
                    placeholder={t("descriptionPlaceholder")}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                    required
                    aria-invalid={errorField === "description"}
                  />
                  {form.description.length >= PROJECT_DESCRIPTION_MAX_LENGTH && (
                    <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: PROJECT_DESCRIPTION_MAX_LENGTH })}</p>
                  )}
                </div>

                <div>
                  <label className={fieldLabel}>
                    {t("zone")} <span className="font-normal text-[#9ca3af]">{t("optional")}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectMenu
                      value={form.provinciaId}
                      onChange={(v) => update("provinciaId", v)}
                      options={[{ value: "", label: t("allF") }, ...PROVINCES.map((p) => ({ value: p.id, label: p.name }))]}
                    />
                    <SelectMenu
                      value={form.cantonId}
                      onChange={(v) => update("cantonId", v)}
                      disabled={!form.provinciaId}
                      options={[{ value: "", label: t("allM") }, ...cantons.map((c) => ({ value: c.id, label: c.name }))]}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[#9ca3af]">{t("zoneHelp")}</p>
                </div>
              </div>
            </div>
          )}

          {error && !published && errorField !== "category" && (
            <div className="shrink-0 border-t border-[#f3f4f6] bg-white px-5 pt-3 sm:px-6">
              <div role="alert" aria-live="assertive" data-testid="project-form-error" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold leading-5 text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className={`flex shrink-0 gap-3 px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pb-4 ${error && !published ? "" : "border-t border-[#f3f4f6]"}`}>
            {!published && (
              <Button type="button" variant="outline" size="lg" onClick={onClose} className="hidden sm:inline-flex">
                {t("cancel")}
              </Button>
            )}
            <Button type={published ? "button" : "submit"} size="lg" className="flex-1" loading={submitting} disabled={submitting} onClick={published ? onClose : undefined}>
              {published ? t("close") : submitting ? t("publishing") : t("publish")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
