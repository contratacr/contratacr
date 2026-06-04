"use client";

import { useEffect, useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, MessageSquare, Mail, AlertCircle } from "lucide-react";

const SUBJECTS = [
  "Problema técnico en la plataforma",
  "Tengo una pregunta sobre mi cuenta",
  "Quiero reportar a un usuario",
  "Problemas con el registro profesional",
  "Problemas con una reservación o proyecto",
  "Consulta sobre pagos o facturación",
  "Otro",
];

export default function SoportePage() {
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from logged-in user
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.email || !form.subject || !form.message) {
      setError("Por favor completá todos los campos requeridos.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al enviar");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado. Intentá de nuevo.");
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
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Mensaje recibido!</h1>
            <p className="text-[#6b7280] mb-6">
              Nuestro equipo de soporte te responderá a <strong>{form.email}</strong> en menos de 24 horas.
            </p>
            <p className="text-sm text-[#9ca3af]">
              También podés escribirnos directamente a{" "}
              <a href="mailto:soportecontratacr@hotmail.com" className="text-[#009FD9] hover:underline">
                soportecontratacr@hotmail.com
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

          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EBF5FB] mx-auto mb-4">
              <MessageSquare className="h-7 w-7 text-[#009FD9]" />
            </div>
            <h1 className="text-3xl font-bold text-[#111827] mb-2">Centro de soporte</h1>
            <p className="text-[#6b7280]">
              Estamos aquí para ayudarte. Respondemos en menos de 24 horas.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Contact form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-3xl border border-[#e5e7eb] shadow-sm p-8">
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">
                        Nombre <span className="text-[#9ca3af] font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="Tu nombre"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">
                        Correo electrónico <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        className={inputClass}
                        placeholder="tucorreo@ejemplo.com"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      Asunto <span className="text-red-500">*</span>
                    </label>
                    <select
                      className={inputClass + " cursor-pointer"}
                      value={form.subject}
                      onChange={(e) => update("subject", e.target.value)}
                      required
                    >
                      <option value="">Seleccioná el motivo de tu consulta</option>
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      Mensaje <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[140px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder="Describí tu consulta con el mayor detalle posible. Si es un problema técnico, mencioná qué pasó y en qué pantalla estás."
                      value={form.message}
                      onChange={(e) => update("message", e.target.value)}
                      required
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-12 w-full rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting && (
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    )}
                    {submitting ? "Enviando…" : "Enviar mensaje"}
                  </button>
                </form>
              </div>
            </div>

            {/* Sidebar info */}
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="h-5 w-5 text-[#009FD9]" />
                  <p className="text-sm font-semibold text-[#111827]">Email directo</p>
                </div>
                <a
                  href="mailto:soportecontratacr@hotmail.com"
                  className="text-sm text-[#009FD9] hover:underline break-all"
                >
                  soportecontratacr@hotmail.com
                </a>
                <p className="text-xs text-[#9ca3af] mt-2">Respondemos en menos de 24 horas hábiles.</p>
              </div>

              <div className="bg-[#EBF5FB] rounded-2xl p-5">
                <p className="text-sm font-semibold text-[#1a2744] mb-2">¿Cómo podemos ayudarte?</p>
                <ul className="space-y-1.5">
                  {[
                    "Problemas para iniciar sesión",
                    "Tu perfil no aparece en búsquedas",
                    "Error al publicar un proyecto",
                    "Problema con un profesional",
                    "Solicitar verificación de cédula",
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
