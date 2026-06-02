"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

interface TabCard {
  label: string;
  href: string;
  src: string;
}

interface TabData {
  id: string;
  title: string;
  description: string;
  featured: TabCard;
  small: TabCard[];
}

const TABS: TabData[] = [
  {
    id: "hogar",
    title: "Mantenimiento del hogar",
    description: "Mantené tu hogar en perfectas condiciones.",
    featured: {
      label: "Limpieza del hogar",
      href: "/buscar?categoria=limpieza",
      src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
    },
    small: [
      {
        label: "Pintura interior",
        href: "/buscar?categoria=pintura",
        src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Plomería",
        href: "/buscar?categoria=plomeria",
        src: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Electricidad",
        href: "/buscar?categoria=electricidad",
        src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
  {
    id: "remodelacion",
    title: "Remodelación",
    description: "Remodelá tu espacio con los mejores profesionales.",
    featured: {
      label: "Remodelación de cocinas",
      href: "/buscar?categoria=remodelacion",
      src: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
    },
    small: [
      {
        label: "Carpintería a medida",
        href: "/buscar?categoria=carpinteria",
        src: "https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Pisos y revestimientos",
        href: "/buscar?categoria=pisos",
        src: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Instalación de baños",
        href: "/buscar?categoria=plomeria",
        src: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
  {
    id: "exterior",
    title: "Exterior y jardín",
    description: "Tu espacio exterior al mejor nivel.",
    featured: {
      label: "Jardinería y paisajismo",
      href: "/buscar?categoria=jardineria",
      src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
    },
    small: [
      {
        label: "Construcción",
        href: "/buscar?categoria=construccion",
        src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Lavado a presión",
        href: "/buscar?categoria=lavado",
        src: "https://images.unsplash.com/photo-1558618047-3c8c76f1d8e9?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Mudanzas",
        href: "/buscar?categoria=mudanzas",
        src: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
  {
    id: "esencial",
    title: "Servicios esenciales",
    description: "Los servicios que todo hogar necesita.",
    featured: {
      label: "Soporte técnico y tecnología",
      href: "/buscar?categoria=tecnologia",
      src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
    },
    small: [
      {
        label: "Seguridad y CCTV",
        href: "/buscar?categoria=seguridad",
        src: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Belleza y estética",
        href: "/buscar?categoria=belleza",
        src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Mecánica automotriz",
        href: "/buscar?categoria=mecanica",
        src: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
];

function PhotoCard({ card, size }: { card: TabCard; size: "featured" | "small" }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={card.href}
      className="block relative rounded-2xl overflow-hidden group"
      style={{ height: size === "featured" ? 340 : 152 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Image
        src={card.src}
        alt={card.label}
        fill
        className="object-cover img-zoom"
        style={{
          transform: hovered ? "scale(1.07)" : "scale(1)",
          transition: "transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
        sizes={size === "featured" ? "(min-width:1024px) 50vw, 100vw" : "240px"}
      />
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          background: hovered
            ? "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.08) 55%, transparent 100%)"
            : "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)",
        }}
      />
      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
        <span className="text-white font-bold text-sm drop-shadow leading-tight">{card.label}</span>
        <span
          className="flex items-center gap-0.5 text-white/80 text-xs font-semibold transition-all duration-200"
          style={{ opacity: hovered ? 1 : 0, transform: hovered ? "translateX(0)" : "translateX(6px)" }}
        >
          Ver <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export function ExploreTabs() {
  const [activeTab, setActiveTab] = useState("hogar");
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] mb-2">
            Explorá más proyectos.
          </h2>
          <p className="text-gray-400 text-base">
            Profesionales en cada categoría, en tu cantón.
          </p>
        </div>

        {/* Underline tabs */}
        <div className="flex justify-center mb-8 border-b border-gray-200 overflow-x-auto hide-scrollbar">
          {TABS.map((t) => {
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="relative px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0"
                style={{
                  color: active ? "#1a2744" : "#9ca3af",
                }}
              >
                {t.title}
                {/* Underline indicator */}
                <span
                  className="absolute bottom-0 left-0 h-0.5 bg-[#1a2744] transition-all duration-300 rounded-t-full"
                  style={{ width: active ? "100%" : "0%", left: active ? "0%" : "50%" }}
                />
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div
          key={activeTab}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-tab-cards"
        >
          {/* Featured card */}
          <PhotoCard card={tab.featured} size="featured" />

          {/* 3 small cards stacked */}
          <div className="grid grid-rows-3 gap-4">
            {tab.small.map((card) => (
              <PhotoCard key={card.label} card={card} size="small" />
            ))}
          </div>
        </div>

        {/* See all link */}
        <div className="text-center mt-8">
          <Link
            href="/buscar"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#2563EB] hover:underline"
          >
            Ver todos los servicios <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
