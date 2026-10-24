/** Calendar days use the viewer's local timezone, matching the message clock. */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function messageTime(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function messageDayLabel(value: string, locale: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale.startsWith("en") ? "Unknown date" : "Fecha no disponible";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (localDay(date) === localDay(now)) return locale.startsWith("en") ? "Today" : "Hoy";
  if (localDay(date) === localDay(yesterday)) return locale.startsWith("en") ? "Yesterday" : "Ayer";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short", day: "numeric", month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
}

export function groupMessageDays<T extends { created_at: string }>(messages: T[]): Array<{ day: string; date: string; messages: T[] }> {
  const groups: Array<{ day: string; date: string; messages: T[] }> = [];
  for (const message of messages) {
    const date = new Date(message.created_at);
    const day = Number.isNaN(date.getTime()) ? "unknown" : localDay(date);
    const previous = groups[groups.length - 1];
    if (previous?.day === day) previous.messages.push(message);
    else groups.push({ day, date: message.created_at, messages: [message] });
  }
  return groups;
}
