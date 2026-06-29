"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Paperclip, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SelectMenu } from "@/components/ui/select-menu";

// The support ticket form — SINGLE SOURCE OF TRUTH for the fields, validation and
// submit. Rendered on the public /soporte page (the in-dashboard Soporte section uses
// SupportTickets instead).
// On a successful submit it calls onSuccess(email); the container decides what to
// show next (the page shows its full success screen; the modal shows a compact one).

const MAX_FILES = 3;
const MAX_FILE_MB = 4;
const SUBJECT_IDS = [0, 1, 2, 3, 4, 5] as const;

type AttachedFile = { file: File; preview?: string };

export function SupportForm({ onSuccess }: { onSuccess?: (email: string) => void }) {
  const t = useTranslations("soporte");
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: "", email: "", topic: "", subject: "", message: "" });
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !authLoading) {
      queueMicrotask(() => {
        setForm((f) => ({
          ...f,
          name: (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || f.name,
          email: user.email ?? f.email,
        }));
      });
    }
  }, [user, authLoading]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateTopic(topic: string) {
    update("topic", topic);
    update("subject", topic ? t(topic) : "");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const remaining = MAX_FILES - attachments.length;
    // Allowed: safe images + PDF. Reject by MIME on the client for a localized message;
    // the server re-validates by magic bytes (the real gate). No SVG.
    const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
    const badType = selected.filter((f) => !allowedMime.includes(f.type));
    const okType = selected.filter((f) => allowedMime.includes(f.type));
    const toAdd = okType.slice(0, remaining).filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    const oversized = okType.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);

    if (badType.length > 0) {
      setError(t("errFormat"));
    } else if (oversized.length > 0) {
      setError(t("errOversized", { mb: MAX_FILE_MB }));
    }

    const withPreviews: AttachedFile[] = toAdd.map((file) => {
      let preview: string | undefined;
      if (file.type.startsWith("image/")) {
        preview = URL.createObjectURL(file);
      }
      return { file, preview };
    });

    setAttachments((prev) => [...prev, ...withPreviews]);
    // Reset input so the same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("nameLabel")} <span className="text-red-500">*</span>
          </label>
          <input type="text" className={inputClass} placeholder={t("namePlaceholder")}
            value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            {t("emailLabel")} <span className="text-red-500">*</span>
          </label>
          <input type="email" className={inputClass} placeholder={t("emailPlaceholder")}
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
            className="flex items-center gap-2 text-sm text-[#009FD9] border border-dashed border-[#009FD9]/40 rounded-xl px-4 py-2.5 hover:bg-[#EBF5FB] transition-colors w-full justify-center"
          >
            <Paperclip className="h-4 w-4" />
            {attachments.length === 0 ? t("attachBtn") : t("addAnother")}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={handleFileChange}
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
