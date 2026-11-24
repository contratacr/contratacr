"use client";
import { Briefcase, ChevronRight, ClipboardList, MessageSquareText, Tag, Users, type LucideIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";

// «Más en ContrataCR»: el centro de lo que ya no cabe en las cinco pestañas (Profesionales, Empleos, Promociones,
// Solicitudes, Mensajes). Lo incrustan /yo y las demás pantallas del directorio. Textos locales es/en.

export type MasLink = { id: string; href: string; icon: LucideIcon; es: string; en: string; descEs: string; descEn: string };

export const MAS_LINKS: readonly MasLink[] = [
  { id: "profesionales", href: "/profesionales", icon: Users, es: "Profesionales", en: "Professionals", descEs: "Busque y contrate expertos verificados", descEn: "Find and hire verified experts" },
  ...(EMPLEOS_VISIBLE ? [{ id: "empleos", href: "/empleos", icon: Briefcase, es: "Empleos", en: "Jobs", descEs: "Ofertas de trabajo en Costa Rica", descEn: "Job openings in Costa Rica" }] : []),
  { id: "promociones", href: "/promociones", icon: Tag, es: "Promociones", en: "Promotions", descEs: "Ofertas de negocios y profesionales", descEn: "Offers from businesses and professionals" },
  { id: "solicitudes", href: "/solicitudes", icon: ClipboardList, es: "Solicitudes", en: "Requests", descEs: "Sus solicitudes y cotizaciones", descEn: "Your requests and quotes" },
  { id: "mensajes", href: "/mensajes", icon: MessageSquareText, es: "Mensajes", en: "Messages", descEs: "Sus conversaciones", descEn: "Your conversations" },
];

export function masTitle(locale: string): string {
  const en = locale === "en";
  return en ? "More" : "Más en ContrataCR";
}

/** Solo la lista de enlaces, para incrustarla en otra pantalla (sin título). */
export function MasLinks({ className }: { className?: string }) {
  const locale = useLocale();
  const en = locale === "en";
  return (
    <ul data-mas-links="" className={className ?? "divide-y divide-[#162543]/10 overflow-hidden rounded-2xl border border-[#162543]/10 bg-white"}>
      {MAS_LINKS.map(({ id, href, icon: Icon, es, en: nameEn, descEs, descEn }) => (
        <li key={id}>
          <Link href={href} data-mas-link={id} prefetch={false} className="flex min-h-[56px] items-center gap-3 px-4 py-3 text-[#162543] active:bg-[#162543]/5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#009FD9]/10 text-[#009FD9]"><Icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-tight">{en ? nameEn : es}</span>
              <span className="block truncate text-[13px] leading-snug text-[#162543]/60">{en ? descEn : descEs}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#162543]/40" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** La hoja completa: título + lista. */
export function MasSheet({ className }: { className?: string }) {
  const locale = useLocale();
  return (
    <section data-mas-sheet="" aria-labelledby="mas-sheet-title" className={className}>
      <h2 id="mas-sheet-title" className="mb-3 text-[19px] font-extrabold leading-6 text-[#162543]">{masTitle(locale)}</h2>
      <MasLinks />
    </section>
  );
}
