"use client";

import Image from "next/image";
import { CheckCircle2, Star, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/* ─── Inline phone mockup (no client state needed) ─── */
function AppPhoneMock() {
  const items = [
    { icon: "🏠", label: "Limpieza del hogar",      price: "₡18,000 – ₡45,000 prom." },
    { icon: "🔧", label: "Plomería y tuberías",     price: "₡25,000 – ₡80,000 prom." },
    { icon: "⚡", label: "Electricidad residencial", price: "₡30,000 – ₡100,000 prom." },
    { icon: "🎨", label: "Pintura interior",        price: "₡20,000 – ₡60,000 prom." },
    { icon: "🌿", label: "Jardinería y poda",       price: "₡15,000 – ₡40,000 prom." },
  ];

  return (
    <div
      className="animate-phone-drift mx-auto lg:ml-auto lg:mr-0"
      style={{ width: 260, willChange: "transform" }}
    >
      <div
        className="relative"
        style={{
          background: "#ffffff",
          borderRadius: 40,
          padding: 10,
          boxShadow:
            "0 40px 100px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.12) inset",
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
            background: "#0d0d0d",
            borderRadius: 12,
          }}
        />

        {/* Screen */}
        <div
          className="bg-white overflow-hidden"
          style={{ borderRadius: 32, minHeight: 520 }}
        >
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-11 pb-2">
            <span className="text-[10px] font-semibold text-gray-800">9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 border border-gray-800 rounded-sm">
                <div className="w-3 h-1 bg-gray-800 rounded-sm m-px" />
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="px-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] text-gray-400">Mi hogar</p>
                <p className="text-xs font-bold text-gray-800">Escazú, San José →</p>
              </div>
              <div className="flex gap-1">
                <span className="text-[10px] font-semibold text-[#009FD9] border-b-2 border-[#009FD9] pb-0.5">Mis metas</span>
                <span className="text-[10px] text-gray-400 ml-3">Upkeep</span>
              </div>
            </div>

            <div className="bg-[#EBF5FB] rounded-xl p-2.5 mb-3">
              <p className="text-[10px] font-bold text-[#1a2744] mb-1.5">Profesionales cerca de vos</p>
              {items.slice(0, 3).map((item) => (
                <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-blue-100 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{item.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-700">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-[9px] text-gray-400 mr-1">4.9</span>
                    <button className="bg-[#25D366]/10 rounded-lg p-1">
                      <MessageCircle className="h-3 w-3 text-[#25D366]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* More services */}
            {items.slice(3).map((item) => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-[10px] text-gray-600">{item.label}</span>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-[#009FD9]/40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Apple / Google Play icons ─── */
function AppleIcon() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GooglePlayIcon() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76c.3.16.64.18.96.06l13.5-7.74-2.94-2.94-11.52 10.62zM.54 1.62C.2 1.98 0 2.54 0 3.24v17.52c0 .7.2 1.26.54 1.62L.66 22.5 12.42 10.74v-.3L.66 1.5l-.12.12zM20.52 9.12l-2.88-1.68-3.24 3.24 3.24 3.24 2.94-1.68c.84-.48.84-1.26-.06-1.8v-.02zM4.14.24L17.64 7.98l-2.94 2.94L3.18.24c.3-.12.66-.14.96 0z" />
    </svg>
  );
}

/* ─── Main export ─── */
export function AppSection() {
  const t = useTranslations("landing.app");

  return (
    <section className="relative overflow-hidden" style={{ minHeight: 520 }}>
      <Image
        src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80"
        alt="App ContrataCR"
        fill
        className="object-cover"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-[#1a2744]/78" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[#93C5FD] text-xs font-bold uppercase tracking-widest mb-4">
              {t("badge")}
            </p>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
              {t("heading")}
            </h2>
            <p className="text-white/60 text-base sm:text-lg mb-8 leading-relaxed max-w-sm">
              {t("subtitle")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              {[
                { store: "App Store",   Icon: AppleIcon },
                { store: "Google Play", Icon: GooglePlayIcon },
              ].map(({ store, Icon }) => (
                <button
                  key={store}
                  disabled
                  className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white/10 border border-white/20 text-white cursor-not-allowed opacity-70 backdrop-blur-sm"
                >
                  <Icon />
                  <div className="text-left">
                    <p className="text-[10px] text-white/60 leading-none">{t("badge")}</p>
                    <p className="text-sm font-semibold leading-tight">{store}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {([t("feature0"), t("feature1"), t("feature2")] as string[]).map((feat) => (
                <div key={feat} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-[#93C5FD] shrink-0" />
                  <span className="text-sm text-white/75">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <AppPhoneMock />
          </div>
        </div>
      </div>
    </section>
  );
}
