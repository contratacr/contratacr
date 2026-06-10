"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LifeBuoy } from "lucide-react";

type FormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function ContactForm() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  async function onSubmit(data: FormData) {
    setLoading(true);
    setServerError(null);
    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setSubmitted(true);
    } catch {
      setServerError("Hubo un error al enviar el mensaje. Por favor intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl mb-4">
          ✅
        </div>
        <h3 className="text-2xl font-bold text-[#1a2744] mb-2">¡Ticket creado!</h3>
        {user ? (
          <>
            <p className="text-gray-500 mb-5">Recibimos tu consulta. Te respondemos por correo y puedes seguir la conversación en tus tickets.</p>
            <Link href="/dashboard/cliente?tab=soporte" className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm">
              <LifeBuoy className="h-4 w-4" /> Ver mis tickets
            </Link>
          </>
        ) : (
          <p className="text-gray-500">Recibimos tu consulta y te responderemos por correo. <Link href="/login" className="text-[#009FD9] font-semibold hover:underline">Inicia sesión</Link> con ese correo para seguir tus tickets en la plataforma.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          {serverError}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-semibold text-[#1a2744] mb-1.5">
          Nombre <span className="text-red-400">*</span>
        </label>
        <input
          {...register("name", { required: "El nombre es obligatorio." })}
          type="text"
          placeholder="Tu nombre completo"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30 focus:border-[#009FD9] transition-all bg-gray-50/50 placeholder:text-gray-400"
        />
        {errors.name && (
          <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-semibold text-[#1a2744] mb-1.5">
          Correo electrónico <span className="text-red-400">*</span>
        </label>
        <input
          {...register("email", {
            required: "El correo es obligatorio.",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Ingresa un correo válido.",
            },
          })}
          type="email"
          placeholder="tucorreo@ejemplo.com"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30 focus:border-[#009FD9] transition-all bg-gray-50/50 placeholder:text-gray-400"
        />
        {errors.email && (
          <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-semibold text-[#1a2744] mb-1.5">
          Asunto <span className="text-red-400">*</span>
        </label>
        <select
          {...register("subject", { required: "Selecciona un asunto." })}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30 focus:border-[#009FD9] transition-all bg-gray-50/50 text-gray-700"
        >
          <option value="">Selecciona una opción</option>
          <option value="problema">Tengo un problema</option>
          <option value="profesional">Soy profesional y necesito ayuda</option>
          <option value="reporte">Quiero reportar un usuario</option>
          <option value="otro">Otro</option>
        </select>
        {errors.subject && (
          <p className="text-xs text-red-500 mt-1">{errors.subject.message}</p>
        )}
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-semibold text-[#1a2744] mb-1.5">
          Mensaje <span className="text-red-400">*</span>
        </label>
        <textarea
          {...register("message", {
            required: "El mensaje es obligatorio.",
            minLength: {
              value: 20,
              message: "El mensaje debe tener al menos 20 caracteres.",
            },
          })}
          rows={5}
          placeholder="Describe tu consulta con el mayor detalle posible..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30 focus:border-[#009FD9] transition-all bg-gray-50/50 placeholder:text-gray-400 resize-none"
        />
        {errors.message && (
          <p className="text-xs text-red-500 mt-1">{errors.message.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        )}
        Enviar mensaje
      </button>
    </form>
  );
}

export default function ContactoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-12 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Contacto
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            Hablemos.
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Estamos para ayudarte. Envía un ticket y te respondemos por correo y en tu panel.
          </p>
        </FadeInUp>
      </section>

      {/* Two-column layout */}
      <section className="pb-24 px-4" style={{ background: "#f4f7fa" }}>
        <div className="mx-auto max-w-5xl pt-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

            {/* Left: Form */}
            <FadeInUp>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                <h2 className="text-xl font-bold text-[#1a2744] mb-1">Envianos un mensaje</h2>
                <p className="text-sm text-gray-400 mb-6">
                  Completa el formulario y te respondemos pronto.
                </p>
                <ContactForm />
              </div>
            </FadeInUp>

            {/* Right: Contact info */}
            <FadeInUp delay={80}>
              <div className="flex flex-col gap-4">
                {/* Ticket */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#EBF5FB] flex items-center justify-center shrink-0">
                      <svg className="h-6 w-6 text-[#009FD9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1a2744] mb-0.5">Ticket de soporte</h3>
                      <p className="text-xs text-gray-400 mb-3">Lo gestionamos en el panel y te respondemos por correo</p>
                      <a
                        href="/soporte"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] hover:underline"
                      >
                        Abrir ticket →
                      </a>
                    </div>
                  </div>
                </div>

                {/* Hours */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <svg className="h-6 w-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1a2744] mb-0.5">Horario de atención</h3>
                      <p className="text-sm text-gray-500">Lunes a Viernes</p>
                      <p className="text-sm font-semibold text-[#1a2744]">8:00 AM – 6:00 PM</p>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#EBF5FB] flex items-center justify-center shrink-0">
                      <svg className="h-6 w-6 text-[#009FD9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1a2744] mb-0.5">Ubicación</h3>
                      <p className="text-sm text-gray-500">San José, Costa Rica</p>
                      <p className="text-xs text-gray-400 mt-0.5">🇨🇷 Empresa 100% costarricense</p>
                    </div>
                  </div>
                </div>
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
