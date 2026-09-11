"use client";

import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { getCategoryGroupLabel, getCategoryLabel, normalizeCategoryGroupId, sortCategoryGroups, type CategoryItem } from "@/lib/data/categories";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";

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
  const normalizedGroups = useMemo(() => {
    const byId = new Map<string, CategoryPickerGroup>();
    for (const group of groups) {
      const id = normalizeCategoryGroupId(group.id, group.label);
      const existing = byId.get(id);
      if (existing) existing.items.push(...group.items);
      else byId.set(id, { ...group, id, items: [...group.items] });
    }
    return sortCategoryGroups(Array.from(byId.values()));
  }, [groups]);
  const activeGroup = activeGroupId ? normalizedGroups.find((g) => g.id === activeGroupId) ?? null : null;

  if (activeGroup) {
    return (
      <div className={cn("flex flex-col", className)}>
        {/* La vuelta atrás dice ADEMÁS dónde estás: «‹ Hogar» resuelve las dos
            preguntas de golpe (en qué categoría entré y cómo salgo). Antes decía
            «Volver a servicios», que se confundía con la sección Servicios y no
            daba ninguna pista del lugar. */}
        <button
          type="button"
          onClick={() => onActiveGroupChange(null)}
          aria-label={backLabel}
          className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[#EBF5FB]"
        >
          <ChevronLeft className="h-5 w-5 shrink-0 text-[#009FD9]" />
          <span className="min-w-0 truncate text-[15px] font-bold text-[#162543]">
            {activeGroup.label ?? getCategoryGroupLabel(activeGroup.id, locale)}
          </span>
        </button>
        <div className="grid grid-cols-1">
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
    <div className={cn("grid grid-cols-1", className)}>
      {normalizedGroups.map((group) => {
        const IconoFamilia = getCategoryGroupIcon(group.id);
        return (
        <button
          key={group.id}
          type="button"
          onClick={() => onActiveGroupChange(group.id)}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#f9fafb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/20",
            groupClassName
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef8fc] text-[#009FD9]">
            <IconoFamilia className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#162543] [overflow-wrap:anywhere]">
              {getCategoryGroupLabel(group.id, locale)}
            </span>
            <span className="mt-0.5 block text-xs text-[#68778d]">
              {countLabel ? countLabel(group.items.length) : `${group.items.length}`}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#009FD9]" />
        </button>
        );
      })}
    </div>
  );
}
