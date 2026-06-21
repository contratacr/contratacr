"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface SmallCard { label: string; href: string; src: string; }

interface TabData {
  id: string;
  title: string;
  featured: {
    label: string;
    href: string;
    src: string;
    editorial: string; /* Big overlay quote, like Thumbtack */
  };
  small: SmallCard[];
}

const TABS: TabData[] = [
  {
    id: "hogar",
    title: "Mantenimiento del hogar",
    featured: {
      label: "Limpieza del hogar",
      href: "/buscar?categoria=limpieza",
      src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
      editorial: "Estas tareas solían comerte el fin de semana. Ya no más.",
    },
    small: [
      { label: "Pintura interior", href: "/buscar?categoria=pintura",      src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=480&q=80" },
      { label: "Plomería",         href: "/buscar?categoria=plomeria",     src: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=480&q=80" },
      { label: "Electricidad",     href: "/buscar?categoria=electricidad", src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=480&q=80" },
    ],
  },
  {
    id: "remodelacion",
    title: "Remodelación",
    featured: {
      label: "Remodelación de cocinas",
      href: "/buscar?categoria=remodelacion",
      src: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
      editorial: "Tu espacio soñado, más cerca de lo que crees.",
    },
    small: [
      { label: "Carpintería a medida", href: "/buscar?categoria=carpinteria", src: "https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?auto=format&fit=crop&w=480&q=80" },
      { label: "Pisos y revestimientos",href: "/buscar?categoria=pisos",      src: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=480&q=80" },
      { label: "Baños modernos",        href: "/buscar?categoria=plomeria",   src: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=480&q=80" },
    ],
  },
  {
    id: "exterior",
    title: "Exterior y jardín",
    featured: {
      label: "Jardinería y paisajismo",
      href: "/buscar?categoria=jardineria",
      src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
      editorial: "Un jardín impecable, sin ensuciarte las manos.",
    },
    small: [
      { label: "Construcción",  href: "/buscar?categoria=construccion", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=480&q=80" },
      { label: "Lavado a presión", href: "/buscar?categoria=lavado",   src: "https://images.unsplash.com/photo-1558618047-3c8c76f1d8e9?auto=format&fit=crop&w=480&q=80" },
      { label: "Mudanzas",     href: "/buscar?categoria=mudanzas",     src: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=480&q=80" },
    ],
  },
  {
    id: "esencial",
    title: "Servicios esenciales",
    featured: {
      label: "Soporte técnico y tecnología",
      href: "/buscar?categoria=tecnologia",
      src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
      editorial: "Los profesionales que tu hogar necesita, a un tap.",
    },
    small: [
      { label: "Seguridad y CCTV",  href: "/buscar?categoria=seguridad", src: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=480&q=80" },
      { label: "Belleza y estética", href: "/buscar?categoria=belleza",   src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=480&q=80" },
      { label: "Mecánica automotriz",href: "/buscar?categoria=mecanica",  src: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=480&q=80" },
    ],
  },
];

function SmallCard({ card }: { card: SmallCard }) {
  return (
    <Link
      href={card.href}
      className="group relative block rounded-2xl overflow-hidden card-lift"
      style={{ height: 180 }}
    >
      <Image
        src={card.src}
        alt={card.label}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-[1.07]"
        sizes="240px"
      />
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.68) 0%, transparent 60%)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
        <span className="text-white font-bold text-sm drop-shadow">{card.label}</span>
        <ArrowRight className="h-3.5 w-3.5 text-white/70 shrink-0 translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
      </div>
    </Link>
  );
}

export function ExploreTabs() {
  const [activeTab, setActiveTab] = useState("hogar");
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const t = useTranslations("landing.explore");

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden bg-white">
      {/* Thumbtack-style decorative arc — right side */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-[45%]"
        style={{ background: "#EBF5FB", borderRadius: "50% 0 0 50%", zIndex: 0 }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-2">
            {t("heading")}
          </h2>
          <p className="text-gray-400 text-base">
            {t("subtitle")}
          </p>
        </div>

        {/* Underline tabs */}
        <div className="flex justify-center mb-8 border-b border-gray-200 overflow-x-auto hide-scrollbar">
          {TABS.map((tab, i) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0"
                style={{ color: active ? "#1a2744" : "#9ca3af" }}
              >
                {t(`tab${i}` as "tab0" | "tab1" | "tab2" | "tab3")}
                <span
                  className="absolute bottom-0 left-0 h-0.5 bg-[#1a2744] transition-all duration-300 rounded-t-full"
                  style={{ width: active ? "100%" : "0%" }}
                />
              </button>
            );
          })}
        </div>

        {/* Grid — featured full width on top, 3 equal below */}
        <div key={activeTab} className="grid grid-cols-3 gap-3 animate-tab-cards">
          {/* Featured card — spans full width */}
          <Link
            href={tab.featured.href}
            className="col-span-3 group relative block rounded-2xl overflow-hidden card-lift"
            style={{ height: 380 }}
          >
            <Image
              src={tab.featured.src}
              alt={tab.featured.label}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              sizes="100vw"
            />
            {/* Strong dark gradient so text is always readable */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.20) 55%, transparent 100%)" }}
            />
            {/* Editorial copy — large, Thumbtack-style */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <p className="text-white font-extrabold text-xl leading-snug mb-2 drop-shadow-md">
                {tab.featured.editorial}
              </p>
              <span className="inline-flex items-center gap-1 text-white/80 text-sm font-semibold hover:text-white transition-colors">
                Ver todos los servicios de {tab.title.toLowerCase()}. <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* 3 small cards — equal width */}
          {tab.small.map((card) => (
            <SmallCard key={card.label} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
