"use client";

import { useState, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

const PROVINCES = [
  "San José", "Alajuela", "Cartago", "Heredia",
  "Guanacaste", "Puntarenas", "Limón",
];

const ROTATING_LINES: Record<string, string[]> = {
  es: ["Limpieza del hogar,", "Electricidad,", "Plomería,", "Pintura interior,", "Jardinería,", "Carpintería,"],
  en: ["Home cleaning,", "Electrical work,", "Plumbing,", "Interior painting,", "Gardening,", "Carpentry,"],
};

const POPULAR_TAGS: Record<string, string[]> = {
  es: ["Plomería", "Electricidad", "Limpieza", "Pintura", "Jardinería", "Mudanzas"],
  en: ["Plumbing", "Electrical", "Cleaning", "Painting", "Gardening", "Moving"],
};

function RotatingLine({ lines }: { lines: string[] }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "visible" | "out">("visible");

  useEffect(() => {
    const id = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length);
        setPhase("in");
        setTimeout(() => setPhase("visible"), 20);
      }, 300);
    }, 2500);
    return () => clearInterval(id);
  }, [lines.length]);

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
    color: "#009FD9",
  };

  return (
    <span className="block" style={{ minHeight: "1.1em" }}>
      <span style={style}>{lines[index]}</span>
    </span>
  );
}

export function LandingHero() {
  const [service, setService] = useState("");
  const [province, setProvince] = useState("");
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("landing.hero");

  const lines = ROTATING_LINES[locale] ?? ROTATING_LINES.es;
  const tags = POPULAR_TAGS[locale] ?? POPULAR_TAGS.es;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (service) params.set("q", service);
    if (province) params.set("provincia", province);
    router.push(`/buscar?${params.toString()}`);
  }

  return (
    <section className="relative bg-white overflow-hidden">
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center pt-20 sm:pt-28 pb-8 sm:pb-10">

        {/* Headline */}
        <h1
          className="font-extrabold text-[#1a2744] tracking-tight mb-4"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.6rem)", lineHeight: 1.1 }}
        >
          <RotatingLine lines={lines} />
          <span className="block">{t("headline2")}</span>
        </h1>

        <p className="text-base sm:text-xl text-gray-400 max-w-lg mx-auto mb-6 sm:mb-8 leading-relaxed">
          {t("subtitle")}
        </p>

        {/* ── Search bar — prominent, 56px desktop / 48px mobile ── */}
        <form
          onSubmit={handleSearch}
          className="max-w-2xl mx-auto"
        >
          {/* Desktop row: single line h-14 */}
          <div
            className="hidden sm:flex items-center h-14 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-5 pr-2 shadow-[0_8px_48px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_60px_rgba(0,159,217,0.20)] transition-shadow duration-300"
          >
            {/* Text input */}
            <div className="flex items-center gap-3 flex-1 min-w-0 h-full">
              <Search className="h-5 w-5 text-gray-300 shrink-0" />
              <input
                type="text"
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
              />
            </div>
            {/* Divider + province */}
            <div className="w-px bg-gray-200 self-stretch my-3 mx-2 shrink-0" />
            <div className="flex items-center gap-2 min-w-[140px] shrink-0 h-full">
              <MapPin className="h-5 w-5 text-gray-300 shrink-0" />
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="flex-1 text-base text-gray-500 bg-transparent focus:outline-none appearance-none cursor-pointer"
              >
                <option value="">{t("location")}</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Buscar button */}
            <button
              type="submit"
              className="ml-2 h-10 px-8 bg-[#009FD9] hover:bg-[#0089bb] text-white text-base font-bold rounded-[4px] transition-all duration-150 active:scale-[0.97] shadow-sm whitespace-nowrap shrink-0"
            >
              {t("search")}
            </button>
          </div>

          {/* Mobile stacked layout */}
          <div className="sm:hidden flex flex-col gap-2">
            <div className="flex items-center h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-4 pr-3 shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
              <Search className="h-5 w-5 text-gray-300 shrink-0 mr-3" />
              <input
                type="text"
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
              />
            </div>
            <button
              type="submit"
              className="w-full h-12 bg-[#009FD9] hover:bg-[#0089bb] text-white text-base font-bold rounded-[6px] transition-all duration-150 active:scale-[0.97]"
            >
              {t("search")}
            </button>
          </div>
        </form>

        {/* Sentinel — IntersectionObserver in navbar watches this */}
        <div id="hero-search-sentinel" aria-hidden className="h-0" />

        {/* Popular tags */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-4">
          <span className="text-sm text-gray-400 self-center">{t("popular")}</span>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setService(tag)}
              className="text-sm text-gray-500 hover:text-[#009FD9] transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Arch / dome image — responsive height */}
      <div className="flex justify-center px-4 pb-0">
        <div
          className="relative overflow-hidden w-full h-[180px] sm:h-[280px] md:h-[360px] lg:h-[420px]"
          style={{ maxWidth: 800, borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
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
