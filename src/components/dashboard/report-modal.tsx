"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Shared, on-brand REPORT modal (sprint 445) — same clean treatment as the cancel /
 * delete modals. Free-text reason only: do not suggest/report-template reasons.
 * Used for both "reportar cliente" (pro side) and "reportar profesional" (client side).
 */
export function ReportModal({
  title, body, detailsPlaceholder, backLabel, submitLabel, onClose, onSubmit,
}: {
  title: string;
  body: string;
  detailsPlaceholder: string;
  backLabel: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const reason = details.trim();
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason);
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-base font-bold text-[#111827]">{title}</h2>
        <p className="mt-1 text-sm text-[#6b7280]">{body}</p>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder={detailsPlaceholder}
          className="mt-4 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent resize-none"
        />

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={onClose} disabled={submitting}>{backLabel}</Button>
          <Button size="sm" className="flex-1 rounded-full bg-red-600 hover:bg-red-700" onClick={submit} disabled={!details.trim() || submitting} loading={submitting}>{submitLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
