import { BarChart3, Boxes, Briefcase, Building2, CalendarDays, ClipboardList, Clock, FileSignature, FileText, FolderOpen, HandCoins, Inbox, Layers, ListChecks, MapPinned, Receipt, ReceiptText, Repeat, Truck, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";
import { proHubGroups } from "@/lib/pro/hub-sections";

// «Herramientas» (owner, 2026-11-26/27): ONE catalogue for the public page (/herramientas, logged out) and the section of
// «Mi panel» (?tab=tools, logged in). Five groups by what the person wants to do; each tool keeps the Pro panel's name.
// Pure data (no server imports): the panel is a client component.
export type ToolsGroupId = "sales" | "work" | "money" | "company" | "free";
export type ToolsTool = { key: string; label: string; href: string; icon: LucideIcon; panelTab?: "cv" | "carta" };
export type ToolsGroup = { id: ToolsGroupId; label: string; icon: LucideIcon; tools: ToolsTool[] };

const TOOL_ICONS: Record<string, LucideIcon> = {
  leads: Inbox, customers: UserRound, agenda: CalendarDays, quotes: FileSignature, projects: ClipboardList, tasks: ListChecks,
  hours: Clock, preparation: MapPinned, payments: Wallet, expenses: Receipt, billing: ReceiptText, statistics: BarChart3,
  company: Building2, team: Users, suppliers: Truck, files: FolderOpen, catalog: Boxes, services: Repeat, editions: Layers,
  cv: FileText, letter: FileText,
};
const GROUPS: { id: ToolsGroupId; icon: LucideIcon; es: string; en: string; keys: string[] }[] = [
  { id: "sales", icon: Users, es: "Clientes y ventas", en: "Customers and sales", keys: ["leads", "customers", "agenda", "quotes"] },
  { id: "work", icon: Briefcase, es: "Trabajos y proyectos", en: "Jobs and projects", keys: ["projects", "tasks", "hours", "preparation"] },
  { id: "money", icon: HandCoins, es: "Finanzas", en: "Finances", keys: ["payments", "expenses", "billing", "statistics"] },
  { id: "company", icon: Building2, es: "Mi empresa", en: "My company", keys: ["company", "team", "suppliers", "files", "catalog", "services", "editions"] },
  { id: "free", icon: FileText, es: "Búsqueda de empleo", en: "Job search", keys: ["cv", "letter"] },
];

export const TOOLS_TITLE = { es: "Herramientas", en: "Tools" } as const;
export const TOOLS_GROUP_IDS: readonly ToolsGroupId[] = GROUPS.map((g) => g.id);
export function isToolsGroupId(value: string | null | undefined): value is ToolsGroupId {
  return !!value && (TOOLS_GROUP_IDS as readonly string[]).includes(value);
}

/** The five groups with their tools (hrefs without locale prefix; the i18n Link adds it). */
export function toolsCatalog(en: boolean): ToolsGroup[] {
  const byKey = new Map<string, ToolsTool>();
  for (const g of proHubGroups(en, true, null)) for (const i of g.items) {
    if (i.href || i.team) continue;
    byKey.set(i.key, { key: i.key, label: i.label, icon: TOOL_ICONS[i.key] ?? Briefcase, href: `/dashboard/pro?${new URLSearchParams({ tab: i.tab, ...(i.extra ?? {}) }).toString()}` });
  }
  byKey.set("cv", { key: "cv", label: en ? "Resume" : "Currículum", icon: FileText, href: "/dashboard/profesional?tab=cv", panelTab: "cv" });
  byKey.set("letter", { key: "letter", label: en ? "Cover letter" : "Carta de presentación", icon: FileText, href: "/dashboard/profesional?tab=carta", panelTab: "carta" });
  return GROUPS.map((g) => ({ id: g.id, icon: g.icon, label: en ? g.en : g.es, tools: g.keys.flatMap((k) => byKey.get(k) ?? []) })).filter((g) => g.tools.length);
}

// Same row as «Mi panel» in production: separate rounded rows, grey outline icon, name that wraps (never cut), chevron.
export const TOOLS_ROW = "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:bg-[#f8fbfd]";
export const TOOLS_ROW_ICON = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#52627a] [&>svg]:h-5 [&>svg]:w-5";
