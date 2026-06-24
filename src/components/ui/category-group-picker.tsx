"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { getCategoryGroupLabel, getCategoryLabel, type CategoryItem } from "@/lib/data/categories";

export type CategoryPickerGroup = {
  id: string;
  label?: string;
  items: (CategoryItem & { groupId?: string; groupLabel?: string })[];
};

export function CategoryGroupPicker({
  groups,
  activeGroupId,
  onActiveGroupChange,
  onSelect,
  selectedId,
  backLabel = "Volver",
  countLabel,
  optionAction,
  className,
  groupClassName,
  optionClassName,
}: {
  groups: CategoryPickerGroup[];
  activeGroupId: string | null;
  onActiveGroupChange: (id: string | null) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
  backLabel?: string;
  countLabel?: (count: number) => string;
  optionAction?: ReactNode;
  className?: string;
  groupClassName?: string;
  optionClassName?: string;
}) {
  const locale = useLocale();
  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null;

  if (activeGroup) {
    return (
      <div className={cn("flex flex-col", className)}>
        <button
          type="button"
          onClick={() => onActiveGroupChange(null)}
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#009FD9] transition-colors hover:bg-[#EBF5FB]"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          {backLabel}
        </button>
        <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
          {getCategoryGroupLabel(activeGroup.id, locale)}
        </p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {activeGroup.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                selectedId === item.id
                  ? "bg-[#EBF5FB] text-[#009FD9]"
                  : "text-[#374151] hover:bg-[#f9fafb] hover:text-[#0089bb]",
                optionClassName
              )}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{getCategoryLabel(item.id, locale)}</span>
              {optionAction}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 gap-1", className)}>
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onActiveGroupChange(group.id)}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#f9fafb] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20",
            groupClassName
          )}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#162543] [overflow-wrap:anywhere]">
              {getCategoryGroupLabel(group.id, locale)}
            </span>
            <span className="mt-0.5 block text-xs text-[#9ca3af]">
              {countLabel ? countLabel(group.items.length) : `${group.items.length}`}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#009FD9]" />
        </button>
      ))}
    </div>
  );
}
