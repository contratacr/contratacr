"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertCircle } from "lucide-react";

/**
 * Shared, on-brand REPORT modal (sprint 445) — same clean treatment as the cancel /
 * delete modals. Free-text reason only: do not suggest/report-template reasons.
 * Used for both "reportar cliente" (pro side) and "reportar profesional" (client side).
 */
export function ReportModal({
  title, body, detailsPlaceholder, backLabel, submitLabel, successLabel, errorLabel, onClose, onSubmit,
}: {
  title: string;
  body: string;
  detailsPlaceholder: string;
  backLabel: string;
  submitLabel: string;
  successLabel: string;
  errorLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    const reason = details.trim();
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const ok = await onSubmit(reason);
      if (ok) setSubmitted(true);
      else setError(true);
    } finally {
      setSubmitting(false);
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
        {submitted ? (
          <div className="py-2 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#EBF5FB] text-[#0089bb]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-[#111827]">{successLabel}</h2>
            <Button size="sm" className="mt-5 w-full rounded-lg" onClick={onClose}>
              {backLabel}
            </Button>
          </div>
        ) : (
        <>
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

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorLabel}</span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={onClose} disabled={submitting}>{backLabel}</Button>
          <Button size="sm" className="flex-1 rounded-lg bg-red-600 hover:bg-red-700" onClick={submit} disabled={!details.trim() || submitting} loading={submitting}>{submitLabel}</Button>
        </div>
        </>
        )}
      </div>
    </div>,
    document.body,
  );
}
