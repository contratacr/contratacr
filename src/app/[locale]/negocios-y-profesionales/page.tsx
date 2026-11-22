import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Briefcase, Check, ChevronRight, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectoryShell } from "@/components/directory/directory-shell";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";

// Entry for the owner side (owner decision 2026-11-21): ONE page with two cards. Professionals go to the existing
// registration flow; business owners find their listing and claim it. Only while the directory is on (404 otherwise).
export const dynamic = "force-dynamic";
const PATH = "/negocios-y-profesionales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  if (!sitemapSections().length) return {};
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "businessHub" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: rutaConIdioma(locale, PATH), languages: { es: PATH, en: `/en${PATH}` } },
    openGraph: { title: t("metaTitle"), description: t("metaDescription"), type: "website" },
  };
}

export default async function BusinessHubPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!sitemapSections().length) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "businessHub" });
  const cards = [
    { id: "pro", icon: Briefcase, title: t("proTitle"), benefits: [t("proB1"), t("proB2"), t("proB3")], cta: t("proCta"), href: "/registro/profesional", hint: null },
    { id: "business", icon: Store, title: t("bizTitle"), benefits: [t("bizB1"), t("bizB2"), t("bizB3")], cta: t("bizCta"), href: "/lugares", hint: t("bizHint") },
  ];
  return (
    <DirectoryShell>
      <main id="contenido" data-business-hub className="mx-auto max-w-5xl px-4 py-8 text-[#162543] sm:px-6 sm:py-12">
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
        <div className="grid gap-5 md:grid-cols-2">
          {cards.map(({ id, icon: Icon, title, benefits, cta, href, hint }) => (
            <section key={id} data-business-card={id} aria-labelledby={`negocios-${id}`} className="flex flex-col rounded-3xl border border-[#e5e9ee] bg-white p-6 shadow-sm sm:p-8">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf7fd] text-[#009FD9]"><Icon className="h-6 w-6" aria-hidden /></span>
              <h2 id={`negocios-${id}`} className="text-xl font-extrabold sm:text-2xl">{title}</h2>
              <ul className="mt-4 flex-1 space-y-2.5">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[15px] text-[#162543]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
              <Link href={href} data-business-cta={id} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#009FD9] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[#0088bb]">{cta}</Link>
              {hint && <p className="mt-3 text-sm text-[#5b6b82]">{hint}</p>}
            </section>
          ))}
        </div>
      </main>
    </DirectoryShell>
  );
}
