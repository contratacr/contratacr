"use client";

import { useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { PROVINCES, getCantonsByProvince, getProvinceById, getCantonById } from "@/lib/data/cr-geography";
import type { CoverageArea } from "@/lib/location";
import { cn } from "@/lib/utils";

// Coverage areas for "me desplazo donde el cliente": the pro picks one or more
// provincia+cantón pairs they travel to. This is the ONLY place we ask for a
// manual provincia/cantón — fixed locations derive theirs from map pins.
export function CoverageAreaSelector({
  value,
  onChange,
}: {
  value: CoverageArea[];
  onChange: (next: CoverageArea[]) => void;
}) {
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const cantons = getCantonsByProvince(province);

  function add() {
    if (!province || !canton) return;
    if (value.some((a) => a.cantonId === canton)) { setCanton(""); return; }
    onChange([
      ...value,
      {
        provinciaId: province,
        cantonId: canton,
        provinceName: getProvinceById(province)?.name,
        cantonName: getCantonById(canton)?.name,
      },
    ]);
    setCanton("");
  }

  function remove(cantonId: string) {
    onChange(value.filter((a) => a.cantonId !== cantonId));
  }

  const selectCls =
    "h-10 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <select value={province} onChange={(e) => { setProvince(e.target.value); setCanton(""); }} className={cn(selectCls, "cursor-pointer")}>
          <option value="">Provincia</option>
          {PROVINCES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={canton} onChange={(e) => setCanton(e.target.value)} disabled={!province} className={cn(selectCls, "cursor-pointer", !province && "opacity-50")}>
          <option value="">{province ? "Cantón" : "Primero provincia"}</option>
          {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button
        type="button"
        onClick={add}
        disabled={!province || !canton}
        className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Agregar zona de cobertura
      </button>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {value.map((a) => (
            <span key={a.cantonId} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-2.5 pr-1.5 py-1">
              <MapPin className="h-3.5 w-3.5" />
              {a.cantonName ?? getCantonById(a.cantonId)?.name}, {a.provinceName ?? getProvinceById(a.provinciaId)?.name}
              <button type="button" onClick={() => remove(a.cantonId)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
