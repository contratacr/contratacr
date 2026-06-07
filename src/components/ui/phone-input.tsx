"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// One consistent phone field used everywhere. Costa Rica first: 🇨🇷 +506.
// The country selector sets the dial code (non-editable prefix) and the digit
// limit. The stored value is always the FULL number including the country code.
const COUNTRIES = [
  { code: "506", flag: "🇨🇷", name: "Costa Rica", nationalLen: 8 },
  { code: "1",   flag: "🇺🇸", name: "Estados Unidos / Canadá", nationalLen: 10 },
  { code: "52",  flag: "🇲🇽", name: "México", nationalLen: 10 },
  { code: "57",  flag: "🇨🇴", name: "Colombia", nationalLen: 10 },
  { code: "34",  flag: "🇪🇸", name: "España", nationalLen: 9 },
  { code: "86",  flag: "🇨🇳", name: "China", nationalLen: 11 },
  { code: "55",  flag: "🇧🇷", name: "Brasil", nationalLen: 11 },
  { code: "54",  flag: "🇦🇷", name: "Argentina", nationalLen: 10 },
  { code: "507", flag: "🇵🇦", name: "Panamá", nationalLen: 8 },
  { code: "505", flag: "🇳🇮", name: "Nicaragua", nationalLen: 8 },
  { code: "502", flag: "🇬🇹", name: "Guatemala", nationalLen: 8 },
  { code: "504", flag: "🇭🇳", name: "Honduras", nationalLen: 8 },
  { code: "503", flag: "🇸🇻", name: "El Salvador", nationalLen: 8 },
  { code: "51",  flag: "🇵🇪", name: "Perú", nationalLen: 9 },
  { code: "56",  flag: "🇨🇱", name: "Chile", nationalLen: 9 },
  { code: "593", flag: "🇪🇨", name: "Ecuador", nationalLen: 9 },
  { code: "598", flag: "🇺🇾", name: "Uruguay", nationalLen: 8 },
  { code: "595", flag: "🇵🇾", name: "Paraguay", nationalLen: 9 },
  { code: "591", flag: "🇧🇴", name: "Bolivia", nationalLen: 8 },
  { code: "39",  flag: "🇮🇹", name: "Italia", nationalLen: 10 },
  { code: "33",  flag: "🇫🇷", name: "Francia", nationalLen: 9 },
  { code: "49",  flag: "🇩🇪", name: "Alemania", nationalLen: 11 },
  { code: "44",  flag: "🇬🇧", name: "Reino Unido", nationalLen: 10 },
] as const;

// Longest dial codes first so prefix detection isn't greedy (e.g. 506 before 50).
const CODES_BY_LEN = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);

interface PhoneInputProps {
  /** Stored value: CR = 8 national digits; international = full digits incl. code. */
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
  // Detect the active country + national digits from the stored value.
  const { country, national } = useMemo(() => {
    const clean = (value ?? "").replace(/\D/g, "");
    if (!clean) return { country: COUNTRIES[0], national: "" };
    // Legacy Costa Rica numbers were stored as 8 national digits (no code).
    if (clean.length <= 8 && !clean.startsWith("506")) return { country: COUNTRIES[0], national: clean };
    const match = CODES_BY_LEN.find((c) => clean.startsWith(c.code));
    if (match) return { country: match, national: clean.slice(match.code.length) };
    return { country: COUNTRIES[0], national: clean };
  }, [value]);

  const isCR = country.code === "506";

  function setCountry(code: string) {
    const next = COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
    onChange(`${next.code}${national.slice(0, next.nationalLen)}`);
  }

  function setNational(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, country.nationalLen);
    // Always store the full number with its country code.
    onChange(`${country.code}${digits}`);
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[#374151] block mb-1.5">
          {label}{required && <span className="text-red-500"> *</span>}
          {optional && <span className="text-[#9ca3af] font-normal"> (opcional)</span>}
        </label>
      )}
      <div className="flex items-stretch gap-0">
        <select
          value={country.code}
          onChange={(e) => setCountry(e.target.value)}
          className="shrink-0 h-10 rounded-l-xl border border-r-0 border-[#e5e7eb] bg-[#f3f4f6] pl-3 pr-2 text-sm font-medium text-[#374151] focus:outline-none cursor-pointer"
          aria-label="País"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          value={isCR ? formatCRNational(national) : national}
          onChange={(e) => setNational(e.target.value)}
          className={cn(
            "flex-1 h-10 px-3 rounded-r-xl border text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all",
            error ? "border-red-400" : "border-[#e5e7eb]"
          )}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
