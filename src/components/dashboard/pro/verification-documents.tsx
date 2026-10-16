"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { SupportLink } from "@/components/support/support-link";
import { Check, X } from "lucide-react";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";

export const verificationActionButtonClass = "inline-flex h-10 w-full items-center justify-center rounded-full border px-4 text-sm font-bold transition-colors sm:w-56";

export function VerificationDocuments({ legal, preview = false }: { legal: boolean; preview?: boolean }) {
  const en = useLocale() === "en";
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
      if (active) { setSubmitted(data.submitted); setLoaded(true); }
    }).catch(() => { if (active) setError(en ? "Could not load your review. Reload to try again." : "No se pudo cargar tu revisión. Recarga para intentarlo de nuevo."); });
    return () => { active = false; };
  }, [preview, en]);
  async function submit() {
    if (preview) { setError(en ? "Preview only: no documents are sent." : "Vista previa: no se envían documentos."); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData();
      for (const [key, file] of Object.entries(files)) body.set(key, file);
      const response = await fetch("/api/verification/documents", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmitted(true); setFiles({});
    } catch (error) { setError(error instanceof Error ? error.message : (en ? "Please try again." : "Intenta nuevamente.")); }
    finally { setBusy(false); }
  }
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const documents = [
    { id: "identity", title: legal ? (en ? "Authorized person" : "Persona autorizada") : (en ? "Photo with your ID" : "Foto con tu identificación"), description: en ? "Hold your ID next to your face, with the details clearly visible." : "Tu rostro junto a la identificación, con los datos legibles." },
    ...(legal ? [{ id: "company", title: en ? "Legal representation" : "Personería o autorización", description: en ? "A current document confirming your authorization to represent the company." : "Documento vigente que confirme la representación de la empresa." }] : []),
  ];
  const ready = documents.every(doc => files[doc.id]);
  return <div data-testid="verification-documents" className="space-y-5">
    <UnsavedChangesGuard dirty={Object.keys(files).length > 0 && !submitted} />
    <section className="bg-white">
      {submitted && <p role="status" className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#087ca3]"><Check className="h-4 w-4" aria-hidden="true" />{en ? "Documents under review" : "Documentos en revisión"}</p>}
      {submitted && <SupportLink className="text-sm font-semibold text-[#009FD9]">{en ? "View my case" : "Ver mi caso"}</SupportLink>}
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
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        {!submitted && <button type="button" disabled={!ready || busy || !loaded} onClick={submit} className={`mt-5 ${verificationActionButtonClass} border-transparent bg-[#009FD9] text-white hover:bg-[#0089bb] disabled:opacity-45`}>{busy ? (en ? "Sending…" : "Enviando…") : (en ? "Send for review" : "Enviar a revisión")}</button>}
      </div>
    </section>
  </div>;
}
