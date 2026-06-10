"use client";

import { useEffect, useRef, useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, MessageSquare, AlertCircle, Paperclip, X, LifeBuoy } from "lucide-react";
import { Link } from "@/i18n/navigation";

const SUBJECTS = [
  "Problema técnico en la plataforma",
  "Tengo una pregunta sobre mi cuenta",
  "Quiero reportar a un usuario",
  "Problemas con el registro profesional",
  "Problemas con una reservación o proyecto",
  "Otro",
];

const MAX_FILES = 3;
const MAX_FILE_MB = 4;

type AttachedFile = { file: File; preview?: string };

export default function SoportePage() {
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !authLoading) {
      setForm((f) => ({
        ...f,
        name: (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || f.name,
        email: user.email ?? f.email,
      }));
    }
  }, [user, authLoading]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const remaining = MAX_FILES - attachments.length;
    const toAdd = selected.slice(0, remaining).filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    const oversized = selected.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);

    if (oversized.length > 0) {
      setError(`Algunos archivos superan el límite de ${MAX_FILE_MB}MB y fueron omitidos.`);
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
    if (!form.email || !form.subject || !form.message) {
      setError("Por favor completa todos los campos requeridos.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("email", form.email);
      fd.append("subject", form.subject);
      fd.append("message", form.message);
      for (const { file } of attachments) {
        fd.append("attachments", file);
      }

      const res = await fetch("/api/contact", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Error al enviar. Intenta de nuevo.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Error inesperado. Intenta de nuevo en unos minutos.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <LandingNavbar />
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center max-w-md">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EBF5FB] mx-auto mb-5">
              <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Ticket creado!</h1>
            {user ? (
              <>
                <p className="text-[#6b7280] mb-6">
                  Recibimos tu consulta. Te respondemos por correo y puedes seguir la conversación en tus tickets.
                </p>
                <Link
                  href="/dashboard/cliente?tab=soporte"
                  className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm"
                >
                  <LifeBuoy className="h-4 w-4" /> Ver mis tickets
                </Link>
              </>
            ) : (
              <>
                <p className="text-[#6b7280] mb-6">
                  Recibimos tu consulta. Te responderemos por correo a <strong>{form.email}</strong>.
                </p>
                <p className="text-sm text-[#9ca3af]">
                  ¿Quieres seguir tus tickets en la plataforma?{" "}
                  <Link href="/login" className="text-[#009FD9] font-semibold hover:underline">Inicia sesión</Link> con ese correo.
                </p>
              </>
            )}
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <main className="flex-1 py-16 px-4">
        <div className="mx-auto max-w-xl">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EBF5FB] mx-auto mb-3">
              <MessageSquare className="h-6 w-6 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-1">Centro de soporte</h1>
            <p className="text-sm text-[#6b7280]">Abre un ticket y te respondemos por correo y en tu panel. Es nuestro único canal de soporte, así no se pierde ninguna consulta.</p>
          </div>

          {/* Primary: support ticket form */}
          <div>
              <div className="bg-white rounded-3xl border border-[#e5e7eb] shadow-sm p-8">
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">
                        Nombre <span className="text-[#9ca3af] font-normal">(opcional)</span>
                      </label>
                      <input type="text" className={inputClass} placeholder="Tu nombre"
                        value={form.name} onChange={(e) => update("name", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">
                        Correo electrónico <span className="text-red-500">*</span>
                      </label>
                      <input type="email" className={inputClass} placeholder="tucorreo@ejemplo.com"
                        value={form.email} onChange={(e) => update("email", e.target.value)} required />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      Asunto <span className="text-red-500">*</span>
                    </label>
                    <select className={inputClass + " cursor-pointer"} value={form.subject}
                      onChange={(e) => update("subject", e.target.value)} required>
                      <option value="">Selecciona el motivo de tu consulta</option>
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      Mensaje <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[130px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder="Describe tu consulta con el mayor detalle posible. Si es un problema técnico, describe qué pasó y en qué pantalla estás."
                      value={form.message} onChange={(e) => update("message", e.target.value)} required
                    />
                  </div>

                  {/* Attachments */}
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-2">
                      Adjuntos <span className="text-[#9ca3af] font-normal">(opcional, máx. {MAX_FILES} archivos · {MAX_FILE_MB}MB c/u)</span>
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
                        {attachments.length === 0 ? "Adjuntar imagen o PDF" : "Agregar otro archivo"}
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
                      Formatos aceptados: JPG, PNG, WebP, PDF
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
                    {submitting ? "Enviando…" : "Enviar mensaje"}
                  </button>
                </form>
              </div>
            </div>

        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
