"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Period = "morning" | "afternoon" | "evening";
type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type AvailabilityMap = Record<Day, Record<Period, boolean>>;

const DAYS: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const PERIODS: Period[] = ["morning", "afternoon", "evening"];

const DEFAULT_AVAILABILITY: AvailabilityMap = Object.fromEntries(
  DAYS.map((d) => [d, { morning: false, afternoon: false, evening: false }])
) as AvailabilityMap;

interface AvailabilityEditorProps {
  professionalId: string;
  initialAvailability?: AvailabilityMap;
}

export function AvailabilityEditor({ professionalId, initialAvailability }: AvailabilityEditorProps) {
  const t = useTranslations("dashboard.pro.availability");
  const [availability, setAvailability] = useState<AvailabilityMap>(
    initialAvailability ?? DEFAULT_AVAILABILITY
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(day: Day, period: Period) {
    setAvailability((prev) => ({
      ...prev,
      [day]: { ...prev[day], [period]: !prev[day][period] },
    }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("professionals")
      .update({ availability })
      .eq("id", professionalId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-5">{t("hint")}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-[#9ca3af] pb-3 pr-4 w-28" />
              {PERIODS.map((period) => (
                <th key={period} className="text-center text-xs font-semibold text-[#374151] pb-3 px-2">
                  {t(`periods.${period}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {DAYS.map((day) => (
              <tr key={day}>
                <td className="py-3 pr-4 text-sm font-medium text-[#374151]">
                  {t(`days.${day}`)}
                </td>
                {PERIODS.map((period) => {
                  const active = availability[day][period];
                  return (
                    <td key={period} className="py-3 px-2 text-center">
                      <button
                        onClick={() => toggle(day, period)}
                        className={cn(
                          "w-10 h-10 rounded-xl border-2 transition-all duration-150 mx-auto flex items-center justify-center",
                          active
                            ? "bg-[#009FD9] border-[#009FD9] text-white"
                            : "border-[#e5e7eb] text-[#d1d5db] hover:border-[#009FD9]/40"
                        )}
                        aria-label={`${t(`days.${day}`)} ${t(`periods.${period}`)}`}
                      >
                        {active ? (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} loading={saving} disabled={saving}>
          {saving ? t("saving") : saved ? t("saved") : t("save")}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">✓ {t("saved")}</span>
        )}
      </div>
    </div>
  );
}
