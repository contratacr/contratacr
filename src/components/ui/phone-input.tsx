"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// One consistent phone field used everywhere. Costa Rica first: 🇨🇷 +506 prefix
// (non-editable) with an 8-digit input formatted XXXX-XXXX. An "Otro país"
// option reveals an international entry (country code + number).
const COUNTRIES = [
  { code: "506", flag: "🇨🇷", name: "Costa Rica", nationalLen: 8 },
  { code: "1",   flag: "🇺🇸", name: "EE.UU. / Canadá", nationalLen: 10 },
  { code: "505", flag: "🇳🇮", name: "Nicaragua", nationalLen: 8 },
  { code: "507", flag: "🇵🇦", name: "Panamá", nationalLen: 8 },
  { code: "52",  flag: "🇲🇽", name: "México", nationalLen: 10 },
] as const;

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
  // Detect the active country from the stored value.
  const { country, national } = useMemo(() => {
    const clean = (value ?? "").replace(/\D/g, "");
    if (!clean || clean.length <= 8) return { country: COUNTRIES[0], national: clean };
    if (clean.startsWith("506")) return { country: COUNTRIES[0], national: clean.slice(3) };
    const match = COUNTRIES.find((c) => c.code !== "506" && clean.startsWith(c.code));
    if (match) return { country: match, national: clean.slice(match.code.length) };
    return { country: COUNTRIES[0], national: clean.slice(0, 8) };
  }, [value]);

  const isCR = country.code === "506";

  function setCountry(code: string) {
    const next = COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
    if (next.code === "506") onChange(national.slice(0, next.nationalLen));
    else onChange(`${next.code}${national.slice(0, next.nationalLen)}`);
  }

  function setNational(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, country.nationalLen);
    if (isCR) onChange(digits);
    else onChange(`${country.code}${digits}`);
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[#374151] block mb-1.5">
          {label}{required && " *"}
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
