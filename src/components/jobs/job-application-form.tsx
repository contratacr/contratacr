"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  jobId: string;
  userId: string | null;
  hasApplied: boolean;
  isOwner: boolean;
  initialEmail?: string | null;
  initialPhone?: string | null;
  initialLinkedIn?: string | null;
  autoFocusApplication?: boolean;
  loginRedirect?: string;
  onSubmitted?: () => void;
};

type RecentResume = {
  url: string;
  name: string;
  usedAt: string;
};

export function JobApplicationForm({
  jobId,
  userId,
  hasApplied,
  isOwner,
  initialEmail,
  initialPhone,
  initialLinkedIn,
  autoFocusApplication = false,
  loginRedirect,
  onSubmitted,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(hasApplied);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [recentResume, setRecentResume] = useState<RecentResume | null>(null);
  const [loadingResume, setLoadingResume] = useState(Boolean(userId && !hasApplied));

  useEffect(() => {
    if (!autoFocusApplication || !userId || submitted) return;
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [autoFocusApplication, submitted, userId]);

  useEffect(() => {
    if (!userId || submitted) {
      setLoadingResume(false);
      return;
    }
    const controller = new AbortController();
    fetch("/api/jobs/resume", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : { resume: null })
      .then((payload) => setRecentResume(payload.resume ?? null))
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name !== "AbortError") setRecentResume(null);
      })
      .finally(() => setLoadingResume(false));
    return () => controller.abort();
  }, [submitted, userId]);

  if (isOwner) return <Link href="/dashboard/profesional?mode=offer&tab=jobs" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3]">Administrar este empleo</Link>;
  if (!userId) return <Link href={`/login?redirect=${encodeURIComponent(loginRedirect ?? `/empleos?apply=${jobId}`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white">Inicia sesión para postularte</Link>;
  if (submitted) return <div className="flex items-center gap-3 rounded-lg bg-[#ecf9f5] p-4 text-sm font-bold text-[#08775c]"><CheckCircle2 className="h-5 w-5" />Tu postulación fue enviada.</div>;

  async function uploadResume(file: File) {
    const body = new FormData();
    body.append("file", file);
    body.append("jobId", jobId);
    const response = await fetch("/api/jobs/resume", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || "No pudimos adjuntar tu CV.");
    return String(payload.url);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const resume = form.get("resume") as File | null;
    if (!email) {
      setError("Agrega tu correo para postularte.");
      setSaving(false);
      return;
    }
    if (!phone) {
      setError("Agrega tu teléfono para postularte.");
      setSaving(false);
      return;
    }
    if ((!resume || resume.size <= 0) && !recentResume?.url) {
      setError("Adjunta tu CV.");
      setSaving(false);
      return;
    }

    let resumeUrl = recentResume?.url ?? "";
    if (resume && resume.size > 0) {
      try {
        resumeUrl = await uploadResume(resume);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "No pudimos adjuntar tu CV.");
        setSaving(false);
        return;
      }
    }

    const message = String(form.get("cover_letter") || "").trim();
    const linkedinUrl = String(form.get("linkedin_url") || "").trim();
    const portfolioUrl = String(form.get("portfolio_url") || "").trim();
    const extraLinks = [
      linkedinUrl ? `LinkedIn: ${linkedinUrl}` : "",
      portfolioUrl ? `Portafolio: ${portfolioUrl}` : "",
    ].filter(Boolean);
    const coverLetter = [message || "Sin mensaje adicional.", ...extraLinks].join("\n\n");

    const { error: insertError } = await createClient().from("job_applications").insert({
      job_id: jobId,
      applicant_id: userId,
      applicant_email: email,
      cover_letter: coverLetter,
      phone,
      resume_url: resumeUrl,
      portfolio_url: portfolioUrl || linkedinUrl || null,
    });
    if (insertError) {
      setError(insertError.code === "23505"
        ? "Ya te postulaste a este empleo."
        : insertError.message.includes("applicant_email") || insertError.message.includes("schema cache")
          ? "La base de datos de empleos necesita actualizarse con la última migración."
          : "No pudimos enviar tu postulación.");
      setSaving(false);
      return;
    }
    setSubmitted(true);
    onSubmitted?.();
  }

  const field = "mt-1 h-10 w-full rounded-lg border border-[#d7e1ea] px-3 text-sm outline-none focus:border-[#009fd9]";
  return (
    <div ref={containerRef}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Postularme</h2>
          <p className="mt-1 text-xs leading-5 text-[#68778d]">Revisá tus datos y adjuntá tu CV para enviar la postulación.</p>
        </div>
        <label className="block text-sm font-semibold">Mensaje <span className="font-normal text-[#8794a7]">(opcional)</span><textarea name="cover_letter" maxLength={3000} placeholder="Podés contar brevemente por qué te interesa el empleo." className="mt-1 min-h-24 w-full rounded-lg border border-[#d7e1ea] px-3 py-2 text-sm outline-none focus:border-[#009fd9]" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Correo <span className="text-red-500">*</span><input name="email" type="email" required defaultValue={initialEmail ?? ""} placeholder="correo@ejemplo.com" className={field} /></label>
          <label className="block text-sm font-semibold">Teléfono <span className="text-red-500">*</span><input name="phone" required inputMode="tel" defaultValue={initialPhone ?? ""} placeholder="506 8888 8888" className={field} /></label>
        </div>
        <label className="block text-sm font-semibold">LinkedIn <span className="font-normal text-[#8794a7]">(opcional)</span><input name="linkedin_url" type="url" defaultValue={initialLinkedIn ?? ""} placeholder="https://linkedin.com/in/usuario" className={field} /></label>
        <label className="block text-sm font-semibold">Portafolio <span className="font-normal text-[#8794a7]">(opcional)</span><input name="portfolio_url" type="url" placeholder="https://tusitio.com" className={field} /></label>
        <label className="block text-sm font-semibold">
          Adjuntar CV <span className="text-red-500">*</span>
          <span className="mt-1 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-[#b8d9ea] bg-[#f7fcff] px-3 text-sm font-bold text-[#008fc3] transition hover:border-[#009fd9]">
            <span className="inline-flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{resumeName || recentResume?.name || (loadingResume ? "Buscando tu CV reciente..." : "Adjuntar CV")}</span>
                {recentResume && !resumeName && <span className="block text-[11px] font-medium text-[#68778d]">CV usado recientemente</span>}
            {resumeName && <span className="block text-[11px] font-medium text-[#68778d]">Nuevo CV para esta postulación</span>}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
              {recentResume && !resumeName ? "Reemplazar" : "Seleccionar"}
              <Upload className="h-4 w-4" />
            </span>
          </span>
          <input name="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => setResumeName(event.currentTarget.files?.[0]?.name ?? "")} />
        </label>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={saving} className="h-11 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white disabled:opacity-60">{saving ? "Enviando..." : "Enviar postulación"}</button>
      </form>
    </div>
  );
}
