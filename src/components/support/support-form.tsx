"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Paperclip, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { SelectMenu } from "@/components/ui/select-menu";
import { LONG_TEXT_MAX_LENGTH, NAME_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { IMAGE_DOC_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";

// The support ticket form — SINGLE SOURCE OF TRUTH for the fields, validation and
// submit. Rendered on the public /soporte page (the in-dashboard Soporte section uses
// SupportTickets instead).
// On a successful submit it calls onSuccess(email); the container decides what to
// show next (the page shows its full success screen; the modal shows a compact one).

const MAX_FILES = 3;
const MAX_FILE_MB = 4;
const MAX_REQUEST_FILE_BYTES = 3.7 * 1024 * 1024;
const SUBJECT_IDS = [0, 1, 2, 3, 4, 5] as const;

type AttachedFile = { file: File; preview?: string };

export function SupportForm({ onSuccess }: { onSuccess?: (email: string) => void }) {
  const t = useTranslations("soporte");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<AttachedFile[]>([]);
  const prefillAppliedRef = useRef(false);

  const [form, setForm] = useState({ name: "", email: "", topic: "", subject: "", message: "" });
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach(({ preview }) => {
      if (preview) URL.revokeObjectURL(preview);
    });
  }, []);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const topic = searchParams.get("topic") ?? "";
    const subject = searchParams.get("subject") ?? "";
    const message = searchParams.get("message") ?? "";
    if (!topic && !subject && !message) return;
    prefillAppliedRef.current = true;
    setForm((f) => {
      const nextTopic = SUBJECT_IDS.map((i) => `subject${i}`).includes(topic) ? topic : f.topic;
      return {
        ...f,
        topic: nextTopic,
        subject: limitText(subject || (nextTopic ? t(nextTopic) : f.subject), SHORT_TEXT_MAX_LENGTH),
        message: limitText(message || f.message, LONG_TEXT_MAX_LENGTH),
      };
    });
  }, [searchParams, t]);

  useEffect(() => {
    if (user && !authLoading) {
      queueMicrotask(() => {
        setForm((f) => ({
          ...f,
          name: limitText((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || f.name, NAME_MAX_LENGTH),
          email: user.email ?? f.email,
        }));
      });
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || authLoading) return;
    let alive = true;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        setForm((f) => ({
          ...f,
          name: limitText(data.full_name || f.name, NAME_MAX_LENGTH),
          email: data.email || f.email,
        }));
      });
    return () => { alive = false; };
  }, [user, authLoading]);

  function update(field: keyof typeof form, value: string) {
    const limit =
      field === "name" ? NAME_MAX_LENGTH :
      field === "email" || field === "subject" || field === "topic" ? SHORT_TEXT_MAX_LENGTH :
      field === "message" ? LONG_TEXT_MAX_LENGTH :
      undefined;
    setForm((f) => ({ ...f, [field]: limit ? limitText(value, limit) : value }));
  }

  function updateTopic(topic: string) {
    update("topic", topic);
    update("subject", topic ? t(topic) : "");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const remaining = MAX_FILES - attachments.length;
    const candidates = selected.slice(0, Math.max(0, remaining));
    if (!candidates.length) return;
    setPreparingAttachments(true);
    setError(null);
    const prepared: AttachedFile[] = [];
    try {
      let availableBytes = MAX_REQUEST_FILE_BYTES - attachments.reduce((sum, item) => sum + item.file.size, 0);
      for (let index = 0; index < candidates.length; index += 1) {
        const file = candidates[index];
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        const remainingCandidates = candidates.length - index;
        const targetBytes = Math.min(MAX_FILE_MB * 1024 * 1024, Math.floor(availableBytes / remainingCandidates));
        if (targetBytes <= 0) throw new Error("total-size");
        const ready = isPdf ? file : await prepareImageForUpload(file, { maxDimension: 1600, targetBytes });
        if (ready.size > targetBytes || ready.size > availableBytes) throw new Error("total-size");
        prepared.push({ file: ready, preview: !isPdf ? URL.createObjectURL(ready) : undefined });
        availableBytes -= ready.size;
      }
      setAttachments((prev) => [...prev, ...prepared]);
    } catch (attachmentError) {
      prepared.forEach(({ preview }) => {
        if (preview) URL.revokeObjectURL(preview);
      });
      const code = getImageUploadPreparationErrorCode(attachmentError);
      setError(code === "unsupported"
        ? t("errFormat")
        : code === "too_large"
          ? t("errOversized", { mb: MAX_FILE_MB })
          : locale === "en"
            ? "The combined attachments are too large. Use fewer or lighter files."
            : "Los archivos juntos son muy pesados. Usa menos archivos o archivos más livianos.");
    } finally {
      setPreparingAttachments(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email || !form.subject || !form.message) {
      setError(t("errRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("email", form.email);
      fd.append("subject", form.subject);
      fd.append("topic", form.topic);
      fd.append("message", form.message);
      fd.append("locale", locale);
      for (const { file } of attachments) {
        fd.append("attachments", file);
      }

      const res = await fetch("/api/contact", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setError(data.error ?? t("errSend"));
        return;
      }
      onSuccess?.(form.email);
    } catch {
      setError(t("errUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("nameLabel")} <span className="text-red-500">*</span>
          </label>
          <input type="text" className={inputClass} placeholder={t("namePlaceholder")}
            maxLength={NAME_MAX_LENGTH}
            value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("emailLabel")} <span className="text-red-500">*</span>
          </label>
          <input type="email" className={inputClass} placeholder={t("emailPlaceholder")}
            maxLength={SHORT_TEXT_MAX_LENGTH}
            value={form.email} onChange={(e) => update("email", e.target.value)} required />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          {t("subjectLabel")} <span className="text-red-500">*</span>
        </label>
        <SelectMenu
          value={form.topic}
          onChange={updateTopic}
          placeholder={t("subjectPlaceholder")}
          options={SUBJECT_IDS.map((i) => {
            const key = `subject${i}`;
            return { value: key, label: t(key) };
          })}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">
          {t("messageLabel")} <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[130px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          placeholder={t("messagePlaceholder")}
          maxLength={LONG_TEXT_MAX_LENGTH}
          value={form.message} onChange={(e) => update("message", e.target.value)} required
        />
      </div>

      {/* Attachments */}
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-2">
          {t("attachmentsLabel")} <span className="text-[#9ca3af] font-normal">{t("attachmentsHint", { max: MAX_FILES, mb: MAX_FILE_MB })}</span>
        </label>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map(({ file, preview }, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#EBF5FB] rounded-xl px-3 py-1.5 text-xs text-[#374151]">
                {preview ? (
                  <img src={preview} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-[#009FD9] shrink-0" />
                )}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <span className="text-[#9ca3af]">({(file.size / 1024).toFixed(0)}KB)</span>
                <button type="button" onClick={() => removeAttachment(i)}
                  className="text-[#9ca3af] hover:text-red-500 transition-colors ml-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachments.length < MAX_FILES && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={preparingAttachments || submitting}
            className="flex items-center gap-2 text-sm text-[#009FD9] border border-dashed border-[#009FD9]/40 rounded-xl px-4 py-2.5 hover:bg-[#EBF5FB] transition-colors w-full justify-center"
          >
            <Paperclip className="h-4 w-4" />
            {preparingAttachments ? (locale === "en" ? "Preparing files…" : "Preparando archivos…") : attachments.length === 0 ? t("attachBtn") : t("addAnother")}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={IMAGE_DOC_ACCEPT}
          disabled={preparingAttachments || submitting}
          multiple
          onChange={(event) => { void handleFileChange(event); }}
        />
        <p className="text-xs text-[#9ca3af] mt-1.5">
          {t("formats")}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting}
        className="h-12 w-full rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
        {submitting && <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
        {submitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
