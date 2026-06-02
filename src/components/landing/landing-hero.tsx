"use client";

import { useState } from "react";
import { Search, MapPin } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";

const PROVINCES = [
  "San José", "Alajuela", "Cartago", "Heredia",
  "Guanacaste", "Puntarenas", "Limón",
];

const POPULAR_TAGS = [
  "Plomería", "Electricidad", "Limpieza", "Pintura",
  "Jardinería", "Carpintería", "Tecnología", "Mudanzas",
];

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
      {/* Top content */}
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center pt-28 pb-10">

        {/* Circle logo badge */}
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)" }}
          >
            <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
              <path d="M11 1L21 11L11 21L1 11L11 1Z" fill="white" />
              <path d="M7.5 11L10 13.5L14.5 8.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-[3.6rem] font-extrabold text-[#1a2744] leading-[1.08] tracking-tight mb-4">
          Mejoras del hogar,<br />sin complicaciones.
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-lg mx-auto mb-8 leading-relaxed">
          Describí tu proyecto y conectamos con el profesional perfecto.
        </p>

        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row items-stretch gap-0 bg-white border border-gray-200 rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.10)] hover:shadow-[0_8px_48px_rgba(37,99,235,0.13)] transition-shadow duration-300 max-w-2xl mx-auto overflow-hidden"
        >
          {/* Service input */}
          <div className="flex items-center gap-2 flex-1 px-5 py-4 min-w-0">
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
          <div className="hidden sm:block w-px bg-gray-100 my-3" />

          {/* Province select */}
          <div className="flex items-center gap-2 px-4 py-3 sm:min-w-[160px]">
            <MapPin className="h-4 w-4 text-gray-300 shrink-0" />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="flex-1 text-sm text-gray-500 bg-transparent focus:outline-none appearance-none cursor-pointer"
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
            className="m-2 px-8 py-3.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-bold rounded-xl transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(37,99,235,0.4)] whitespace-nowrap"
          >
            Buscar
          </button>
        </form>

        {/* Popular tags */}
        <div className="flex flex-wrap justify-center gap-2 mt-5">
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

        {/* Trust stats */}
        <p className="animate-trust-pop text-sm text-gray-400 mt-5">
          Confiado por <strong className="text-[#1a2744]">+1,000 profesionales</strong>
          {" "}·{" "}
          <span className="inline-flex items-center gap-1">
            <svg className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            4.9
          </span>
          {" "}·{" "}
          Verificados con cédula
        </p>
      </div>

      {/* Arch / dome image */}
      <div className="flex justify-center px-4">
        <div
          className="relative overflow-hidden w-full"
          style={{
            maxWidth: 760,
            height: 380,
            borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
          }}
        >
          <Image
            src="https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1400&q=80"
            alt="Casa residencial en Costa Rica"
            fill
            className="object-cover object-center"
            priority
            sizes="(min-width:800px) 760px, 100vw"
          />
          {/* Subtle vignette so image blends to white */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%)",
            }}
          />
        </div>
      </div>
    </section>
  );
}
