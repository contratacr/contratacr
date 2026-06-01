"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, MessageCircle, Star } from "lucide-react";

const SCREEN_STATES = [
  {
    id: "browse",
    title: "Explorá categorías",
    content: (
      <div className="p-4 h-full flex flex-col">
        <div className="mb-4">
          <div className="bg-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs text-gray-400">¿Qué necesitás?</span>
          </div>
        </div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Categorías populares</p>
        {["🔧 Plomería", "⚡ Electricidad", "🏠 Limpieza", "🎨 Pintura"].map((item) => (
          <div key={item} className="flex items-center justify-between py-2.5 border-b border-gray-50">
            <span className="text-xs text-gray-700 font-medium">{item}</span>
            <svg className="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "profile",
    title: "Perfil verificado",
    content: (
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-blue-600">CR</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-800">Carlos Ramírez</p>
            <p className="text-[10px] text-gray-400">Electricista · San José</p>
            <div className="flex items-center gap-1 mt-0.5">
              {[1,2,3,4,5].map(s => <Star key={s} className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />)}
              <span className="text-[10px] text-gray-400 ml-1">4.9</span>
            </div>
          </div>
        </div>
        <div className="space-y-2 mb-4">
          {["Cédula verificada ✓", "12 años de experiencia", "Disponible hoy"].map((t) => (
            <div key={t} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
              <span className="text-[11px] text-gray-600">{t}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto bg-[#EBF5FB] rounded-xl p-3">
          <p className="text-[10px] text-[#1a2744] font-medium leading-relaxed">
            "Excelente trabajo, muy puntual y profesional. 100% recomendado."
          </p>
          <p className="text-[9px] text-gray-400 mt-1">— María V., hace 2 días</p>
        </div>
      </div>
    ),
  },
  {
    id: "whatsapp",
    title: "Contacto directo",
    content: (
      <div className="p-4 h-full flex flex-col items-center justify-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
          <span className="text-2xl font-bold text-blue-600">CR</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-800">Carlos Ramírez</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Electricista verificado</p>
        </div>
        <div className="w-full space-y-2.5">
          <button className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold text-sm py-3 rounded-2xl shadow-[0_4px_16px_rgba(37,211,102,0.35)] active:scale-95 transition-transform">
            <MessageCircle className="h-4 w-4" />
            Contactar por WhatsApp
          </button>
          <button className="w-full text-center text-xs text-gray-400 py-2">
            Ver perfil completo →
          </button>
        </div>
        <p className="text-[10px] text-center text-gray-300 leading-relaxed">
          Sin intermediarios · Contacto directo · Gratis
        </p>
      </div>
    ),
  },
];

function PhoneFrame({ screenIndex }: { screenIndex: number }) {
  const [visible, setVisible] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(screenIndex);

  useEffect(() => {
    if (screenIndex === currentIdx) return;
    setVisible(false);
    const t = setTimeout(() => {
      setCurrentIdx(screenIndex);
      setVisible(true);
    }, 250);
    return () => clearTimeout(t);
  }, [screenIndex, currentIdx]);

  const screen = SCREEN_STATES[currentIdx];

  return (
    <div
      className="animate-float-phone"
      style={{ willChange: "transform" }}
    >
      {/* Phone shell */}
      <div
        className="relative mx-auto"
        style={{
          width: 260,
          height: 520,
          background: "#1a2744",
          borderRadius: 40,
          padding: 10,
          boxShadow: "0 32px 80px rgba(26,39,68,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      >
        {/* Dynamic island */}
        <div
          className="absolute z-20"
          style={{
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 80,
            height: 24,
            background: "#0d1626",
            borderRadius: 12,
          }}
        />

        {/* Screen */}
        <div
          className="relative bg-white overflow-hidden"
          style={{
            borderRadius: 32,
            height: "100%",
          }}
        >
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-12 pb-2">
            <span className="text-[10px] font-semibold text-gray-800">9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 border border-gray-800 rounded-sm">
                <div className="w-3 h-1 bg-gray-800 rounded-sm m-px" />
              </div>
            </div>
          </div>

          {/* Screen content */}
          <div
            style={{
              transition: "opacity 0.25s ease, transform 0.25s ease",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(12px)",
              height: "calc(100% - 60px)",
              overflow: "hidden",
            }}
          >
            {screen.content}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhoneMockupSection() {
  const [screenIndex, setScreenIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setScreenIndex((i) => (i + 1) % SCREEN_STATES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const BULLETS = [
    {
      icon: "🔍",
      title: "Buscá por categoría y cantón",
      desc: "Encontrá el profesional correcto según tu ubicación exacta.",
    },
    {
      icon: "✅",
      title: "Revisá perfiles verificados con cédula",
      desc: "Todos nuestros profesionales pasan por verificación de identidad.",
    },
    {
      icon: "💬",
      title: "Contactá directo por WhatsApp",
      desc: "Sin intermediarios, sin comisiones. Coordinás directo con el profesional.",
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-[#EBF5FB] overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left */}
          <div>
            <p className="text-[#2563EB] text-sm font-bold uppercase tracking-widest mb-3">
              ¿Cómo funciona?
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight mb-6">
              La forma más fácil de contratar un profesional.
            </h2>
            <div className="space-y-6">
              {BULLETS.map((b, i) => (
                <div key={i} className="flex gap-4">
                  <div
                    className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: "rgba(37,99,235,0.1)" }}
                  >
                    {b.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1a2744] mb-1">{b.title}</p>
                    <p className="text-sm text-gray-400 leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Screen step indicator */}
            <div className="flex items-center gap-2 mt-8">
              {SCREEN_STATES.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setScreenIndex(i)}
                  className="transition-all duration-300"
                  style={{
                    width: i === screenIndex ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: i === screenIndex ? "#2563EB" : "#CBD5E1",
                  }}
                  aria-label={s.title}
                />
              ))}
              <span className="ml-2 text-xs text-gray-400">
                {SCREEN_STATES[screenIndex].title}
              </span>
            </div>
          </div>

          {/* Right — Phone */}
          <div className="flex justify-center lg:justify-end">
            <PhoneFrame screenIndex={screenIndex} />
          </div>
        </div>
      </div>
    </section>
  );
}
