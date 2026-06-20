"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { SelectMenu } from "@/components/ui/select-menu";

// A date-of-birth picker built from three dropdowns — Día · Mes · Año (dd/mm/yyyy
// order, the Costa Rica convention) — instead of a native <input type="date">. A
// native date calendar makes picking a BIRTH year painful (you page month by month);
// here the year is a plain dropdown you scroll once. Emits / accepts an ISO
// `YYYY-MM-DD` string so storage is unchanged.

const MONTHS = {
  es: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
} as const;

/** Days in a 1-based month of a year (defaults to 31 until month+year are known). */
function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

/** ISO `YYYY-MM-DD` → `dd/mm/yyyy` for display (CR format). Empty/invalid → "". */
export function formatDobDMY(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

export function DateOfBirthPicker({
  value,
  onChange,
  max,
  minYear = 1915,
  id,
}: {
  /** ISO `YYYY-MM-DD` or "" */
  value: string;
  onChange: (iso: string) => void;
  /** Max ISO date allowed (defaults to today) — caps the year list. */
  max?: string;
  minYear?: number;
  id?: string;
}) {
  const locale = useLocale();
  const months = MONTHS[locale === "en" ? "en" : "es"];
  const ph = locale === "en"
    ? { d: "Day", m: "Month", y: "Year" }
    : { d: "Día", m: "Mes", y: "Año" };

  const maxYear = (max ? new Date(`${max}T00:00:00`) : new Date()).getFullYear();

  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  // Adopt the external value only when it really differs from what we compose locally,
  // so emitting an INCOMPLETE selection (which sends "") never wipes the in-progress parts.
  useEffect(() => {
    const localIso = year && month && day ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
    if ((value || "") === localIso) return;
    const [y, m, d] = (value || "").split("-");
    setYear(y && d ? y : "");
    setMonth(m ? String(parseInt(m, 10)) : "");
    setDay(d ? String(parseInt(d, 10)) : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => {
    const arr: { value: string; label: string }[] = [];
    for (let yr = maxYear; yr >= minYear; yr--) arr.push({ value: String(yr), label: String(yr) });
    return arr;
  }, [maxYear, minYear]);

  const monthOpts = useMemo(() => months.map((name, i) => ({ value: String(i + 1), label: name })), [months]);

  const dim = daysInMonth(parseInt(year, 10), parseInt(month, 10));
  const dayOpts = useMemo(() => {
    const arr: { value: string; label: string }[] = [];
    for (let dd = 1; dd <= dim; dd++) arr.push({ value: String(dd), label: String(dd) });
    return arr;
  }, [dim]);

  function commit(nd: string, nm: string, ny: string) {
    // Clamp the day to the chosen month's length (e.g. 31 → Feb becomes 28/29).
    if (nd && nm && ny) {
      const max2 = daysInMonth(parseInt(ny, 10), parseInt(nm, 10));
      if (parseInt(nd, 10) > max2) nd = String(max2);
    }
    setDay(nd); setMonth(nm); setYear(ny);
    onChange(nd && nm && ny ? `${ny}-${nm.padStart(2, "0")}-${nd.padStart(2, "0")}` : "");
  }

  return (
    <div className="grid grid-cols-3 gap-2" id={id}>
      <SelectMenu value={day} onChange={(v) => commit(v, month, year)} placeholder={ph.d} options={dayOpts} />
      <SelectMenu value={month} onChange={(v) => commit(day, v, year)} placeholder={ph.m} options={monthOpts} />
      <SelectMenu value={year} onChange={(v) => commit(day, month, v)} placeholder={ph.y} options={years} />
    </div>
  );
}
