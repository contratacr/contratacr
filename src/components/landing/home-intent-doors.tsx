"use client";

import { Hammer, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSiteFeatures } from "@/components/site-features";

// Two doors under the home search (owner decision 2026-11-21, recommendation A): "Contratar un servicio" and
// "Encontrar un lugar". Only while the directory is on; with it off the hero stays exactly as before.
export function HomeIntentDoors() {
  const t = useTranslations("landing.hero");
  const { directorySections } = useSiteFeatures();
  if (!directorySections.length) return null;
  const door = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-extrabold shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] transition-colors sm:px-6 sm:text-[15px]";
  return (
    <nav aria-label={t("puertasAria")} data-home-doors="" className="mt-3 grid grid-cols-2 gap-2.5 sm:flex sm:justify-center lg:justify-start">
      <Link href="/profesionales" data-home-door="servicio" className={`${door} bg-white text-[#162543] hover:bg-[#eaf7fd]`}>
        <Hammer className="h-[18px] w-[18px] shrink-0 text-[#009FD9]" aria-hidden />
        <span className="min-w-0 leading-tight">{t("puertaServicio")}</span>
      </Link>
      <Link href="/categorias" data-home-door="categorias" className={`${door} bg-[#009FD9] text-white hover:bg-[#0089bb]`}>
        <LayoutGrid className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className="min-w-0 leading-tight">{t("puertaLugar")}</span>
      </Link>
    </nav>
  );
}
