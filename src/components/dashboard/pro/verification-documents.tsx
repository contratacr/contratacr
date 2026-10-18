"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SupportLink } from "@/components/support/support-link";
import { Check, X } from "lucide-react";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";

export const verificationActionButtonClass = "inline-flex h-10 w-full items-center justify-center rounded-full border px-4 text-sm font-bold transition-colors sm:w-56";

export function VerificationDocuments({ legal, preview = false, onVerified }: { legal: boolean; preview?: boolean; onVerified?: () => void }) {
  const en = useLocale() === "en";
  const t = useTranslations("manualVerification");
  const [isLegal, setIsLegal] = useState(legal);
  const [requested, setRequested] = useState(false);
  const [canReview, setCanReview] = useState(preview);
  const [verified, setVerified] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const notified = useRef(false);
  useEffect(() => {
    if (verified && !notified.current) { notified.current = true; onVerified?.(); }
  }, [verified, onVerified]);
  const [message, setMessage] = useState("");
  const [retryNote, setRetryNote] = useState("");
  async function retry() {
    if (preview) return;
    setBusy(true); setError(""); setRetryNote("");
    try {
      const response = await fetch("/api/verify-identity", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.outcome === "verified") { setVerified(true); return; }
      if (data.outcome === "pending") setCanReview(true);
      setRetryNote(t(data.outcome === "skipped" ? "unavailable" : "pending"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("error")); }
    finally { setBusy(false); }
  }
  async function appeal() {
    if (preview) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/appeals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRequested(true); setReviewOpen(false); setMessage("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("error")); }
    finally { setBusy(false); }
  }
  const [files, setFiles] = useState<Record<string, File>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(preview);
  useEffect(() => {
    if (preview) return;
    let active = true;
    fetch("/api/verification/documents").then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!active) return;
      setSubmitted(data.submitted); setRequested(!!data.reviewRequested); setVerified(!!data.verified); setCanReview(!!data.canReview);
      if (typeof data.legal === "boolean") setIsLegal(data.legal);
      // Resolve old pending records on entry. Outages remain pending and never
      // expose document requests as if the ID had actually been missing.
      if (!data.verified && data.canVerify && !data.canReview && !data.reviewRequested && !data.submitted) {
        const result = await fetch("/api/verify-identity", { method: "POST" });
        if (!result.ok) throw new Error();
        const state = await result.json();
        if (!active) return;
        setVerified(state.outcome === "verified"); setCanReview(state.outcome === "pending");
        if (state.outcome === "skipped") setRetryNote(t("unavailable"));
      }
      setLoaded(true);
    }).catch(() => { if (active) setError(en ? "Could not load your review. Reload to try again." : "No se pudo cargar tu revisión. Recarga para intentarlo de nuevo."); });
    return () => { active = false; };
  }, [preview, en, t]);
  async function submit() {
    if (!Object.keys(files).length) { await appeal(); return; }
    if (preview) { setError(en ? "Preview only: no documents are sent." : "Vista previa: no se envían documentos."); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.set("message", message);
      for (const [key, file] of Object.entries(files)) body.set(key, file);
      const response = await fetch("/api/verification/documents", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmitted(true); setReviewOpen(false); setFiles({});
    } catch (error) { setError(error instanceof Error ? error.message : (en ? "Please try again." : "Intenta nuevamente.")); }
    finally { setBusy(false); }
  }
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const documents = [
    { id: "identity", title: isLegal ? (en ? "Authorized person" : "Persona autorizada") : (en ? "Photo with your ID" : "Foto con tu identificación"), description: en ? "Hold your ID next to your face, with the details clearly visible." : "Tu rostro junto a la identificación, con los datos legibles." },
    ...(isLegal ? [{ id: "company", title: en ? "Legal representation" : "Personería o autorización", description: en ? "A current document confirming your authorization to represent the company." : "Documento vigente que confirme la representación de la empresa." }] : []),
  ];
  const ready = !Object.keys(files).length || documents.every(doc => files[doc.id]);
  return <div data-testid="verification-documents" className="space-y-5">
    <UnsavedChangesGuard dirty={(Object.keys(files).length > 0 || message.trim().length > 0) && !submitted} />
    <section className="bg-white">
      {!loaded && !error && <p role="status" className="text-sm text-[#52627a]">{t("checking")}</p>}
      {loaded && verified && <p role="status" className="flex items-center gap-2 text-sm font-bold text-[#087ca3]"><Check className="h-4 w-4" />{t("verified")}</p>}
      {loaded && !verified && (submitted || requested) && <div className="space-y-3">
        <p role="status" className="text-sm font-semibold text-[#087ca3]">{t("requested")}</p>
        <SupportLink className="text-sm font-semibold text-[#009FD9]">{t("viewCase")}</SupportLink>
        {!submitted && canReview && !reviewOpen && <button type="button" onClick={() => setReviewOpen(true)} className={`${verificationActionButtonClass} border-[#d7e1ea] text-[#162543]`}>{t("addDocuments")}</button>}
      </div>}
      {loaded && !verified && !submitted && !requested && <div className="space-y-3">
        <p className="text-sm leading-6 text-[#52627a]">{t(canReview ? "body" : "pendingCheck")}</p>
        {canReview && <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={retry} disabled={busy || preview} className={`${verificationActionButtonClass} border-[#d7e1ea] text-[#162543] disabled:opacity-45`}>{busy ? t("checking") : t("retry")}</button>
          {!reviewOpen && <button type="button" onClick={() => setReviewOpen(true)} className={`${verificationActionButtonClass} border-[#009FD9] text-[#087ca3]`}>{t("request")}</button>}
        </div>}
      </div>}
      {!verified && retryNote && <p role="status" className="mt-3 text-sm text-[#52627a]">{retryNote}</p>}
      {loaded && canReview && !verified && reviewOpen && !submitted && <div className="mt-4 space-y-3">
        <p className="text-sm text-[#52627a]">{t("private")}</p>
        <label className="block text-sm font-semibold text-[#162543]" htmlFor="verification-appeal-message">{t("reason")}</label>
        <textarea id="verification-appeal-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} disabled={busy} rows={2} className="w-full rounded-xl border border-[#d7e1ea] p-3 text-sm text-[#162543]" />
      <div className="pb-1">
        <div className="space-y-3" aria-busy={busy || !loaded}>
          {!submitted && documents.map(doc => <div key={doc.id} className="py-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#162543]">{doc.title}</p><p className="mt-1 text-sm leading-6 text-[#52627a]">{doc.description}</p></div>
            </div>
            {files[doc.id] ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f5f8fb] px-3 py-2"><Check className="h-4 w-4 shrink-0 text-[#087ca3]" aria-hidden="true" /><span className="min-w-0 flex-1 break-all text-sm text-[#162543]">{files[doc.id].name}</span>{!submitted && <button type="button" aria-label={en ? `Remove ${doc.title}` : `Quitar ${doc.title}`} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#68778d] hover:bg-white" onClick={() => setFiles(prev => { const next = { ...prev }; delete next[doc.id]; return next; })}><X className="h-4 w-4" /></button>}</div>
              : <button type="button" disabled={busy} onClick={() => refs.current[doc.id]?.click()} className={`mt-3 ${verificationActionButtonClass} border-[#e5e7eb] bg-white text-[#162543] hover:border-[#009FD9]/50 hover:bg-[#f1fbfe] hover:text-[#0089bb]`}>{doc.id === "identity" ? (en ? "Upload photo" : "Subir foto") : (en ? "Upload document" : "Subir documento")}</button>}
            <input className="sr-only" aria-label={doc.title} ref={el => { refs.current[doc.id] = el; }} disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,application/pdf" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 4 * 1024 * 1024) { setError(en ? "Each file must be 4 MB or smaller." : "Cada archivo debe pesar 4 MB o menos."); return; } setError(""); setFiles(prev => ({ ...prev, [doc.id]: file })); }} />
          </div>)}
        </div>
        {!submitted && <button type="button" disabled={!ready || busy || !loaded} onClick={submit} className={`mt-5 ${verificationActionButtonClass} border-transparent bg-[#009FD9] text-white hover:bg-[#0089bb] disabled:opacity-45`}>{busy ? (en ? "Sending…" : "Enviando…") : (en ? "Send for review" : "Enviar a revisión")}</button>}
      </div>
      <button type="button" disabled={busy} onClick={() => { setReviewOpen(false); setFiles({}); setMessage(""); }} className="text-sm font-semibold text-[#52627a]">{t("cancel")}</button>
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  </div>;
}
