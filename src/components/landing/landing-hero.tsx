"use client";

import { useState, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";

const PROVINCES = [
  "San José", "Alajuela", "Cartago", "Heredia",
  "Guanacaste", "Puntarenas", "Limón",
];

/* Rotating service lines — complete first-line phrases like Thumbtack */
const ROTATING_LINES = [
  "Limpieza del hogar,",
  "Electricidad,",
  "Plomería,",
  "Pintura interior,",
  "Jardinería,",
  "Carpintería,",
];

const POPULAR_TAGS = [
  "Plomería", "Electricidad", "Limpieza", "Pintura", "Jardinería", "Mudanzas",
];

function RotatingLine() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "visible" | "out">("visible");

  useEffect(() => {
    const id = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setIndex((i) => (i + 1) % ROTATING_LINES.length);
        setPhase("in");
        setTimeout(() => setPhase("visible"), 20);
      }, 300);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const style: React.CSSProperties = {
    display: "block",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    opacity: phase === "visible" || phase === "in" ? 1 : 0,
    transform:
      phase === "out"
        ? "translateY(-22px)"
        : phase === "in"
        ? "translateY(18px)"
        : "translateY(0)",
  };

  return (
    <span className="block" style={{ minHeight: "1.1em" }}>
      <span style={style}>{ROTATING_LINES[index]}</span>
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
    <section className="relative bg-white overflow-hidden">
      {/* Content area */}
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center pt-28 pb-10">

        {/* Logo mark — small centered icon like Thumbtack */}
        <div className="flex justify-center mb-5">
          <svg width="50" height="50" viewBox="0 0 32 32" fill="none" aria-hidden>
            <circle cx="16" cy="16" r="16" fill="#2563EB" />
            <path d="M16 7.5C12.41 7.5 9.5 10.41 9.5 14c0 5.81 6.5 10.5 6.5 10.5s6.5-4.69 6.5-10.5c0-3.59-2.91-6.5-6.5-6.5z" fill="white" />
            <circle cx="16" cy="13.5" r="2.6" fill="#2563EB" />
          </svg>
        </div>

        {/* Headline — rotating line 1 + static line 2, exactly like Thumbtack */}
        <h1
          className="font-extrabold text-[#1a2744] tracking-tight mb-4"
          style={{ fontSize: "clamp(2.4rem, 5.5vw, 3.6rem)", lineHeight: 1.1 }}
        >
          <RotatingLine />
          <span className="block">sin complicaciones.</span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-lg mx-auto mb-8 leading-relaxed">
          Describí tu proyecto y te conectamos con el profesional perfecto.
        </p>

        {/* Search bar — pill-shaped, wide, prominent like Thumbtack */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row items-stretch max-w-2xl mx-auto bg-white border border-gray-200 rounded-full shadow-[0_4px_40px_rgba(0,0,0,0.10)] hover:shadow-[0_6px_48px_rgba(37,99,235,0.14)] transition-shadow duration-300 overflow-hidden pl-5 pr-2 py-2 gap-0"
        >
          {/* Service input */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Search className="h-4 w-4 text-gray-300 shrink-0" />
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="Describí tu proyecto o problema — sé tan detallado como quieras!"
              className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
            />
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-gray-200 my-1 mx-3" />

          {/* Province select */}
          <div className="hidden sm:flex items-center gap-2 min-w-[130px]">
            <MapPin className="h-4 w-4 text-gray-300 shrink-0" />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="flex-1 text-sm text-gray-500 bg-transparent focus:outline-none appearance-none cursor-pointer"
            >
              <option value="">Ubicación</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="ml-2 px-7 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-bold rounded-full transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_16px_rgba(37,99,235,0.40)] whitespace-nowrap shrink-0"
          >
            Buscar
          </button>
        </form>

        {/* Popular tags */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-5">
          <span className="text-sm text-gray-400 self-center">Popular:</span>
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setService(tag)}
              className="text-sm text-gray-500 hover:text-[#2563EB] transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Arch / dome image — circular crop like Thumbtack */}
      <div className="flex justify-center px-4 pb-0">
        <div
          className="relative overflow-hidden w-full"
          style={{
            maxWidth: 800,
            height: 420,
            borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
          }}
        >
          <Image
            src="https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1400&q=85"
            alt="Casa residencial en Costa Rica"
            fill
            className="object-cover object-center"
            priority
            sizes="(min-width:860px) 800px, 100vw"
          />
        </div>
      </div>
    </section>
  );
}
