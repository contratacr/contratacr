"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { SUPPORT_WHATSAPP_URL } from "@/lib/constants";

type FormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function ContactForm() {
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
        <h3 className="text-2xl font-bold text-[#1a2744] mb-2">¡Mensaje enviado!</h3>
        <p className="text-gray-500">Creamos tu ticket de soporte. Te respondemos por correo y, si tienes cuenta, también en tu panel.</p>
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
                {/* WhatsApp */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0">
                      <svg className="h-6 w-6 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1a2744] mb-0.5">WhatsApp</h3>
                      <p className="text-xs text-gray-400 mb-3">Te escribimos en horario laboral</p>
                      <a
                        href={SUPPORT_WHATSAPP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#25D366] hover:underline"
                      >
                        Escríbenos por WhatsApp →
                      </a>
                    </div>
                  </div>
                </div>

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
