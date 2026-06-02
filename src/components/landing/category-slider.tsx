"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

const CATEGORIES = [
  {
    label: "Plomería",
    href: "/buscar?categoria=plomeria",
    src: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Electricidad",
    href: "/buscar?categoria=electricidad",
    src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Construcción",
    href: "/buscar?categoria=construccion",
    src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Pintura",
    href: "/buscar?categoria=pintura",
    src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Jardinería",
    href: "/buscar?categoria=jardineria",
    src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Limpieza",
    href: "/buscar?categoria=limpieza",
    src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Carpintería",
    href: "/buscar?categoria=carpinteria",
    src: "https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Tecnología",
    href: "/buscar?categoria=tecnologia",
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Mecánica",
    href: "/buscar?categoria=mecanica",
    src: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Belleza",
    href: "/buscar?categoria=belleza",
    src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Mudanzas",
    href: "/buscar?categoria=mudanzas",
    src: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=400&auto=format&fit=crop&q=80",
  },
  {
    label: "Seguridad",
    href: "/buscar?categoria=seguridad",
    src: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=400&auto=format&fit=crop&q=80",
  },
];

const DOUBLED = [...CATEGORIES, ...CATEGORIES];

const CARD_WIDTH = 220;
const CARD_HEIGHT = 280;

export function CategorySlider() {
  const [paused, setPaused] = useState(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  return (
    <section className="overflow-hidden bg-white" style={{ paddingTop: 0, paddingBottom: 0 }}>
      <div
        className="relative overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => { setPaused(false); setHoveredLabel(null); }}
      >
        {/* Left edge fade */}
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 z-10"
          style={{ width: 80, background: "linear-gradient(to right, white, transparent)" }}
        />
        {/* Right edge fade */}
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 z-10"
          style={{ width: 80, background: "linear-gradient(to left, white, transparent)" }}
        />

        {/* Scrolling track */}
        <div
          className="flex animate-slider"
          style={{
            width: "max-content",
            animationPlayState: paused ? "paused" : "running",
            gap: 0,
          }}
        >
          {DOUBLED.map((cat, i) => (
            <Link
              key={`${cat.label}-${i}`}
              href={cat.href}
              onMouseEnter={() => setHoveredLabel(cat.label)}
              onMouseLeave={() => setHoveredLabel(null)}
              style={{
                display: "block",
                position: "relative",
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                flexShrink: 0,
                overflow: "hidden",
                borderRadius: 16,
                margin: "12px 6px",
                transition:
                  "transform 0.35s cubic-bezier(0.34,1.2,0.64,1), opacity 0.25s ease, box-shadow 0.3s ease",
                transform: hoveredLabel === cat.label ? "scale(1.04)" : "scale(1)",
                opacity:
                  hoveredLabel !== null && hoveredLabel !== cat.label ? 0.75 : 1,
                boxShadow:
                  hoveredLabel === cat.label
                    ? "0 16px 48px rgba(0,0,0,0.28)"
                    : "0 2px 12px rgba(0,0,0,0.1)",
              }}
            >
              <Image
                src={cat.src}
                alt={cat.label}
                fill
                className="object-cover"
                sizes={`${CARD_WIDTH}px`}
                draggable={false}
              />
              {/* Strong bottom gradient */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 45%, transparent 100%)",
                }}
              />
              {/* Label */}
              <span
                style={{
                  position: "absolute",
                  bottom: 14,
                  left: 14,
                  color: "white",
                  fontWeight: 700,
                  fontSize: 15,
                  lineHeight: 1.2,
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}
              >
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
