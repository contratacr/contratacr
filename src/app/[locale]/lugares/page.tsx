import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BadgeDollarSign, CalendarDays, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectoryShell } from "@/components/directory/directory-shell";
import { DIRECTORY_SECTION_BLURBS, DIRECTORY_SECTION_ICONS, enabledDirectoryGroups, pick } from "@/lib/directory/directory-groups";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";

// Hub of the place directory (owner decision 2026-11-21): the sections in the same six groups as the "Lugares" menu.
// Only while the directory is on (sitemapSections() is empty otherwise -> 404, like the section pages).
export const dynamic = "force-dynamic";
const PATH = "/lugares";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  if (!sitemapSections().length) return {};
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "placesHub" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: rutaConIdioma(locale, PATH), languages: { es: PATH, en: `/en${PATH}` } },
    openGraph: { title: t("metaTitle"), description: t("metaDescription"), type: "website" },
  };
}

const CARD = "group flex min-h-20 items-center gap-3 rounded-2xl border border-[#e5e9ee] bg-white p-4 shadow-sm transition-colors hover:border-[#009FD9]";
const ICON_BOX = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf7fd] text-[#009FD9]";

export default async function PlacesHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const sections = sitemapSections().map((s) => s.section);
  if (!sections.length) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "placesHub" });
  const groups = enabledDirectoryGroups(sections);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("home"), item: rutaConIdioma(locale, "/") },
      { "@type": "ListItem", position: 2, name: t("title"), item: rutaConIdioma(locale, PATH) },
    ],
  };
  return (
    <DirectoryShell>
      <main id="contenido" data-places-hub className="mx-auto max-w-6xl px-4 py-8 text-[#162543] sm:px-6 sm:py-12 lg:px-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
        <nav aria-label={t("breadcrumbLabel")} className="mb-4 text-sm text-[#5b6b82]">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-[#009FD9] hover:underline">{t("home")}</Link></li>
            <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-semibold text-[#162543]">{t("title")}</li>
          </ol>
        </nav>
        <header className="mb-8 max-w-2xl space-y-2">
          <h1 className="text-3xl font-extrabold sm:text-4xl">{t("title")}</h1>
          <p className="text-base text-[#5b6b82]">{t("intro")}</p>
        </header>
        <div className="space-y-9">
          {groups.map((g) => {
            const GroupIcon = g.icon;
            return (
              <section key={g.id} data-places-hub-group={g.id} aria-labelledby={`lugares-${g.id}`}>
                <h2 id={`lugares-${g.id}`} className="mb-3 flex items-center gap-2 text-xl font-extrabold">
                  <GroupIcon className="h-5 w-5 text-[#009FD9]" aria-hidden />
                  {pick(g.label, locale)}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.sections.map(({ section, label }) => {
                    const Icon = DIRECTORY_SECTION_ICONS[section];
                    return (
                      <li key={section}>
                        <Link href={`/${section}`} data-places-hub-section={section} className={CARD}>
                          <span className={ICON_BOX}>{Icon && <Icon className="h-5 w-5" aria-hidden />}</span>
                          <span className="min-w-0">
                            <span className="block text-base font-bold group-hover:text-[#009FD9]">{pick(label, locale)}</span>
                            <span className="block text-sm text-[#5b6b82]">{DIRECTORY_SECTION_BLURBS[section] ? pick(DIRECTORY_SECTION_BLURBS[section], locale) : ""}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <section aria-labelledby="lugares-mas">
            <h2 id="lugares-mas" className="mb-3 text-xl font-extrabold">{t("moreTitle")}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <li>
                <Link href="/precios" data-places-hub-prices className={CARD}>
                  <span className={ICON_BOX}><BadgeDollarSign className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-base font-bold group-hover:text-[#009FD9]">{t("prices")}</span>
                    <span className="block text-sm text-[#5b6b82]">{t("pricesText")}</span>
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/eventos" data-places-hub-events className={CARD}>
                  <span className={ICON_BOX}><CalendarDays className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-base font-bold group-hover:text-[#009FD9]">{t("events")}</span>
                    <span className="block text-sm text-[#5b6b82]">{t("eventsText")}</span>
                  </span>
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </DirectoryShell>
  );
}
