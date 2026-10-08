import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWhatsApp(phone: string) {
  const clean = phone.replace(/\D/g, "");
  if (clean.startsWith("506")) return clean;
  // International numbers already carry their country code (CR national = 8 digits).
  if (clean.length > 8) return clean;
  return `506${clean}`;
}

export function getWhatsAppLink(phone: string, message?: string) {
  const number = formatWhatsApp(phone);
  const text = message ? encodeURIComponent(message) : "";
  return `https://wa.me/${number}${text ? `?text=${text}` : ""}`;
}

/**
 * SINGLE canonical relative timestamp used app-wide (reviews, notifications, requests,
 * projects, tickets…). One consistent "hace X" scale, correct singular/plural, and the
 * ACTUAL date once it's older than ~a year. NOTE: deliberately NOT `Intl.RelativeTimeFormat`
 * with `numeric:"auto"` — that yields "anteayer"/"antier" for 2 days, which breaks the
 * consistent "hace N días" series. Only "ayer"/"yesterday" (1 day) is special-cased.
 *  ES: hace un momento · hace N minutos · hace 1 hora/N horas · ayer · hace N días ·
 *      hace 1 semana/N semanas · hace 1 mes/N meses · "15 jun 2025"
 *  EN: just now · N minutes ago · 1 hour/N hours ago · yesterday · N days ago ·
 *      1 week/N weeks ago · 1 month/N months ago · "Jun 15, 2025"
 */
export function formatRelativeTime(date: string | Date, locale: string = "es"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const en = locale === "en";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return en ? "just now" : "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return en ? `${min} minute${min !== 1 ? "s" : ""} ago` : `hace ${min} minuto${min !== 1 ? "s" : ""}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return en ? `${hr} hour${hr !== 1 ? "s" : ""} ago` : `hace ${hr} hora${hr !== 1 ? "s" : ""}`;
  const day = Math.floor(hr / 24);
  if (day === 1) return en ? "yesterday" : "ayer";
  if (day < 7) return en ? `${day} days ago` : `hace ${day} días`;
  if (day < 30) {
    const wk = Math.floor(day / 7);
    return en ? `${wk} week${wk !== 1 ? "s" : ""} ago` : `hace ${wk} semana${wk !== 1 ? "s" : ""}`;
  }
  if (day < 365) {
    const mo = Math.floor(day / 30);
    return en ? `${mo} month${mo !== 1 ? "s" : ""} ago` : `hace ${mo} mes${mo !== 1 ? "es" : ""}`;
  }
  // Older than ~a year → the actual date, never "hace N años".
  return d.toLocaleDateString(en ? "en-US" : "es-CR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Relative time for PANEL date labels (sprint 528): escalates minutes → hours → days, then
 * shows the ACTUAL DATE once it reaches ~1 week (the owner's spec). Use with a context prefix
 * ("Enviada {x}", "Solicitada {x}", "Publicado {x}", the opportunity post time, notifications).
 * Only for PAST events (created/sent/published) — not future appointment dates.
 */
export function formatRelativeOrDate(date: string | Date, locale: string = "es"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const en = locale === "en";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return en ? "just now" : "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return en ? `${min} minute${min !== 1 ? "s" : ""} ago` : `hace ${min} minuto${min !== 1 ? "s" : ""}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return en ? `${hr} hour${hr !== 1 ? "s" : ""} ago` : `hace ${hr} hora${hr !== 1 ? "s" : ""}`;
  const day = Math.floor(hr / 24);
  if (day < 7) return en ? `${day} day${day !== 1 ? "s" : ""} ago` : `hace ${day} día${day !== 1 ? "s" : ""}`;
  // ~1 semana o más → la fecha, con el mes escrito entero: "31 ago" se lee como
  // una abreviatura de sistema, "31 de agosto" se lee como una fecha. El año
  // solo si no es el actual, que dentro del año en curso sobra.
  const mismoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(en ? "en-US" : "es-CR", {
    day: "numeric",
    month: "long",
    ...(mismoAno ? {} : { year: "numeric" }),
  });
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/** Public display name for a professional: drop only the MIDDLE given name(s),
 *  keeping the first given name + BOTH surnames. CR padrón names are
 *  "Nombre1 [Nombre2] Apellido1 Apellido2" → first word + the last two words. So
 *  "Isaac Alberto Sánchez Monge" → "Isaac Sánchez Monge"; a 3-word name is kept
 *  whole; ≤2 words stay as-is. */
export function proDisplayName(full: string) {
  const w = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (w.length <= 3) return w.join(" ");
  return `${w[0]} ${w[w.length - 2]} ${w[w.length - 1]}`;
}
