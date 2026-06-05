import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRating(rating: number) {
  return rating.toFixed(1);
}

export function formatPrice(amount: number) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatWhatsApp(phone: string) {
  const clean = phone.replace(/\D/g, "");
  return clean.startsWith("506") ? clean : `506${clean}`;
}

export function getWhatsAppLink(phone: string, message?: string) {
  const number = formatWhatsApp(phone);
  const text = message ? encodeURIComponent(message) : "";
  return `https://wa.me/${number}${text ? `?text=${text}` : ""}`;
}

/** Spanish relative timestamp, e.g. "hace 5 minutos", "hace 2 días". */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} minuto${min !== 1 ? "s" : ""}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} hora${hr !== 1 ? "s" : ""}`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} día${day !== 1 ? "s" : ""}`;
  if (day < 30) {
    const wk = Math.floor(day / 7);
    return `hace ${wk} semana${wk !== 1 ? "s" : ""}`;
  }
  if (day < 365) {
    const mo = Math.floor(day / 30);
    return `hace ${mo} mes${mo !== 1 ? "es" : ""}`;
  }
  const yr = Math.floor(day / 365);
  return `hace ${yr} año${yr !== 1 ? "s" : ""}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
