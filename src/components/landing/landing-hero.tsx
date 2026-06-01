"use client";

import { useState, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

const ROTATING_WORDS = [
  "plomero",
  "electricista",
  "pintor",
  "jardinero",
  "limpiador",
  "carpintero",
  "técnico",
];

const PROVINCES = [
  "San José",
  "Alajuela",
  "Cartago",
  "Heredia",
  "Guanacaste",
  "Puntarenas",
  "Limón",
];

const POPULAR_TAGS = [
  "Plomería",
  "Electricidad",
  "Limpieza",
  "Pintura",
  "Jardinería",
  "Carpintería",
  "Tecnología",
  "Mudanzas",
];

function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "visible" | "out">("visible");

  useEffect(() => {
    const id = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setIndex((i) => (i + 1) % ROTATING_WORDS.length);
        setPhase("in");
        setTimeout(() => setPhase("visible"), 20);
      }, 280);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const style: React.CSSProperties = {
    display: "inline-block",
    transition: "opacity 0.28s ease, transform 0.28s ease",
    opacity: phase === "visible" || phase === "in" ? 1 : 0,
    transform:
      phase === "out"
        ? "translateY(-18px)"
        : phase === "in"
        ? "translateY(14px)"
        : "translateY(0)",
  };

  return (
    <span className="relative inline-block min-w-[220px] sm:min-w-[300px] text-left">
      <span style={style} className="text-[#2563EB]">
        {ROTATING_WORDS[index]}
      </span>
    </span>
  );
}

export function LandingHero() {
  const [service, setService] = useState("");
  const [province, setProvince] = useState("");
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (service) params.set("q", service);
    if (province) params.set("provincia", province);
    router.push(`/buscar?${params.toString()}`);
  }

  return (
    <section className="relative bg-white pt-28 pb-20 sm:pt-36 sm:pb-28 overflow-hidden">
      {/* Subtle background decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, #EBF5FB 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#1a2744] leading-[1.12] tracking-tight mb-6">
          Tu{" "}
          <RotatingWord />
          <br className="hidden sm:block" />
          a un tap de distancia.
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
          Profesionales verificados en toda Costa Rica. Contactá directo, sin intermediarios.
        </p>

        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row items-stretch gap-2 bg-white border border-gray-200 rounded-2xl p-2 shadow-[0_4px_40px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_48px_rgba(37,99,235,0.12)] transition-shadow duration-300 max-w-2xl mx-auto"
        >
          {/* Service input */}
          <div className="flex items-center gap-2 flex-1 px-3 py-1 min-w-0">
            <Search className="h-4 w-4 text-gray-300 shrink-0" />
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="¿Qué servicio necesitás?"
              className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none min-w-0"
            />
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-gray-100 my-1" />

          {/* Province select */}
          <div className="flex items-center gap-2 px-3 py-1 sm:min-w-[180px]">
            <MapPin className="h-4 w-4 text-gray-300 shrink-0" />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="flex-1 text-sm text-gray-400 bg-transparent focus:outline-none appearance-none cursor-pointer"
            >
              <option value="">Provincia</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="sm:ml-1 px-7 py-3 bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(37,99,235,0.4)] whitespace-nowrap"
          >
            Buscar
          </button>
        </form>

        {/* Popular tags */}
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          <span className="text-xs text-gray-400 self-center mr-1">Popular:</span>
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setService(tag)}
              className="text-xs text-gray-500 hover:text-[#2563EB] bg-gray-50 hover:bg-[#EBF5FB] border border-gray-100 hover:border-[#2563EB]/20 px-3.5 py-1.5 rounded-full transition-all duration-150"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
