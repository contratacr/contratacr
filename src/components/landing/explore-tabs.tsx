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
    title: "Hogar",
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
        src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Electricidad",
        href: "/buscar?categoria=electricidad",
        src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
  {
    id: "exterior",
    title: "Exterior",
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
    id: "tecnologia",
    title: "Tecnología",
    description: "Soporte técnico y soluciones digitales.",
    featured: {
      label: "Redes y soporte técnico",
      href: "/buscar?categoria=tecnologia",
      src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
    },
    small: [
      {
        label: "Seguridad CCTV",
        href: "/buscar?categoria=seguridad",
        src: "https://images.unsplash.com/photo-1557597774-9d475d4b1037?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Reparación de equipos",
        href: "/buscar?categoria=reparacion",
        src: "https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Diseño web",
        href: "/buscar?categoria=diseno-web",
        src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
  {
    id: "bienestar",
    title: "Bienestar",
    description: "Cuidá tu salud y bienestar personal.",
    featured: {
      label: "Belleza y estética",
      href: "/buscar?categoria=belleza",
      src: "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=80",
    },
    small: [
      {
        label: "Entrenamiento personal",
        href: "/buscar?categoria=fitness",
        src: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Masajes",
        href: "/buscar?categoria=masajes",
        src: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=480&q=80",
      },
      {
        label: "Nutrición",
        href: "/buscar?categoria=nutricion",
        src: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=480&q=80",
      },
    ],
  },
];

function PhotoCard({
  card,
  size,
}: {
  card: TabCard;
  size: "featured" | "small";
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={card.href}
      className="block relative rounded-2xl overflow-hidden"
      style={{
        height: size === "featured" ? 320 : 148,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Image
        src={card.src}
        alt={card.label}
        fill
        className="object-cover"
        style={{
          transition: "transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94)",
          transform: hovered ? "scale(1.07)" : "scale(1)",
        }}
        sizes={size === "featured" ? "(min-width:1024px) 50vw, 100vw" : "240px"}
      />
      <div
        className="absolute inset-0"
        style={{
          background: hovered
            ? "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)"
            : "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)",
          transition: "background 0.3s ease",
        }}
      />
      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
        <span className="text-white font-semibold text-sm drop-shadow">{card.label}</span>
        {hovered && (
          <span className="flex items-center gap-0.5 text-white/80 text-xs font-medium">
            Ver <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
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
            Explorá más servicios.
          </h2>
          <p className="text-gray-400 text-base">
            Profesionales en cada categoría, en tu cantón.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-1 mb-8 bg-gray-50 p-1.5 rounded-2xl max-w-md mx-auto border border-gray-100">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={{
                background: activeTab === t.id ? "white" : "transparent",
                color: activeTab === t.id ? "#1a2744" : "#9CA3AF",
                boxShadow: activeTab === t.id ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t.title}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div
          key={activeTab}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          style={{ animation: "fadeTabIn 0.3s ease both" }}
        >
          <style>{`
            @keyframes fadeTabIn {
              from { opacity: 0; transform: translateY(10px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

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
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] hover:underline"
          >
            Ver todos los servicios de {tab.title.toLowerCase()} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
