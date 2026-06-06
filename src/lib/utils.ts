import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRating(rating: number) {
  return rating.toFixed(1);
}

/** Build a universal .ics calendar event (Google/Apple/Outlook compatible). */
export function buildBookingIcs(opts: {
  proName: string;
  service: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  whatsappLink: string;
}): string {
  const { proName, service, date, time, whatsappLink } = opts;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const start = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
  const end = `${y}${pad(m)}${pad(d)}T${pad((hh + 1) % 24)}${pad(mm)}00`;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@contratacr.com`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ContrataCR//Booking//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(`${service || "Servicio"} con ${proName}`)}`,
    `DESCRIPTION:${esc(`Servicio: ${service || "-"}\nProfesional: ${proName}\nWhatsApp: ${whatsappLink}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
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
