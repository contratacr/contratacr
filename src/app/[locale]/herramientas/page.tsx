import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectoryShell } from "@/components/directory/directory-shell";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { proHubGroups } from "@/lib/pro/hub-sections";
import { PRO_ENABLED } from "@/lib/pro/enabled";

// Herramientas (owner, 2026-11-26): the menu entry opens this plain list of every tool, the same names as the Pro panel,
// grouped like it, plus the free CV and letter. Logged out, the middleware sends a gated tool to login with ?redirect=
// and brings the person back to it. Pro-only page: 404 while PRO_ENABLED is off (production).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("toolsPage");
  return { title: `${t("title")} | ContrataCR`, robots: { index: false, follow: false } };
}

export default async function ToolsPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!PRO_ENABLED) notFound();
  const { locale } = await params;
  const en = locale === "en";
  const t = await getTranslations("toolsPage");
  const groups: { key: string; label: string; items: { key: string; label: string; href: string }[] }[] = proHubGroups(en, true, null).map((g) => ({
    key: g.key as string,
    label: g.label,
    items: g.items.filter((i) => !i.href && !i.team).map((i) => ({
      key: i.key,
      label: i.label,
      href: `/dashboard/pro?${new URLSearchParams({ tab: i.tab, ...(i.extra ?? {}) }).toString()}`,
    })),
  }));
  groups.push({ key: "free", label: t("freeGroup"), items: [
    { key: "cv", label: t("cv"), href: "/dashboard/profesional?tab=cv" },
    { key: "letter", label: t("letter"), href: "/dashboard/profesional?tab=carta" },
  ] });
  return (
    <DirectoryShell>
      <SectionHeaderTitle title={t("title")} raiz tambienEnLaWeb />
      <main id="contenido" className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <h1 className="sr-only">{t("title")}</h1>
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.key} aria-label={g.label} className="mb-5" data-tools-group={g.key}>
            <h2 className="mb-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#7a8797]">{g.label}</h2>
            <ul className="overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
              {g.items.map((i) => (
                <li key={i.key} className="border-b border-[#eef2f6] last:border-b-0">
                  <Link href={i.href} prefetch={false} data-tools-entry={i.key} className="flex min-h-[56px] items-center justify-between gap-3 px-4 text-[16px] font-bold text-[#162543] hover:bg-[#f6f9fb]">
                    {i.label}<ChevronRight className="h-5 w-5 shrink-0 text-[#c2c7cc]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </DirectoryShell>
  );
}
