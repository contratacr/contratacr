"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle, Star } from "lucide-react";
import { useTranslations } from "next-intl";

/* ─── Three phone screens ─── */
function SearchScreen() {
  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-3">
        <div className="bg-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-2">
          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <span className="text-xs text-gray-400">Necesito un plomero...</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg className="h-3 w-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span className="text-[10px] text-gray-400">San José</span>
        </div>
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Servicios populares</p>
      {[
        { color: "#009FD9", label: "Limpieza del hogar" },
        { color: "#22c55e", label: "Plomería y tuberías" },
        { color: "#f59e0b", label: "Pintura interior" },
        { color: "#10b981", label: "Jardinería y poda" },
        { color: "#6366f1", label: "Mudanzas" },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
          <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
          <span className="text-xs text-gray-600 font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ProfileScreen() {
  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
        <div className="w-13 h-13 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-blue-700">CR</span>
        </div>
          <div className="min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-xs font-bold text-gray-800">Carlos Ramírez</p>
            <span className="text-[9px] font-bold bg-[#009FD9]/10 text-[#009FD9] px-1.5 py-0.5 rounded-full">Verificado ✓</span>
          </div>
          <p className="text-[10px] text-gray-400">Plomero · San José</p>
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1,2,3,4,5].map((s) => <Star key={s} className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />)}
            <span className="text-[10px] text-gray-400 ml-1">4.9 · 48 reseñas</span>
          </div>
        </div>
      </div>
      <div className="space-y-2 mb-3">
        {["Cédula verificada ✓", "10 años de experiencia", "Disponible hoy", "Presupuesto gratis"].map((t) => (
          <div key={t} className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#009FD9] shrink-0" />
            <span className="text-[11px] text-gray-600">{t}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-2">
        <button className="w-full flex items-center justify-center gap-2 bg-[#162543] text-white font-bold text-xs py-2.5 rounded-xl shadow-sm">
          <MessageCircle className="h-3.5 w-3.5" /> Enviar mensaje
        </button>
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-[10px] text-gray-600 leading-relaxed italic">&ldquo;Excelente trabajo, muy puntual y profesional.&rdquo;</p>
          <p className="text-[9px] text-gray-400 mt-0.5">— María V.</p>
        </div>
      </div>
    </div>
  );
}

function ResultsScreen() {
  const pros = [
    { name: "Carlos R.", label: "Top Pro", rating: 4.9, reviews: 48, spec: "Plomero · San José" },
    { name: "Ana M.",    label: null,      rating: 4.8, reviews: 32, spec: "Plomera · Alajuela" },
    { name: "Luis G.",   label: null,      rating: 4.7, reviews: 21, spec: "Plomero · Heredia" },
  ];
  return (
    <div className="p-4 h-full flex flex-col">
      <p className="text-[10px] font-bold text-gray-800 mb-3">3 resultados cerca de ti</p>
      {pros.map((p) => (
        <div key={p.name} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-blue-700">{p.name[0]}{p.name.split(" ")[1]?.[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-800">{p.name}</span>
              {p.label && <span className="text-[9px] font-bold bg-[#009FD9]/10 text-[#009FD9] px-1.5 py-0.5 rounded-full">{p.label}</span>}
            </div>
            <p className="text-[10px] text-gray-400">{p.spec}</p>
            <div className="flex items-center gap-0.5 mt-0.5">
              <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
              <span className="text-[10px] text-gray-500">{p.rating} ({p.reviews})</span>
            </div>
          </div>
          <button className="shrink-0 p-1.5 bg-[#EBF5FB] rounded-lg">
            <MessageCircle className="h-3.5 w-3.5 text-[#009FD9]" />
          </button>
        </div>
      ))}
      <button className="mt-3 w-full text-center text-xs font-semibold text-[#009FD9] py-2 border border-[#009FD9]/20 rounded-xl bg-[#EBF5FB]">Ver todos →</button>
    </div>
  );
}

const SCREENS = [SearchScreen, ResultsScreen, ProfileScreen];

function PhoneMock({ screenIdx }: { screenIdx: number }) {
  const Screen = SCREENS[screenIdx];
  return (
    <div className="animate-float-phone mx-auto" style={{ width: 252, willChange: "transform" }}>
      <div
        className="relative"
        style={{
          background: "#0f172a",
          borderRadius: 40,
          padding: 10,
          boxShadow: "0 40px 90px rgba(15,23,42,0.30), 0 0 0 1px rgba(255,255,255,0.06) inset",
        }}
      >
        <div className="absolute z-20" style={{ top: 13, left: "50%", transform: "translateX(-50%)", width: 78, height: 22, background: "#000", borderRadius: 11 }} />
        <div className="bg-white overflow-hidden" style={{ borderRadius: 30, minHeight: 490 }}>
          <div className="flex items-center justify-between px-5 pt-10 pb-1">
            <span className="text-[10px] font-semibold text-gray-800">9:41</span>
            <div className="w-4 h-2 border border-gray-800 rounded-sm"><div className="w-3 h-1 bg-gray-800 rounded-sm m-px" /></div>
          </div>
          <div key={screenIdx} style={{ animation: "tab-cards-in 0.3s ease both" }}>
            <Screen />
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURE_SCREEN_IDX = [0, 1, 2];

export function PhoneMockupSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const t = useTranslations("landing.why");

  const features = [
    { title: t("feature0Title"), desc: t("feature0Desc") },
    { title: t("feature1Title"), desc: t("feature1Desc") },
    { title: t("feature2Title"), desc: t("feature2Desc") },
  ];

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden bg-[#EBF5FB]">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-[48%]"
        style={{ background: "rgba(255,255,255,0.55)", borderRadius: "50% 0 0 50%", zIndex: 0 }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-3">
            {t("heading")}
          </h2>
          <p className="text-gray-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-1">
            {features.map((feat, i) => {
              const active = i === activeIdx;
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className="w-full text-left p-6 rounded-2xl transition-all duration-300 border"
                  style={{
                    background: active ? "white" : "transparent",
                    borderColor: active ? "#e5e7eb" : "transparent",
                    boxShadow: active ? "0 4px 24px rgba(0,0,0,0.07)" : "none",
                  }}
                >
                  <p className="font-bold text-lg leading-snug transition-colors duration-200" style={{ color: active ? "#1a2744" : "#9ca3af" }}>
                    {feat.title}
                  </p>
                  {active && (
                    <p className="text-gray-500 text-sm mt-2.5 leading-relaxed">{feat.desc}</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex justify-center lg:justify-end">
            <PhoneMock screenIdx={FEATURE_SCREEN_IDX[activeIdx]} />
          </div>
        </div>
      </div>
    </section>
  );
}
