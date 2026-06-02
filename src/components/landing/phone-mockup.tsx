"use client";

import { useState } from "react";
import { CheckCircle2, Star, MessageCircle } from "lucide-react";

/* ─── Phone UI screens ─── */
function PhoneSearchScreen() {
  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-3">
        <div className="bg-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-1">
          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-xs text-gray-400">Necesito un plomero...</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <svg className="h-3 w-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="text-[10px] text-gray-400">San José</span>
        </div>
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Servicios populares</p>
      {[
        { icon: "🏠", label: "Limpieza del hogar" },
        { icon: "🔧", label: "Plomería y tuberías" },
        { icon: "🎨", label: "Pintura interior" },
        { icon: "🌿", label: "Jardinería y poda" },
        { icon: "📦", label: "Mudanzas" },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
          <span className="text-sm">{item.icon}</span>
          <span className="text-xs text-gray-600 font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function PhoneResultsScreen() {
  const pros = [
    { name: "Carlos R.", rating: 4.9, reviews: 48, specialty: "Plomero · San José", badge: "Top Pro" },
    { name: "Ana M.",    rating: 4.8, reviews: 32, specialty: "Plomera · Alajuela", badge: null },
    { name: "Luis G.",   rating: 4.7, reviews: 21, specialty: "Plomero · Heredia",  badge: null },
  ];
  return (
    <div className="p-4 h-full flex flex-col">
      <p className="text-[10px] font-bold text-gray-800 mb-3">3 resultados cerca de vos</p>
      {pros.map((p) => (
        <div key={p.name} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-blue-700">{p.name[0]}{p.name.split(" ")[1]?.[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-800">{p.name}</span>
              {p.badge && (
                <span className="text-[9px] font-bold bg-[#2563EB]/10 text-[#2563EB] px-1.5 py-0.5 rounded-full">{p.badge}</span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">{p.specialty}</p>
            <div className="flex items-center gap-0.5 mt-0.5">
              <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
              <span className="text-[10px] text-gray-500">{p.rating} ({p.reviews})</span>
            </div>
          </div>
          <button className="shrink-0 p-1.5 bg-[#25D366]/10 rounded-lg">
            <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" />
          </button>
        </div>
      ))}
      <button className="mt-3 w-full text-center text-xs font-semibold text-[#2563EB] py-2 border border-[#2563EB]/20 rounded-xl bg-[#EBF5FB]">
        Ver todos →
      </button>
    </div>
  );
}

function PhoneProfileScreen() {
  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
          <span className="text-base font-bold text-blue-700">CR</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800">Carlos Ramírez</p>
          <p className="text-[10px] text-gray-400">Plomero · San José</p>
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1,2,3,4,5].map((s) => <Star key={s} className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />)}
            <span className="text-[10px] text-gray-400 ml-1">4.9 · 48 reseñas</span>
          </div>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        {["Cédula verificada ✓", "10 años de experiencia", "Disponible hoy", "Presupuesto gratis"].map((t) => (
          <div key={t} className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
            <span className="text-[11px] text-gray-600">{t}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-2">
        <button className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold text-xs py-2.5 rounded-xl shadow-sm">
          <MessageCircle className="h-3.5 w-3.5" />
          Contactar por WhatsApp
        </button>
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-[10px] text-gray-600 leading-relaxed italic">"Excelente trabajo, muy puntual."</p>
          <p className="text-[9px] text-gray-400 mt-0.5">— María V.</p>
        </div>
      </div>
    </div>
  );
}

const SCREENS = [PhoneSearchScreen, PhoneResultsScreen, PhoneProfileScreen];

/* ─── Phone shell wrapper ─── */
function PhoneMock({ screenIdx }: { screenIdx: number }) {
  const Screen = SCREENS[screenIdx];
  return (
    <div
      className="animate-float-phone mx-auto"
      style={{ width: 240, willChange: "transform" }}
    >
      <div
        className="relative"
        style={{
          background: "#1a2744",
          borderRadius: 36,
          padding: 9,
          boxShadow: "0 32px 80px rgba(26,39,68,0.32), 0 0 0 1px rgba(255,255,255,0.07) inset",
        }}
      >
        {/* Dynamic island */}
        <div
          className="absolute z-20"
          style={{ top: 13, left: "50%", transform: "translateX(-50%)", width: 76, height: 22, background: "#0d1626", borderRadius: 11 }}
        />
        {/* Screen */}
        <div className="bg-white overflow-hidden" style={{ borderRadius: 28, minHeight: 480 }}>
          <div className="flex items-center justify-between px-4 pt-10 pb-1">
            <span className="text-[10px] font-semibold text-gray-800">9:41</span>
            <div className="w-4 h-2 border border-gray-800 rounded-sm"><div className="w-3 h-1 bg-gray-800 rounded-sm m-px" /></div>
          </div>
          <Screen />
        </div>
      </div>
    </div>
  );
}

/* ─── Accordion feature items ─── */
const FEATURES = [
  {
    id: "fast",
    screenIdx: 0,
    title: "Llegá a una contratación más rápido.",
    desc: "Describí tu proyecto con tus palabras y encontramos el profesional perfecto para el trabajo en tu zona.",
  },
  {
    id: "local",
    screenIdx: 1,
    title: "Solo ves profesionales locales y verificados.",
    desc: "Mostramos solo profesionales con cédula verificada que podés contratar en tu cantón.",
  },
  {
    id: "done",
    screenIdx: 2,
    title: "Un trabajo bien hecho—garantizado.",
    desc: "Si el trabajo no sale como acordado, te tenemos cubierto. Así de simple.",
  },
];

/* ─── Main export ─── */
export function PhoneMockupSection() {
  const [activeId, setActiveId] = useState("fast");
  const activeFeature = FEATURES.find((f) => f.id === activeId) ?? FEATURES[0];

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-3">
            Por qué los clientes aman ContrataCR.
          </h2>
          <p className="text-gray-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Cada día, miles de ticos confían en ContrataCR para encontrar el profesional que necesitan — y los respaldamos en cada proyecto.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left — accordion feature list */}
          <div className="space-y-1">
            {FEATURES.map((feat) => {
              const active = feat.id === activeId;
              return (
                <button
                  key={feat.id}
                  onClick={() => setActiveId(feat.id)}
                  className="w-full text-left p-6 rounded-2xl transition-all duration-300 border"
                  style={{
                    background: active ? "white" : "transparent",
                    borderColor: active ? "#e5e7eb" : "transparent",
                    boxShadow: active ? "0 4px 24px rgba(0,0,0,0.07)" : "none",
                  }}
                >
                  <p
                    className="font-bold text-lg leading-snug transition-colors duration-200"
                    style={{ color: active ? "#1a2744" : "#9ca3af" }}
                  >
                    {feat.title}
                  </p>
                  {active && (
                    <p className="text-gray-400 text-sm mt-2 leading-relaxed accordion-open">
                      {feat.desc}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right — phone mockup */}
          <div className="flex justify-center lg:justify-end">
            <div
              key={activeId}
              style={{ animation: "tab-cards-in 0.35s ease both" }}
            >
              <PhoneMock screenIdx={activeFeature.screenIdx} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
