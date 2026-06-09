"use client";

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import {
  Camera, Star, MapPin, ArrowRight,
  CheckCircle2, UserCheck, Clock, Image as ImageIcon,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/* ─── Tip data ─── */
type Tip = {
  icon: React.ReactNode;
  title: string;
  body: string;
  highlight?: string;
};

const TIPS: Tip[] = [
  {
    icon: <Camera className="h-6 w-6 text-[#009FD9]" />,
    title: "Usa una foto de perfil profesional",
    body: "Los clientes deciden en segundos si confiar en ti. Una foto clara, bien iluminada y donde se vea tu cara genera hasta 3 veces más contactos que un perfil sin foto o con foto de poca calidad.",
    highlight: "Nada de fotos borrosas, con lentes oscuros, o de fiestas.",
  },
  {
    icon: <UserCheck className="h-6 w-6 text-[#009FD9]" />,
    title: "Verifica tu cédula",
    body: "El sello 'Verificado' es el principal factor de confianza en ContrataCR. Los clientes costarricenses priorizan a los profesionales verificados — especialmente para trabajos en el hogar o con niños. Es gratis y toma menos de 24 horas.",
    highlight: "Pros verificados reciben significativamente más consultas.",
  },
  {
    icon: <ImageIcon className="h-6 w-6 text-[#009FD9]" />,
    title: "Publica fotos de trabajos anteriores",
    body: "Las fotos de trabajos reales son tu portafolio. Antes de contratar, los clientes van a querer ver ejemplos de tu trabajo. Una cocina remozada, un jardín bien mantenido, un diseño que hiciste — cualquier foto real de tu trabajo vale mucho.",
    highlight: "Mínimo 3 fotos de trabajos anteriores para empezar.",
  },
  {
    icon: <WhatsAppIcon className="h-6 w-6 text-[#009FD9]" />,
    title: "Responde rápido por WhatsApp",
    body: "Costa Rica tiene una cultura de respuesta inmediata por WhatsApp. Si un cliente te escribe y tardas más de 2 horas en responder, es muy probable que ya contactó a otro profesional. Activa notificaciones y responde de inmediato.",
    highlight: "La rapidez de respuesta es tu mayor diferenciador.",
  },
  {
    icon: <Star className="h-6 w-6 text-[#009FD9]" />,
    title: "Pide reseñas después de cada trabajo",
    body: "Las reseñas son oro. Después de completar un trabajo, pídele al cliente que te deje una reseña en ContrataCR. Una frase corta como '¿Me podrías dejar una reseña en la plataforma? Me ayuda mucho a conseguir más clientes' es suficiente. La mayoría lo hace con gusto.",
  },
  {
    icon: <MapPin className="h-6 w-6 text-[#009FD9]" />,
    title: "Sé específico sobre dónde trabajas",
    body: "Los clientes filtran por cantón. Si trabajas en Escazú, Belén y Santa Ana, menciónalo en tu bio. Si viajas a toda la Gran Área Metropolitana, dilo. Entre más claro seas sobre tu cobertura, más apareces en búsquedas relevantes.",
  },
  {
    icon: <CheckCircle2 className="h-6 w-6 text-[#009FD9]" />,
    title: "Escribe una bio honesta y específica",
    body: "Evita frases genéricas como 'soy el mejor de Costa Rica' o 'trabajo con calidad'. En cambio, describe exactamente qué haces, cuántos años de experiencia tienes, y qué tipos de trabajos son tu especialidad. La especificidad genera confianza.",
    highlight: "Ejemplo: '12 años como electricista. Especialidad en instalaciones residenciales y certificación del ICE.'",
  },
  {
    icon: <Clock className="h-6 w-6 text-[#009FD9]" />,
    title: "Actualiza tu disponibilidad",
    body: "Si estás ocupado por dos semanas, márcalo en tu calendario. Los clientes que ven que estás disponible para la fecha que necesitan tienen mucho más chance de contactarte. Un perfil con disponibilidad actualizada transmite profesionalismo.",
  },
];

/* ─── Do / Don't data ─── */
const DOS_AND_DONTS = {
  dos: [
    "Responder en menos de 1 hora cuando es posible",
    "Dar un precio aproximado en el primer mensaje",
    "Confirmar la cita con anticipación",
    "Llegar puntual o avisar si hay demora",
    "Dejar el espacio de trabajo limpio",
    "Pedir feedback al terminar",
  ],
  donts: [
    "Ignorar mensajes y responder días después",
    "Dar precios muy distintos al presupuesto inicial",
    "Cancelar a última hora sin una razón seria",
    "Cobrar por trabajo incompleto",
    "Dejar materiales tirados o desorden",
    "Pedir pago completo antes de empezar",
  ],
};

export default function AtraerClientesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-14 text-center px-4 bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
        <FadeInUp>
          <span className="relative inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Consejos para profesionales
          </span>
          <h1 className="relative text-4xl sm:text-5xl font-extrabold text-[#111827] mb-4 leading-tight">
            Cómo atraer más clientes<br className="hidden sm:block" /> en ContrataCR
          </h1>
          <p className="relative text-lg text-[#6b7280] max-w-xl mx-auto">
            Consejos prácticos y honestos para crecer en el mercado costarricense.
          </p>
        </FadeInUp>
      </section>

      {/* Tips */}
      <section className="pb-20 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-10">
              {TIPS.map((tip, i) => (
                <FadeInUp key={tip.title} delay={i * 40}>
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-sm transition-shadow h-full">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-[#EBF5FB] flex items-center justify-center shrink-0">
                        {tip.icon}
                      </div>
                      <h3 className="text-sm font-bold text-[#1a2744] leading-snug">{tip.title}</h3>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed mb-2">{tip.body}</p>
                    {tip.highlight && (
                      <p className="text-xs text-[#009FD9] font-medium bg-[#EBF5FB] rounded-lg px-3 py-2 mt-2">
                        {tip.highlight}
                      </p>
                    )}
                  </div>
                </FadeInUp>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Do / Don't */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="text-2xl font-extrabold text-[#1a2744] mb-2 text-center">Qué hacen los mejores profesionales</h2>
            <p className="text-gray-500 text-center text-sm mb-10">La diferencia entre un profesional con muchos clientes y uno sin clientes suele ser esto:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-emerald-700 mb-4 uppercase tracking-wide">Buenas prácticas</h3>
                <ul className="space-y-3">
                  {DOS_AND_DONTS.dos.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-red-600 mb-4 uppercase tracking-wide">Lo que espanta clientes</h3>
                <ul className="space-y-3">
                  {DOS_AND_DONTS.donts.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-red-400 shrink-0 mt-0.5 font-bold">✕</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CR market reality */}
      <section className="py-16 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="bg-white rounded-3xl border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-[#1a2744] mb-4">El mercado costarricense — cómo funciona en la práctica</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600 leading-relaxed">
                <div>
                  <p className="font-semibold text-[#1a2744] mb-2">WhatsApp es el canal principal</p>
                  <p>El 95% de la coordinación de servicios en Costa Rica se hace por WhatsApp. No importa si estás en San José o Liberia — la gente espera poder escribirte por ahí y recibir respuesta rápida. Tener tu número de WhatsApp actualizado y activo es fundamental.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#1a2744] mb-2">La confianza se construye con identidad</p>
                  <p>Los costarricenses son cautelosos con quién entra a su casa o maneja sus proyectos. La verificación de cédula, las fotos reales del trabajo y las reseñas de personas conocidas en la comunidad local marcan una diferencia enorme versus un perfil anónimo.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#1a2744] mb-2">El cantón importa</p>
                  <p>Los clientes generalmente buscan "plomero en Desamparados" o "niñera en Heredia", no simplemente "plomero" o "niñera". Ser específico sobre los cantones donde trabajas te posiciona mejor en esas búsquedas locales.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#1a2744] mb-2">El precio razonable gana ante el precio bajo</p>
                  <p>Los clientes costarricenses no siempre van al más barato — van al que transmite más confianza. Un precio un poco más alto con buenas fotos, reseñas y perfil completo gana casi siempre sobre el perfil barato sin información.</p>
                </div>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#1a2744] text-center">
        <FadeInUp>
          <h2 className="text-2xl font-extrabold text-white mb-3">
            ¿Listo para recibir más clientes?
          </h2>
          <p className="text-[#93c5fd] mb-8 max-w-md mx-auto text-sm">
            Completa tu perfil, verifica tu cédula, y empieza a aparecer en búsquedas hoy.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <SmartRegisterLink className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-7 py-3.5 rounded-2xl transition-all">
              Registra tu perfil gratis <ArrowRight className="h-4 w-4" />
            </SmartRegisterLink>
            <Link
              href="/para-profesionales"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-7 py-3.5 rounded-2xl transition-all border border-white/20"
            >
              Por qué ContrataCR
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}
