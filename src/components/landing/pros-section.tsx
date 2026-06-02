"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

/* ─── Category icon SVGs (thin stroke, Thumbtack style) ─── */
const Icons = {
  Limpieza: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M9 21V7l-6 6M9 7l6-6 6 6M15 21V7"/>
    </svg>
  ),
  Plomería: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  Jardinería: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  ),
  Mudanzas: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  Electricidad: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Pintura: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16s0-4 4-4 4 4 8 4 4-4 4-4"/><path d="M2 12V2h6v4h8V2h6v10"/>
    </svg>
  ),
  Carpintería: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0a2.12 2.12 0 0 1 0-3L12 9"/>
      <path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>
    </svg>
  ),
  Tecnología: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  Mecánica: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/>
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
    </svg>
  ),
  Seguridad: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  /* ── New icons ── */
  Pisos: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/>
      <rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>
    </svg>
  ),
  Techos: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12L12 3l9 9"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9"/>
    </svg>
  ),
  Herrería: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3z"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="13" y1="3" x2="13" y2="21"/>
      <line x1="18" y1="3" x2="18" y2="21"/>
    </svg>
  ),
  Impermeabilización: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M12 9v4m0 2h.01"/>
    </svg>
  ),
  AireAcondicionado: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="8" rx="2"/>
      <path d="M8 14v4M12 14v4M16 14v4"/><path d="M6 10h12"/>
    </svg>
  ),
  Chapistería: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  Fumigación: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9h12v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
      <path d="M8 9V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/>
      <path d="M17 9h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"/>
    </svg>
  ),
  DiseñoInteriores: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  Fotografía: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  Eventos: () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <path d="M12 14l1.5 1.5L16 13"/>
    </svg>
  ),
};

const CATEGORY_TABS = [
  { id: "limpieza",              label: "Limpieza",            Icon: Icons.Limpieza,              href: "/buscar?categoria=limpieza" },
  { id: "plomeria",              label: "Plomería",            Icon: Icons.Plomería,              href: "/buscar?categoria=plomeria" },
  { id: "jardineria",            label: "Jardinería",          Icon: Icons.Jardinería,            href: "/buscar?categoria=jardineria" },
  { id: "mudanzas",              label: "Mudanzas",            Icon: Icons.Mudanzas,              href: "/buscar?categoria=mudanzas" },
  { id: "electricidad",          label: "Electricidad",        Icon: Icons.Electricidad,          href: "/buscar?categoria=electricidad" },
  { id: "pintura",               label: "Pintura",             Icon: Icons.Pintura,               href: "/buscar?categoria=pintura" },
  { id: "carpinteria",           label: "Carpintería",         Icon: Icons.Carpintería,           href: "/buscar?categoria=carpinteria" },
  { id: "tecnologia",            label: "Tecnología",          Icon: Icons.Tecnología,            href: "/buscar?categoria=tecnologia" },
  { id: "mecanica",              label: "Mecánica",            Icon: Icons.Mecánica,              href: "/buscar?categoria=mecanica" },
  { id: "seguridad",             label: "Seguridad",           Icon: Icons.Seguridad,             href: "/buscar?categoria=seguridad" },
  { id: "pisos",                 label: "Pisos",               Icon: Icons.Pisos,                 href: "/buscar?categoria=pisos" },
  { id: "techos",                label: "Techos",              Icon: Icons.Techos,                href: "/buscar?categoria=techos" },
  { id: "herreria",              label: "Herrería",            Icon: Icons.Herrería,              href: "/buscar?categoria=herreria" },
  { id: "impermeabilizacion",    label: "Impermeabilización",  Icon: Icons.Impermeabilización,    href: "/buscar?categoria=impermeabilizacion" },
  { id: "aire_acondicionado",    label: "Aire acondicionado",  Icon: Icons.AireAcondicionado,     href: "/buscar?categoria=aire-acondicionado" },
  { id: "chapisteria",           label: "Chapistería",         Icon: Icons.Chapistería,           href: "/buscar?categoria=chapisteria" },
  { id: "fumigacion",            label: "Fumigación",          Icon: Icons.Fumigación,            href: "/buscar?categoria=fumigacion" },
  { id: "diseno_interiores",     label: "Diseño de interiores",Icon: Icons.DiseñoInteriores,      href: "/buscar?categoria=diseno-interiores" },
  { id: "fotografia",            label: "Fotografía",          Icon: Icons.Fotografía,            href: "/buscar?categoria=fotografia" },
  { id: "eventos",               label: "Eventos",             Icon: Icons.Eventos,               href: "/buscar?categoria=eventos" },
] as const;

type CategoryId = typeof CATEGORY_TABS[number]["id"];

interface Card { label: string; href: string; src: string; }

const CATEGORY_CARDS: Record<CategoryId, Card[]> = {
  limpieza: [
    { label: "Limpieza del hogar",   href: "/buscar?categoria=limpieza", src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80" },
    { label: "Limpieza de oficinas", href: "/buscar?categoria=limpieza", src: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80" },
    { label: "Desinfección profunda",href: "/buscar?categoria=limpieza", src: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=600&q=80" },
    { label: "Lavado de alfombras",  href: "/buscar?categoria=limpieza", src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80" },
  ],
  plomeria: [
    { label: "Reparación de tuberías", href: "/buscar?categoria=plomeria", src: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=600&q=80" },
    { label: "Instalación de baños",   href: "/buscar?categoria=plomeria", src: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=600&q=80" },
    { label: "Tanques y cisternas",    href: "/buscar?categoria=plomeria", src: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=600&q=80" },
    { label: "Detección de fugas",     href: "/buscar?categoria=plomeria", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" },
  ],
  jardineria: [
    { label: "Poda y mantenimiento",href: "/buscar?categoria=jardineria", src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=600&q=80" },
    { label: "Tala de árboles",     href: "/buscar?categoria=jardineria", src: "https://images.unsplash.com/photo-1588614959060-4d144f28b207?auto=format&fit=crop&w=600&q=80" },
    { label: "Sistema de riego",    href: "/buscar?categoria=jardineria", src: "https://images.unsplash.com/photo-1592150621744-aca64f48394a?auto=format&fit=crop&w=600&q=80" },
    { label: "Jardín completo",     href: "/buscar?categoria=jardineria", src: "https://images.unsplash.com/photo-1585320806297-9794b3e4aaae?auto=format&fit=crop&w=600&q=80" },
  ],
  mudanzas: [
    { label: "Mudanza residencial",   href: "/buscar?categoria=mudanzas", src: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=600&q=80" },
    { label: "Transporte de muebles", href: "/buscar?categoria=mudanzas", src: "https://images.unsplash.com/photo-1558618047-3c8c76f1d8e9?auto=format&fit=crop&w=600&q=80" },
    { label: "Embalaje profesional",  href: "/buscar?categoria=mudanzas", src: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80" },
    { label: "Mudanza de oficinas",   href: "/buscar?categoria=mudanzas", src: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80" },
  ],
  electricidad: [
    { label: "Instalación eléctrica",  href: "/buscar?categoria=electricidad", src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80" },
    { label: "Tableros y breakers",    href: "/buscar?categoria=electricidad", src: "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=600&q=80" },
    { label: "Iluminación LED",        href: "/buscar?categoria=electricidad", src: "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=600&q=80" },
    { label: "Cámaras y alarmas",      href: "/buscar?categoria=seguridad",    src: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=600&q=80" },
  ],
  pintura: [
    { label: "Pintura interior",    href: "/buscar?categoria=pintura", src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=600&q=80" },
    { label: "Pintura exterior",    href: "/buscar?categoria=pintura", src: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80" },
    { label: "Impermeabilización",  href: "/buscar?categoria=pintura", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" },
    { label: "Stucco y acabados",   href: "/buscar?categoria=pintura", src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=600&q=80" },
  ],
  carpinteria: [
    { label: "Muebles a medida",    href: "/buscar?categoria=carpinteria", src: "https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?auto=format&fit=crop&w=600&q=80" },
    { label: "Puertas y ventanas",  href: "/buscar?categoria=carpinteria", src: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80" },
    { label: "Pisos de madera",     href: "/buscar?categoria=carpinteria", src: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80" },
    { label: "Closets y estantes",  href: "/buscar?categoria=carpinteria", src: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=600&q=80" },
  ],
  tecnologia: [
    { label: "Soporte técnico",    href: "/buscar?categoria=tecnologia", src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80" },
    { label: "Redes y WiFi",       href: "/buscar?categoria=tecnologia", src: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80" },
    { label: "Diseño web",         href: "/buscar?categoria=diseno-web", src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80" },
    { label: "Cámaras CCTV",       href: "/buscar?categoria=seguridad",  src: "https://images.unsplash.com/photo-1557597774-9d475d4b1037?auto=format&fit=crop&w=600&q=80" },
  ],
  mecanica: [
    { label: "Diagnóstico y revisión", href: "/buscar?categoria=mecanica", src: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=600&q=80" },
    { label: "Frenos y suspensión",    href: "/buscar?categoria=mecanica", src: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=600&q=80" },
    { label: "Cambio de aceite",       href: "/buscar?categoria=mecanica", src: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=80" },
    { label: "Sistema eléctrico",      href: "/buscar?categoria=mecanica", src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80" },
  ],
  seguridad: [
    { label: "Cámaras de seguridad", href: "/buscar?categoria=seguridad", src: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=600&q=80" },
    { label: "Cerrajería",           href: "/buscar?categoria=seguridad", src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80" },
    { label: "Alarmas y sensores",   href: "/buscar?categoria=seguridad", src: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=600&q=80" },
    { label: "Control de acceso",    href: "/buscar?categoria=seguridad", src: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&w=600&q=80" },
  ],
  pisos: [
    { label: "Pisos de cerámica",    href: "/buscar?categoria=pisos", src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80" },
    { label: "Pisos de madera",      href: "/buscar?categoria=pisos", src: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80" },
    { label: "Pisos vinílicos",      href: "/buscar?categoria=pisos", src: "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?auto=format&fit=crop&w=600&q=80" },
    { label: "Pulido y sellado",     href: "/buscar?categoria=pisos", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" },
  ],
  techos: [
    { label: "Techos de zinc",        href: "/buscar?categoria=techos", src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=600&q=80" },
    { label: "Techos de teja",        href: "/buscar?categoria=techos", src: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80" },
    { label: "Reparación de techos",  href: "/buscar?categoria=techos", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" },
    { label: "Canaletas y drenajes",  href: "/buscar?categoria=techos", src: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80" },
  ],
  herreria: [
    { label: "Portones de hierro",    href: "/buscar?categoria=herreria", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" },
    { label: "Verjas y rejas",        href: "/buscar?categoria=herreria", src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80" },
    { label: "Barandas de escalera",  href: "/buscar?categoria=herreria", src: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80" },
    { label: "Estructuras metálicas", href: "/buscar?categoria=herreria", src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=600&q=80" },
  ],
  impermeabilizacion: [
    { label: "Impermeabilización de techos",  href: "/buscar?categoria=impermeabilizacion", src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" },
    { label: "Impermeabilización de losas",   href: "/buscar?categoria=impermeabilizacion", src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=600&q=80" },
    { label: "Sellado de filtraciones",       href: "/buscar?categoria=impermeabilizacion", src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80" },
    { label: "Pintura impermeabilizante",     href: "/buscar?categoria=impermeabilizacion", src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=600&q=80" },
  ],
  aire_acondicionado: [
    { label: "Instalación de A/C",      href: "/buscar?categoria=aire-acondicionado", src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80" },
    { label: "Mantenimiento de A/C",    href: "/buscar?categoria=aire-acondicionado", src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80" },
    { label: "Reparación de A/C",       href: "/buscar?categoria=aire-acondicionado", src: "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=600&q=80" },
    { label: "Sistemas de ventilación", href: "/buscar?categoria=aire-acondicionado", src: "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=600&q=80" },
  ],
  chapisteria: [
    { label: "Reparación de carrocería", href: "/buscar?categoria=chapisteria", src: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=600&q=80" },
    { label: "Pintura automotriz",       href: "/buscar?categoria=chapisteria", src: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=600&q=80" },
    { label: "Alineación y enderezado",  href: "/buscar?categoria=chapisteria", src: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=600&q=80" },
    { label: "Restauración de autos",    href: "/buscar?categoria=chapisteria", src: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=80" },
  ],
  fumigacion: [
    { label: "Control de cucarachas",   href: "/buscar?categoria=fumigacion", src: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=600&q=80" },
    { label: "Control de termitas",     href: "/buscar?categoria=fumigacion", src: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80" },
    { label: "Fumigación de jardines",  href: "/buscar?categoria=fumigacion", src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=600&q=80" },
    { label: "Control de roedores",     href: "/buscar?categoria=fumigacion", src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80" },
  ],
  diseno_interiores: [
    { label: "Diseño de salas",          href: "/buscar?categoria=diseno-interiores", src: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=600&q=80" },
    { label: "Decoración de dormitorios",href: "/buscar?categoria=diseno-interiores", src: "https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?auto=format&fit=crop&w=600&q=80" },
    { label: "Diseño de cocinas",        href: "/buscar?categoria=diseno-interiores", src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80" },
    { label: "Oficinas y espacios",      href: "/buscar?categoria=diseno-interiores", src: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80" },
  ],
  fotografia: [
    { label: "Fotografía de eventos",    href: "/buscar?categoria=fotografia", src: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80" },
    { label: "Fotografía inmobiliaria",  href: "/buscar?categoria=fotografia", src: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=600&q=80" },
    { label: "Retratos y portraits",     href: "/buscar?categoria=fotografia", src: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80" },
    { label: "Video y producción",       href: "/buscar?categoria=fotografia", src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80" },
  ],
  eventos: [
    { label: "Organización de bodas",    href: "/buscar?categoria=eventos", src: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80" },
    { label: "Fiestas de cumpleaños",    href: "/buscar?categoria=eventos", src: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=80" },
    { label: "Eventos corporativos",     href: "/buscar?categoria=eventos", src: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80" },
    { label: "Decoración de eventos",    href: "/buscar?categoria=eventos", src: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80" },
  ],
};

function ServiceCard({ card }: { card: Card }) {
  return (
    <Link
      href={card.href}
      className="group relative block rounded-2xl overflow-hidden card-lift"
      style={{ height: 200 }}
    >
      <Image
        src={card.src}
        alt={card.label}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-[1.07]"
        sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 50%, transparent 100%)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
        <span className="text-white font-bold text-sm drop-shadow leading-tight">{card.label}</span>
        <ArrowRight className="h-4 w-4 text-white/70 shrink-0 translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
      </div>
    </Link>
  );
}

export function ProsSection() {
  const [activeId, setActiveId] = useState<CategoryId>("limpieza");
  const tabsRef = useRef<HTMLDivElement>(null);

  const cards = CATEGORY_CARDS[activeId];

  function scrollTabs(dir: "left" | "right") {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "right" ? 200 : -200, behavior: "smooth" });
  }

  return (
    <section className="py-16 sm:py-24 bg-[#f4f7fa]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Headline */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1a2744] leading-tight">
            Profesionales para cada proyecto en{" "}
            <span className="text-[#009FD9]">Tu Zona.</span>
          </h2>
        </div>

        {/* Icon tabs with arrow buttons */}
        <div className="relative flex items-center gap-2 mb-8" style={{ overflow: "visible" }}>
          {/* Left arrow */}
          <button
            onClick={() => scrollTabs("left")}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-[#009FD9] hover:border-[#009FD9]/30 transition-all shadow-sm z-10"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Scrollable tab list — pb-2 so underline isn't clipped */}
          <div
            ref={tabsRef}
            className="flex gap-1 overflow-x-auto flex-1 hide-scrollbar pb-2"
          >
            {CATEGORY_TABS.map((tab) => {
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  className="flex flex-col items-center gap-2 px-5 py-3 shrink-0 rounded-xl transition-all duration-200"
                  style={{
                    background: active ? "white" : "transparent",
                    boxShadow: active ? "0 2px 12px rgba(0,0,0,0.08)" : "none",
                    minWidth: 82,
                  }}
                >
                  <span style={{ color: active ? "#009FD9" : "#9ca3af" }} className="transition-colors duration-200">
                    <tab.Icon />
                  </span>
                  <span
                    className="text-xs font-semibold whitespace-nowrap transition-colors duration-200"
                    style={{ color: active ? "#1a2744" : "#9ca3af" }}
                  >
                    {tab.label}
                  </span>
                  {/* Brand underline */}
                  <span
                    className="h-0.5 rounded-full transition-all duration-300"
                    style={{ width: active ? "80%" : "0%", background: "#009FD9" }}
                  />
                </button>
              );
            })}
          </div>

          {/* Right arrow */}
          <button
            onClick={() => scrollTabs("right")}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-[#009FD9] hover:border-[#009FD9]/30 transition-all shadow-sm z-10"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Cards grid */}
        <div
          key={activeId}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-tab-cards"
        >
          {cards.map((card) => (
            <ServiceCard key={card.label} card={card} />
          ))}
        </div>

      </div>
    </section>
  );
}
