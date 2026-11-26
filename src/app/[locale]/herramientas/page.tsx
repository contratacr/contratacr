import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, BarChart3, Boxes, Briefcase, Building2, CalendarDays, ChevronRight, ClipboardList, Clock, FileSignature, FileText, FolderOpen, HandCoins, Inbox, ListChecks, MapPinned, Receipt, ReceiptText, Repeat, Truck, UserRound, Users, Wallet, Layers, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectoryShell } from "@/components/directory/directory-shell";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { proHubGroups } from "@/lib/pro/hub-sections";
import { PRO_ENABLED } from "@/lib/pro/enabled";

// Herramientas (owner, 2026-11-26): five groups by what the person wants to do (not by how the panel is built); a group
// opens its list of tools with the Pro panel's names. Logged out, the middleware sends a gated tool to login with
// ?redirect= and brings the person back to it. Pro-only page: 404 while PRO_ENABLED is off (production).
export const dynamic = "force-dynamic";

type Tool = { key: string; label: string; href: string };
// Same row as «Mi panel» in production: separate rounded rows, outline icon, name, chevron (owner, 2026-11-26).
const ROW = "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:bg-[#f8fbfd]";
const ICON = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#52627a] [&>svg]:h-5 [&>svg]:w-5";
const TOOL_ICONS: Record<string, LucideIcon> = {
  leads: Inbox, customers: UserRound, agenda: CalendarDays, quotes: FileSignature, projects: ClipboardList, tasks: ListChecks,
  hours: Clock, preparation: MapPinned, payments: Wallet, expenses: Receipt, billing: ReceiptText, statistics: BarChart3,
  company: Building2, team: Users, suppliers: Truck, files: FolderOpen, catalog: Boxes, services: Repeat, editions: Layers,
  cv: FileText, letter: FileText,
};
const GROUPS: { id: string; icon: LucideIcon; keys: string[] }[] = [
  { id: "sales", icon: Users, keys: ["leads", "customers", "agenda", "quotes"] },
  { id: "work", icon: Briefcase, keys: ["projects", "tasks", "hours", "preparation"] },
  { id: "money", icon: HandCoins, keys: ["payments", "expenses", "billing", "statistics"] },
  { id: "company", icon: Building2, keys: ["company", "team", "suppliers", "files", "catalog", "services", "editions"] },
  { id: "free", icon: FileText, keys: ["cv", "letter"] },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("toolsPage");
  return { title: `${t("title")} | ContrataCR`, robots: { index: false, follow: false } };
}

export default async function ToolsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ grupo?: string }> }) {
  if (!PRO_ENABLED) notFound();
  const [{ locale }, { grupo }] = await Promise.all([params, searchParams]);
  const en = locale === "en";
  const t = await getTranslations("toolsPage");
  const byKey = new Map<string, Tool>();
  for (const g of proHubGroups(en, true, null)) for (const i of g.items) {
    if (i.href || i.team) continue;
    byKey.set(i.key, { key: i.key, label: i.label, href: `/dashboard/pro?${new URLSearchParams({ tab: i.tab, ...(i.extra ?? {}) }).toString()}` });
  }
  byKey.set("cv", { key: "cv", label: t("cv"), href: "/dashboard/profesional?tab=cv" });
  byKey.set("letter", { key: "letter", label: t("letter"), href: "/dashboard/profesional?tab=carta" });
  const groups = GROUPS.map((g) => ({ ...g, tools: g.keys.flatMap((k) => byKey.get(k) ?? []) })).filter((g) => g.tools.length);
  const open = groups.find((g) => g.id === grupo) ?? null;
  return (
    <DirectoryShell>
      <SectionHeaderTitle title={t("title")} raiz tambienEnLaWeb />
      <main id="contenido" className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <h1 className="sr-only">{open ? t(`g_${open.id}`) : t("title")}</h1>
        {open ? (
          <section data-tools-group={open.id}>
            <Link href="/herramientas" prefetch={false} data-tools-back className="mb-3 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#0083b0]">
              <ArrowLeft className="h-4 w-4" aria-hidden />{t("title")}
            </Link>
            <h2 className="mb-3 text-[20px] font-extrabold text-[#162543]">{t(`g_${open.id}`)}</h2>
            <ul className="space-y-2">
              {open.tools.map((i) => {
                const Icon = TOOL_ICONS[i.key] ?? Briefcase;
                return (
                  <li key={i.key}>
                    <Link href={i.href} prefetch={false} data-tools-entry={i.key} className={ROW}>
                      <span className={ICON}><Icon aria-hidden /></span>
                      <span className="min-w-0 flex-1 truncate">{i.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <ul className="space-y-2">
            {groups.map(({ id, icon: Icon }) => (
              <li key={id}>
                <Link href={`/herramientas?grupo=${id}`} prefetch={false} data-tools-group-tile={id} className={ROW}>
                  <span className={ICON}><Icon aria-hidden /></span>
                  <span className="min-w-0 flex-1 truncate">{t(`g_${id}`)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </DirectoryShell>
  );
}
