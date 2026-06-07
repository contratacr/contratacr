"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// One consistent phone field. The country selector drives the dial code and the
// exact national digit length. The stored value is ALWAYS the full number with
// its country code (e.g. CR "50688887777"). Flags render as images because
// regional-indicator emoji don't display in <select> on Windows.
type Country = { code: string; iso: string; name: string; len: number };

const COUNTRIES: Country[] = [
  { code: "506", iso: "cr", name: "Costa Rica", len: 8 },
  { code: "1",   iso: "us", name: "Estados Unidos / Canadá", len: 10 },
  { code: "52",  iso: "mx", name: "México", len: 10 },
  { code: "57",  iso: "co", name: "Colombia", len: 10 },
  { code: "34",  iso: "es", name: "España", len: 9 },
  { code: "86",  iso: "cn", name: "China", len: 11 },
  { code: "55",  iso: "br", name: "Brasil", len: 11 },
  { code: "54",  iso: "ar", name: "Argentina", len: 10 },
  { code: "507", iso: "pa", name: "Panamá", len: 8 },
  { code: "505", iso: "ni", name: "Nicaragua", len: 8 },
  { code: "502", iso: "gt", name: "Guatemala", len: 8 },
  { code: "504", iso: "hn", name: "Honduras", len: 8 },
  { code: "503", iso: "sv", name: "El Salvador", len: 8 },
  { code: "51",  iso: "pe", name: "Perú", len: 9 },
  { code: "56",  iso: "cl", name: "Chile", len: 9 },
  { code: "593", iso: "ec", name: "Ecuador", len: 9 },
  { code: "598", iso: "uy", name: "Uruguay", len: 8 },
  { code: "595", iso: "py", name: "Paraguay", len: 9 },
  { code: "591", iso: "bo", name: "Bolivia", len: 8 },
  { code: "39",  iso: "it", name: "Italia", len: 10 },
  { code: "33",  iso: "fr", name: "Francia", len: 9 },
  { code: "49",  iso: "de", name: "Alemania", len: 11 },
  { code: "44",  iso: "gb", name: "Reino Unido", len: 10 },
];

// Longest dial codes first so prefix detection isn't greedy (506 before 50/5).
const CODES_BY_LEN = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);

function detect(value: string): { country: Country; national: string } {
  const clean = (value ?? "").replace(/\D/g, "");
  if (!clean) return { country: COUNTRIES[0], national: "" };
  // Legacy Costa Rica numbers were stored as 8 national digits (no code).
  if (clean.length <= 8 && !clean.startsWith("506")) return { country: COUNTRIES[0], national: clean };
  const match = CODES_BY_LEN.find((c) => clean.startsWith(c.code));
  if (match) return { country: match, national: clean.slice(match.code.length) };
  return { country: COUNTRIES[0], national: clean };
}

/** True when the value has exactly the national digit count for its country. */
export function isPhoneComplete(value: string): boolean {
  const { country, national } = detect(value);
  return national.length === country.len;
}

interface PhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  label?: React.ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  id?: string;
}

function formatCRNational(digits: string): string {
  const d = digits.slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

export function PhoneInput({ value, onChange, label, error, required, optional, id }: PhoneInputProps) {
  // Initialise the selected country from the value once; selection is then
  // driven by internal state so picking a country always "sticks".
  const [code, setCode] = useState(() => detect(value).country.code);
  const country = COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

  // National digits for the *currently selected* country.
  const national = useMemo(() => {
    const clean = (value ?? "").replace(/\D/g, "");
    if (clean.startsWith(code)) return clean.slice(code.length);
    if (code === "506" && clean.length <= 8) return clean; // legacy CR
    return "";
  }, [value, code]);

  const isCR = country.code === "506";
  const complete = national.length === country.len;

  function changeCountry(newCode: string) {
    const next = COUNTRIES.find((c) => c.code === newCode) ?? COUNTRIES[0];
    setCode(newCode);
    onChange(`${next.code}${national.slice(0, next.len)}`);
  }

  function changeNational(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, country.len);
    onChange(`${code}${digits}`);
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[#374151] block mb-1.5">
          {label}{required && <span className="text-red-500"> *</span>}
          {optional && <span className="text-[#9ca3af] font-normal"> (opcional)</span>}
        </label>
      )}
      <div className="flex items-stretch">
        <div className="relative flex h-11 items-center gap-1.5 rounded-l-xl border border-r-0 border-[#e5e7eb] bg-[#f3f4f6] px-2.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://flagcdn.com/24x18/${country.iso}.png`}
            srcSet={`https://flagcdn.com/48x36/${country.iso}.png 2x`}
            width={22}
            height={16}
            alt={country.name}
            className="rounded-[2px] shrink-0 h-4 w-[22px] object-cover"
          />
          <span className="text-sm font-medium text-[#374151] leading-none whitespace-nowrap">+{country.code}</span>
          <select
            value={code}
            onChange={(e) => changeCountry(e.target.value)}
            aria-label="País"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.code}>{c.name} (+{c.code})</option>
            ))}
          </select>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          value={isCR ? formatCRNational(national) : national}
          onChange={(e) => changeNational(e.target.value)}
          aria-invalid={!!error}
          className={cn(
            "flex-1 h-11 px-3 rounded-r-xl border text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all",
            error ? "border-red-400" : "border-[#e5e7eb]"
          )}
        />
      </div>
      {/* Live length hint — enforces exactly N digits for the selected country. */}
      {national.length > 0 && !complete && (
        <p className="text-xs text-amber-600 mt-1">
          {country.name} usa {country.len} dígitos ({national.length}/{country.len}).
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
