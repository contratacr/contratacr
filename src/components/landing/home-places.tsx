"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { idiomaDe } from "@/lib/prefijo-de-idioma";
import { useSiteFeatures } from "@/components/site-features";
import { curatedDirectoryGroups } from "@/lib/directory/directory-groups";

// "Lugares populares" (home, directory on): one tile per group of places (DIRECTORY_GROUPS, curated: only the ten categories of
// the menus; the /lugares hub has all), with the sections that are on as links. A group without sections on is hidden.

export function HomePlacesTiles() {
  const t = useTranslations("landing.inicio");
  const l = idiomaDe(useLocale());
  const { directorySections } = useSiteFeatures();
  const groups = curatedDirectoryGroups(directorySections);
  if (!groups.length) return null;
  return (
    <section data-home-directory aria-labelledby="ccr-home-lugares" className="bg-white py-8 sm:py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-5 sm:mb-8 sm:text-center">
          <h2 id="ccr-home-lugares" className="text-[clamp(1.15rem,6.3vw,2.25rem)] font-extrabold leading-tight text-[#1a2744] sm:text-4xl">{t("lugaresTitulo")}</h2>
          <p className="mt-2 text-[15px] text-[#5b6b82] sm:mx-auto sm:max-w-2xl sm:text-base">{t("lugaresSub")}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
          {groups.map(({ id, icon: Icon, label, sections }) => (
            <li key={id} data-home-place-group={id} className="flex flex-col rounded-2xl border border-[#e5e9ee] bg-white p-3 shadow-sm sm:p-4">
              <Link href={`/${sections[0].section}`} className="flex items-center gap-2.5 text-[15px] font-extrabold text-[#1A2744] transition-colors hover:text-[#009FD9] sm:text-lg">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf7fd] text-[#009FD9] sm:h-11 sm:w-11"><Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden /></span>
                <span className="min-w-0 leading-tight">{label[l]}</span>
              </Link>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {sections.map(({ section: s, label: sectionLabel }) => (
                  <li key={s}>
                    <Link href={`/${s}`} data-home-directory-section={s} className="inline-flex min-h-8 items-center rounded-full bg-[#f3f6f9] px-3 text-[13px] font-semibold text-[#1A2744] transition-colors hover:bg-[#eaf7fd] hover:text-[#009FD9]">
                      {sectionLabel[l]}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 sm:mt-7 sm:justify-center">
          <Link href="/lugares" className="inline-flex min-h-11 items-center text-sm font-extrabold text-[#009FD9] hover:underline">{t("verTodos")} &rarr;</Link>
          <Link href="/precios" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A2744] hover:text-[#009FD9]">{t("compararPrecios")}</Link>
          <Link href="/eventos" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A2744] hover:text-[#009FD9]">{t("eventos")}</Link>
        </div>
      </div>
    </section>
  );
}
