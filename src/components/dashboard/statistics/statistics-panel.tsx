"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Phone, ChevronDown } from "lucide-react";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { PANEL_SECTION_SURFACE } from "@/components/dashboard/profile-section-layout";
import { cn } from "@/lib/utils";

type Publication = { id: string; title: string; views: number; whatsapp: number };
type AccountActivity = {
  profile: { views: number; whatsapp: number; calls: number };
  projects: Publication[];
  jobs: Publication[];
  offers: Publication[];
};
type Section = "profile" | "projects" | "jobs" | "offers";
const PUBLICATION_SECTIONS = ["projects", "jobs", "offers"] as const;

export function StatisticsPanel({ professional, callsEnabled }: { professional: boolean; callsEnabled: boolean }) {
  const t = useTranslations("panelStatistics");
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [section, setSection] = useState<Section>(professional ? "profile" : "projects");
  const [activity, setActivity] = useState<AccountActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/dashboard/activity?days=${period}`, { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Activity unavailable");
        return response.json() as Promise<AccountActivity>;
      })
      .then(data => setActivity(data))
      .catch(() => { if (!controller.signal.aborted) { setActivity(null); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period]);

  const sections: Section[] = activity
    ? [...(professional ? ["profile" as const] : []), ...PUBLICATION_SECTIONS.filter(key => activity[key].length > 0)]
    : professional ? ["profile"] : [];
  const activeSection = sections.includes(section) ? section : sections[0];
  const publicationRows = activeSection && activeSection !== "profile" ? activity?.[activeSection] ?? [] : [];

  return <div data-testid="statistics-panel" className={cn(PANEL_SECTION_SURFACE, "text-[#162543] lg:rounded-none lg:border-0 lg:shadow-none")} aria-busy={loading}>
    <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5 lg:px-0">
      <h2 className="text-[15px] font-bold">{t(sections.length > 1 ? "overview" : professional ? "profile" : activeSection ?? "overview")}</h2>
      <div className="relative shrink-0">
        <select aria-label={t("period")} value={period} onChange={event => { setLoading(true); setError(false); setPeriod(Number(event.target.value) as 7 | 30 | 90); }} className="min-h-10 appearance-none rounded-lg border-0 bg-white py-2 pl-3 pr-8 text-[12px] font-semibold hover:bg-[#f7fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]">
          {([7, 30, 90] as const).map(days => <option key={days} value={days}>{t("days", { days })}</option>)}
        </select><ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#68778d]" />
      </div>
    </div>
    {sections.length > 1 && <div className="px-4 pt-4 sm:px-5 lg:px-0">
      <StatusFilterTabs tabs={sections.map(id => ({ id }))} value={activeSection}
        onChange={id => { if (sections.includes(id as Section)) setSection(id as Section); }}
        labelFor={id => t(id === "profile" ? "profileFilter" : id)} variant="chips" limpiable={false} />
    </div>}
    {!activity && <p className="px-4 pb-6 pt-5 text-[13px] text-[#68778d] sm:px-5 lg:px-0" role="status">{t(error ? "loadError" : "loading")}</p>}
    {activity && !activeSection && <p className="px-4 pb-6 pt-5 text-[13px] text-[#68778d] sm:px-5 lg:px-0">{t("empty")}</p>}
    {activity && activeSection === "profile" && <section className="px-4 pt-3 sm:px-5 lg:px-0" aria-label={t("profile")}>
      <div className="divide-y divide-[#eef2f6]">
        <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <span className="flex min-w-0 items-center gap-3 text-[13px] font-medium text-[#526277]"><Eye className="h-[18px] w-[18px] shrink-0 text-[#009FD9]" aria-hidden />{t("profileViews")}</span>
          <strong className="shrink-0 text-[22px] font-bold leading-none tabular-nums text-[#162543]">{activity.profile.views}</strong>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <span className="flex min-w-0 items-center gap-3 text-[13px] font-medium text-[#526277]"><WhatsAppLogo className="h-[18px] w-[18px] shrink-0 text-[#009FD9]" aria-hidden />{t("whatsapp")}</span>
          <strong className="shrink-0 text-[22px] font-bold leading-none tabular-nums text-[#162543]">{activity.profile.whatsapp}</strong>
        </div>
        {callsEnabled && <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <span className="flex min-w-0 items-center gap-3 text-[13px] font-medium text-[#526277]"><Phone className="h-[18px] w-[18px] shrink-0 text-[#009FD9]" aria-hidden />{t("calls")}</span>
          <strong className="shrink-0 text-[22px] font-bold leading-none tabular-nums text-[#162543]">{activity.profile.calls}</strong>
        </div>}
      </div>
    </section>}
    {activity && activeSection !== "profile" && activeSection && <section className="px-4 pb-4 pt-5 sm:px-5 lg:px-0" aria-label={t(activeSection)}>
      <div className="hidden grid-cols-[1fr_85px_110px] gap-4 border-b border-[#e5e7eb] py-3 text-right text-xs font-medium text-[#68778d] sm:grid"><span className="text-left">{t("post")}</span><span>{t("views")}</span><span>{t("whatsapp")}</span></div>
      {publicationRows.map(row => <div key={row.id} className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-[#eef2f6] py-4 last:border-b-0 sm:grid-cols-[1fr_85px_110px] sm:items-center sm:gap-4">
        <p className="col-span-2 text-[14px] font-semibold leading-5 sm:col-span-1">{row.title}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-[#526277] sm:justify-end sm:text-[13px]"><Eye className="h-4 w-4 text-[#009FD9]" aria-hidden /><strong className="text-[#162543]">{row.views}</strong><span className="sm:hidden">{t("views").toLowerCase()}</span></div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#526277] sm:justify-end sm:text-[13px]"><WhatsAppLogo className="h-4 w-4 text-[#009FD9]" aria-hidden /><strong className="text-[#162543]">{row.whatsapp}</strong><span className="sm:hidden">{t("clickShort")}</span></div>
      </div>)}
    </section>}
    {activity && activeSection && <p className="px-4 pb-4 pt-1 text-[11px] leading-[18px] text-[#68778d] sm:px-5 lg:px-0">{t(callsEnabled ? "note" : "noteWithoutCalls")}</p>}
  </div>;
}
