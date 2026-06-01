"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

const CATEGORIES = [
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
  {
    label: "Construcción",
    href: "/buscar?categoria=construccion",
    src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Pintura",
    href: "/buscar?categoria=pintura",
    src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Jardinería",
    href: "/buscar?categoria=jardineria",
    src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Limpieza",
    href: "/buscar?categoria=limpieza",
    src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Carpintería",
    href: "/buscar?categoria=carpinteria",
    src: "https://images.unsplash.com/photo-1601999007108-e03ee97edd74?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Tecnología",
    href: "/buscar?categoria=tecnologia",
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Mecánica",
    href: "/buscar?categoria=mecanica",
    src: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Belleza",
    href: "/buscar?categoria=belleza",
    src: "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Mudanzas",
    href: "/buscar?categoria=mudanzas",
    src: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=480&q=80",
  },
  {
    label: "Seguridad",
    href: "/buscar?categoria=seguridad",
    src: "https://images.unsplash.com/photo-1557597774-9d475d4b1037?auto=format&fit=crop&w=480&q=80",
  },
];

const DOUBLED = [...CATEGORIES, ...CATEGORIES];

export function CategorySlider() {
  const [paused, setPaused] = useState(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  return (
    <section className="py-0 overflow-hidden bg-white select-none">
      <div
        className="relative overflow-hidden cursor-default"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => { setPaused(false); setHoveredLabel(null); }}
      >
        {/* Left fade */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
        {/* Right fade */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />

        <div
          className="flex gap-4 py-5 animate-slider"
          style={{
            animationPlayState: paused ? "paused" : "running",
            width: "max-content",
          }}
        >
          {DOUBLED.map((cat, i) => (
            <Link
              key={`${cat.label}-${i}`}
              href={cat.href}
              onMouseEnter={() => setHoveredLabel(cat.label)}
              onMouseLeave={() => setHoveredLabel(null)}
              className="block shrink-0 rounded-2xl overflow-hidden"
              style={{
                width: 220,
                height: 300,
                position: "relative",
                transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease, box-shadow 0.3s ease",
                transform:
                  hoveredLabel === cat.label
                    ? "scale(1.06)"
                    : hoveredLabel !== null
                    ? "scale(0.97)"
                    : "scale(1)",
                opacity: hoveredLabel !== null && hoveredLabel !== cat.label ? 0.55 : 1,
                boxShadow:
                  hoveredLabel === cat.label
                    ? "0 20px 48px rgba(0,0,0,0.22)"
                    : "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              <Image
                src={cat.src}
                alt={cat.label}
                fill
                className="object-cover"
                sizes="220px"
                draggable={false}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              {/* Label */}
              <span className="absolute bottom-4 left-4 right-4 text-white font-semibold text-sm leading-tight drop-shadow">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
