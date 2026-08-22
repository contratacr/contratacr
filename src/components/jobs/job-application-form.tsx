"use client";

import { trackInteraction } from "@/lib/analytics/interaction-events";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, Upload } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { PhoneInput, hasPhoneNumber, isPhoneComplete } from "@/components/ui/phone-input";
import { marketplaceLocale } from "@/lib/marketplace-copy";

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
  onDismiss?: () => void;
};

type RecentResume = {
  url: string;
  name: string;
  usedAt: string;
};

const recentResumeCache = new Map<string, RecentResume | null>();
const recentResumeRequests = new Map<string, Promise<RecentResume | null>>();

const JOB_APPLICATION_COPY = {
  es: {
    manage: "Administrar este empleo",
    signIn: "Inicia sesión para postularte",
    sentTitle: "Postulación enviada",
    sentBody: "El profesional recibió tu información. Te notificaremos cuando haya una actualización.",
    backToJobs: "Volver a empleos",
    resumeUploadFailed: "No pudimos adjuntar tu CV.",
    emailRequired: "Agrega tu correo para postularte.",
    phoneRequired: "Agrega tu teléfono para postularte.",
    phoneInvalid: "Revisa que el teléfono tenga la cantidad correcta de dígitos.",
    resumeRequired: "Adjunta tu CV.",
    messageLength: "Escribe al menos 20 caracteres o deja el mensaje vacío.",
    linkInvalid: "Ingresa un enlace válido, por ejemplo linkedin.com/in/usuario.",
    portfolioInvalid: "Ingresa un enlace válido, por ejemplo tusitio.com.",
    noMessage: "Sin mensaje adicional.",
    duplicate: "Ya te postulaste a este empleo.",
    invalidData: "Revisa el mensaje y los datos de la postulación.",
    sessionInvalid: "Tu sesión no permite enviar esta postulación. Inicia sesión nuevamente.",
    databaseMigration: "La base de datos de empleos necesita actualizarse con la última migración.",
    sendFailed: "No pudimos enviar tu postulación. Inténtalo nuevamente.",
    apply: "Postularme",
    intro: "Revisá tus datos y adjuntá tu CV para enviar la postulación.",
    message: "Mensaje",
    optional: "opcional",
    messagePlaceholder: "Podés contar brevemente por qué te interesa el empleo.",
    email: "Correo",
    emailPlaceholder: "correo@ejemplo.com",
    phone: "Teléfono",
    portfolio: "Portafolio",
    attachResume: "Adjuntar CV",
    findingResume: "Buscando tu CV reciente...",
    recentResume: "CV usado recientemente",
    newResume: "Nuevo CV para esta postulación",
    loading: "Cargando",
    replace: "Reemplazar",
    select: "Seleccionar",
    sending: "Enviando...",
    send: "Enviar postulación",
  },
  en: {
    manage: "Manage this job",
    signIn: "Sign in to apply",
    sentTitle: "Application sent",
    sentBody: "The professional received your information. We'll notify you when there is an update.",
    backToJobs: "Back to jobs",
    resumeUploadFailed: "We couldn't attach your resume.",
    emailRequired: "Add your email address to apply.",
    phoneRequired: "Add your phone number to apply.",
    phoneInvalid: "Check that the phone number has the correct number of digits.",
    resumeRequired: "Attach your resume.",
    messageLength: "Write at least 20 characters or leave the message blank.",
    linkInvalid: "Enter a valid link, for example linkedin.com/in/username.",
    portfolioInvalid: "Enter a valid link, for example yoursite.com.",
    noMessage: "No additional message.",
    duplicate: "You already applied for this job.",
    invalidData: "Review your message and application details.",
    sessionInvalid: "Your session cannot submit this application. Sign in again.",
    databaseMigration: "The jobs database needs the latest migration.",
    sendFailed: "We couldn't send your application. Try again.",
    apply: "Apply",
    intro: "Review your details and attach your resume to submit the application.",
    message: "Message",
    optional: "optional",
    messagePlaceholder: "Briefly explain why you're interested in this job.",
    email: "Email",
    emailPlaceholder: "email@example.com",
    phone: "Phone",
    portfolio: "Portfolio",
    attachResume: "Attach resume",
    findingResume: "Looking for your recent resume...",
    recentResume: "Recently used resume",
    newResume: "New resume for this application",
    loading: "Loading",
    replace: "Replace",
    select: "Select",
    sending: "Sending...",
    send: "Submit application",
  },
} as const;

function loadRecentResume(userId: string) {
  const cachedRequest = recentResumeRequests.get(userId);
  if (cachedRequest) return cachedRequest;

  const request = fetch("/api/jobs/resume", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : { resume: null })
    .then((payload) => (payload.resume ?? null) as RecentResume | null)
    .catch(() => null)
    .then((resume) => {
      recentResumeCache.set(userId, resume);
      recentResumeRequests.delete(userId);
      return resume;
    });

  recentResumeRequests.set(userId, request);
  return request;
}

function normalizeOptionalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.hostname.includes(".") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

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
  onDismiss,
}: Props) {
  const copy = JOB_APPLICATION_COPY[marketplaceLocale(useLocale())];
  const containerRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(hasApplied);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [recentResume, setRecentResume] = useState<RecentResume | null>(() => userId ? recentResumeCache.get(userId) ?? null : null);
  const [loadingResume, setLoadingResume] = useState(Boolean(userId && !hasApplied && !recentResumeCache.has(userId)));
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [linkedinError, setLinkedinError] = useState("");
  const [portfolioError, setPortfolioError] = useState("");
  const [messageError, setMessageError] = useState("");

  useEffect(() => {
    if (!autoFocusApplication || !userId || submitted) return;
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [autoFocusApplication, submitted, userId]);

  useEffect(() => {
    if (!userId || submitted) {
      setLoadingResume(false);
      return;
    }
    if (recentResumeCache.has(userId)) {
      setRecentResume(recentResumeCache.get(userId) ?? null);
      setLoadingResume(false);
      return;
    }

    let cancelled = false;
    setLoadingResume(true);
    loadRecentResume(userId).then((resume) => {
      if (cancelled) return;
      setRecentResume(resume);
      setLoadingResume(false);
    });
    return () => {
      cancelled = true;
    };
  }, [submitted, userId]);

  if (isOwner) return <Link href="/dashboard/profesional?mode=offer&tab=jobs" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3]">{copy.manage}</Link>;
  if (!userId) return <Link href={`/login?redirect=${encodeURIComponent(loginRedirect ?? `/empleos?apply=${jobId}`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white">{copy.signIn}</Link>;
  if (submitted) return (
    <div className="flex flex-col items-center px-2 py-3 text-center sm:py-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e9f8fc] text-[#009fd9]">
        <CheckCircle2 className="h-9 w-9" strokeWidth={2} />
      </div>
      <h3 className="mt-4 text-xl font-bold text-[#102142]">{copy.sentTitle}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#68778d]">
        {copy.sentBody}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:max-w-xs"
        >
          {copy.backToJobs}
        </button>
      )}
    </div>
  );

  async function uploadResume(file: File) {
    const body = new FormData();
    body.append("file", file);
    body.append("jobId", jobId);
    const response = await fetch("/api/jobs/resume", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || copy.resumeUploadFailed);
    return String(payload.url);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setLinkedinError("");
    setPortfolioError("");
    setMessageError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const message = String(form.get("cover_letter") || "").trim();
    const resume = form.get("resume") as File | null;
    if (!email) {
      setError(copy.emailRequired);
      setSaving(false);
      return;
    }
    if (!hasPhoneNumber(phone)) {
      setError(copy.phoneRequired);
      setSaving(false);
      return;
    }
    if (!isPhoneComplete(phone)) {
      setError(copy.phoneInvalid);
      setSaving(false);
      return;
    }
    if ((!resume || resume.size <= 0) && !recentResume?.url) {
      setError(copy.resumeRequired);
      setSaving(false);
      return;
    }
    if (message.length > 0 && message.length < 20) {
      setMessageError(copy.messageLength);
      setSaving(false);
      return;
    }

    let resumeUrl = recentResume?.url ?? "";
    if (resume && resume.size > 0) {
      try {
        resumeUrl = await uploadResume(resume);
        const uploadedResume = { url: resumeUrl, name: resume.name, usedAt: new Date().toISOString() };
        recentResumeCache.set(userId!, uploadedResume);
        setRecentResume(uploadedResume);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : copy.resumeUploadFailed);
        setSaving(false);
        return;
      }
    }

    const linkedinUrl = normalizeOptionalUrl(String(form.get("linkedin_url") || ""));
    const portfolioUrl = normalizeOptionalUrl(String(form.get("portfolio_url") || ""));
    if (linkedinUrl === null) {
      setLinkedinError(copy.linkInvalid);
      setSaving(false);
      return;
    }
    if (portfolioUrl === null) {
      setPortfolioError(copy.portfolioInvalid);
      setSaving(false);
      return;
    }
    const extraLinks = [
      linkedinUrl ? `LinkedIn: ${linkedinUrl}` : "",
      portfolioUrl ? `Portafolio: ${portfolioUrl}` : "",
    ].filter(Boolean);
    const coverLetter = [message || copy.noMessage, ...extraLinks].join("\n\n");

    const { error: insertError } = await createClient().from("job_applications").insert({
      job_id: jobId,
      applicant_id: userId,
      applicant_email: email,
      cover_letter: coverLetter,
      phone,
      resume_url: resumeUrl,
      portfolio_url: portfolioUrl || linkedinUrl || null,
    });
    if (!insertError) trackInteraction({ type: "job_application_sent", source: "jobs", metadata: { jobId } });
    if (insertError) {
      console.error("[jobs] job application insert failed", {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      });
      const databaseMessage = insertError.message.toLowerCase();
      setError(insertError.code === "23505"
        ? copy.duplicate
        : insertError.code === "23514"
          ? copy.invalidData
          : insertError.code === "42501"
            ? copy.sessionInvalid
            : databaseMessage.includes("applicant_email") || databaseMessage.includes("schema cache")
              ? copy.databaseMigration
              : copy.sendFailed);
      setSaving(false);
      return;
    }
    setSubmitted(true);
    onSubmitted?.();
  }

  const field = "mt-1 h-11 w-full rounded-xl border border-[#d7e1ea] px-3 text-sm outline-none focus:border-[#009fd9]";
  return (
    <div ref={containerRef}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">{copy.apply}</h2>
          <p className="mt-1 text-xs leading-5 text-[#68778d]">{copy.intro}</p>
        </div>
        <label className="block text-sm font-semibold">
          {copy.message} <span className="font-normal text-[#8794a7]">({copy.optional})</span>
          <textarea name="cover_letter" maxLength={3000} placeholder={copy.messagePlaceholder} aria-invalid={Boolean(messageError)} className={`mt-1 min-h-24 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[#009fd9] ${messageError ? "border-red-400" : "border-[#d7e1ea]"}`} />
          {messageError && <span className="mt-1 block text-xs font-medium text-red-600">{messageError}</span>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">{copy.email} <span className="text-red-500">*</span><input name="email" type="email" required defaultValue={initialEmail ?? ""} placeholder={copy.emailPlaceholder} className={field} /></label>
          <PhoneInput
            id="job-application-phone"
            label={copy.phone}
            required
            value={phone}
            onChange={setPhone}
          />
        </div>
        <label className="block text-sm font-semibold">
          LinkedIn <span className="font-normal text-[#8794a7]">({copy.optional})</span>
          <input name="linkedin_url" type="text" inputMode="url" autoCapitalize="none" defaultValue={initialLinkedIn ?? ""} placeholder="linkedin.com/in/usuario" aria-invalid={Boolean(linkedinError)} className={`${field} ${linkedinError ? "border-red-400" : ""}`} />
          {linkedinError && <span className="mt-1 block text-xs font-medium text-red-600">{linkedinError}</span>}
        </label>
        <label className="block text-sm font-semibold">
          {copy.portfolio} <span className="font-normal text-[#8794a7]">({copy.optional})</span>
          <input name="portfolio_url" type="text" inputMode="url" autoCapitalize="none" placeholder="tusitio.com" aria-invalid={Boolean(portfolioError)} className={`${field} ${portfolioError ? "border-red-400" : ""}`} />
          {portfolioError && <span className="mt-1 block text-xs font-medium text-red-600">{portfolioError}</span>}
        </label>
        <label className="block text-sm font-semibold">
          {copy.attachResume} <span className="text-red-500">*</span>
          <span className="mt-1 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-[#b8d9ea] bg-[#f7fcff] px-3 text-sm font-bold text-[#008fc3] transition hover:border-[#009fd9]">
            <span className="inline-flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className={`block truncate ${loadingResume ? "animate-pulse text-[#68778d]" : ""}`}>{resumeName || recentResume?.name || (loadingResume ? copy.findingResume : copy.attachResume)}</span>
                {recentResume && !resumeName && <span className="block text-[11px] font-medium text-[#68778d]">{copy.recentResume}</span>}
            {resumeName && <span className="block text-[11px] font-medium text-[#68778d]">{copy.newResume}</span>}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
              {loadingResume ? (
                <><span>{copy.loading}</span><LoaderCircle className="h-4 w-4 animate-spin" /></>
              ) : (
                <>{recentResume && !resumeName ? copy.replace : copy.select}<Upload className="h-4 w-4" /></>
              )}
            </span>
          </span>
          <input name="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => setResumeName(event.currentTarget.files?.[0]?.name ?? "")} />
        </label>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={saving} className="h-11 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white disabled:opacity-60">{saving ? copy.sending : copy.send}</button>
      </form>
    </div>
  );
}
