"use client";

import { cn } from "@/lib/utils";

export type AdminFilterTab = {
  id: string;
  label: string;
};

export function AdminFilterTabs({
  tabs,
  value,
  onChange,
  counts,
}: {
  tabs: readonly AdminFilterTab[];
  value: string;
  onChange: (id: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#eef0f2]">
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "group -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13px] font-semibold transition-colors sm:text-[14px]",
              active ? "border-[#009FD9] text-[#009FD9]" : "border-transparent text-[#6b7280] hover:text-[#162543]",
            )}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={cn(
                  "shrink-0 text-[11px] font-semibold leading-none tabular-nums transition-colors",
                  active ? "text-[#0089bb]" : "text-[#9ca3af] group-hover:text-[#6b7280]",
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
