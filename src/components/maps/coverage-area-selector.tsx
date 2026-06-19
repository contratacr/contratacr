"use client";

import { useState } from "react";
import { MapPin, Plus, X, Globe } from "lucide-react";
import { PROVINCES, getCantonsByProvince, getProvinceById, getCantonById } from "@/lib/data/cr-geography";
import type { CoverageArea, CoverageLevel } from "@/lib/location";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";

// Hierarchical travel coverage for "me desplazo donde el cliente". The pro can add
// coverage at three levels and mix them: a specific cantón, an ENTIRE provincia, or
// the WHOLE country. /buscar respects the hierarchy (no one is excluded for choosing
// a broader level).
export function CoverageAreaSelector({
  value,
  onChange,
}: {
  value: CoverageArea[];
  onChange: (next: CoverageArea[]) => void;
}) {
  const [level, setLevel] = useState<CoverageLevel>("canton");
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const cantons = getCantonsByProvince(province);

  const hasCountry = value.some((a) => (a.level ?? "canton") === "country");

  function add() {
    if (level === "country") {
      if (hasCountry) return;
      onChange([...value, { level: "country" }]);
      return;
    }
    if (level === "provincia") {
      if (!province) return;
      if (value.some((a) => (a.level ?? "canton") === "provincia" && a.provinciaId === province)) { return; }
      onChange([...value, { level: "provincia", provinciaId: province, provinceName: getProvinceById(province)?.name }]);
      setProvince("");
      return;
    }
    // canton
    if (!province || !canton) return;
    if (value.some((a) => (a.level ?? "canton") === "canton" && a.cantonId === canton)) { setCanton(""); return; }
    onChange([
      ...value,
      { level: "canton", provinciaId: province, cantonId: canton, provinceName: getProvinceById(province)?.name, cantonName: getCantonById(canton)?.name },
    ]);
    setCanton("");
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function labelFor(a: CoverageArea): { icon: React.ReactNode; text: string } {
    const lvl = a.level ?? (a.cantonId ? "canton" : "provincia");
    if (lvl === "country") return { icon: <Globe className="h-3.5 w-3.5" />, text: "Todo el país" };
    if (lvl === "provincia") return { icon: <MapPin className="h-3.5 w-3.5" />, text: `Toda ${a.provinceName ?? getProvinceById(a.provinciaId ?? "")?.name}` };
    return { icon: <MapPin className="h-3.5 w-3.5" />, text: `${a.cantonName ?? getCantonById(a.cantonId ?? "")?.name}, ${a.provinceName ?? getProvinceById(a.provinciaId ?? "")?.name}` };
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Level selector */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { id: "canton", label: "Un cantón" },
          { id: "provincia", label: "Toda una provincia" },
          { id: "country", label: "Todo el país" },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLevel(opt.id)}
            className={cn(
              "px-2 py-1.5 rounded-lg text-xs font-medium border-2 transition-all",
              level === opt.id ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] text-[#374151] hover:border-[#009FD9]/40"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {level !== "country" && (
        <div className={cn("grid gap-2", level === "canton" ? "grid-cols-2" : "grid-cols-1")}>
          <SelectMenu
            value={province}
            onChange={(v) => { setProvince(v); setCanton(""); }}
            placeholder="Provincia"
            options={PROVINCES.map((p) => ({ value: p.id, label: p.name }))}
          />
          {level === "canton" && (
            <SelectMenu
              value={canton}
              onChange={setCanton}
              disabled={!province}
              placeholder="Cantón"
              options={cantons.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        disabled={(level === "canton" && (!province || !canton)) || (level === "provincia" && !province) || (level === "country" && hasCountry)}
        className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Agregar zona de cobertura
      </button>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {value.map((a, idx) => {
            const { icon, text } = labelFor(a);
            return (
              <span key={idx} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-2.5 pr-1.5 py-1">
                {icon}
                {text}
                <button type="button" onClick={() => remove(idx)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
