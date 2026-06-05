"use client";

import { useEffect, useRef, useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, MessageSquare, AlertCircle, Paperclip, X } from "lucide-react";
import { SUPPORT_WHATSAPP_URL } from "@/lib/constants";

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
      setError("Por favor completá todos los campos requeridos.");
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
        setError(data.error ?? "Error al enviar. Intentá de nuevo.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Error inesperado. Por favor escribinos a soporte@contratacr.com");
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
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Mensaje enviado!</h1>
            <p className="text-[#6b7280] mb-6">
              Te respondemos a <strong>{form.email}</strong> en menos de 24 horas.
            </p>
            <p className="text-sm text-[#9ca3af]">
              También podés escribirnos directamente a{" "}
              <a href="mailto:soporte@contratacr.com" className="text-[#009FD9] hover:underline">
                soporte@contratacr.com
              </a>
            </p>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <main className="flex-1 py-20 px-4">
        <div className="mx-auto max-w-2xl">

          <div className="text-center mb-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EBF5FB] mx-auto mb-4">
              <MessageSquare className="h-7 w-7 text-[#009FD9]" />
            </div>
            <h1 className="text-3xl font-bold text-[#111827] mb-2">Centro de soporte</h1>
            <p className="text-[#6b7280]">Respondemos en menos de 24 horas hábiles.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
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
                      <option value="">Seleccioná el motivo de tu consulta</option>
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      Mensaje <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[130px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder="Describí tu consulta con el mayor detalle posible. Si es un problema técnico, describí qué pasó y en qué pantalla estás."
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

            <div className="flex flex-col gap-4">
              {/* CTA card */}
              <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                <p className="text-sm font-bold text-[#111827] mb-1">¿No encontraste lo que buscás?</p>
                <p className="text-xs text-[#9ca3af] mb-4">Nuestro equipo responde rápido.</p>
                <div className="flex flex-col gap-2">
                  <a
                    href="#form-top"
                    onClick={(e) => { e.preventDefault(); document.querySelector("form")?.scrollIntoView({ behavior: "smooth" }); }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-semibold transition-colors"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Abrir ticket de soporte
                  </a>
                  <a
                    href={SUPPORT_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1db954] text-white text-sm font-semibold transition-colors"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                </div>
              </div>

              <div className="bg-[#EBF5FB] rounded-2xl p-5">
                <p className="text-sm font-semibold text-[#1a2744] mb-2">¿Podemos ayudarte con?</p>
                <ul className="space-y-1.5">
                  {[
                    "Problemas para iniciar sesión",
                    "Tu perfil no aparece en búsquedas",
                    "Error al publicar un proyecto",
                    "Problema con un profesional",
                    "Verificación de cédula",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-xs text-[#374151]">
                      <span className="text-[#009FD9] mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
