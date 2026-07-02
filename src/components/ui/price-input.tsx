"use client";

import { cn } from "@/lib/utils";
import { clampMoneyDigits, MAX_MONEY_AMOUNT } from "@/lib/money-limits";

// Numeric-only price field. Accepts digits ONLY — never letters or symbols.
// Stores/returns a clean digit string (no separators). Use everywhere a price
// or budget amount is entered.
interface PriceInputProps {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  className?: string;
  /** Show the ₡ prefix inside the field. */
  colonPrefix?: boolean;
  /** Compact text shown inside the field after the amount, e.g. I.V.A.I. */
  suffix?: string;
  id?: string;
  maxLength?: number;
}

export function PriceInput({
  value,
  onChange,
  placeholder,
  className,
  colonPrefix = true,
  suffix,
  id,
  maxLength = String(MAX_MONEY_AMOUNT).length,
}: PriceInputProps) {
  function handle(raw: string) {
    onChange(clampMoneyDigits(raw).slice(0, maxLength));
  }

  return (
    <div className="relative">
      {colonPrefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9ca3af] pointer-events-none">₡</span>
      )}
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-[0.04em] text-[#9ca3af]">
          {suffix}
        </span>
      )}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handle(e.target.value)}
        onKeyDown={(e) => {
          // Block the characters type="number" would otherwise allow.
          if (["e", "E", "+", "-", ".", ","].includes(e.key)) e.preventDefault();
        }}
        className={cn(
          "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white pr-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all",
          colonPrefix ? "pl-7" : "pl-3",
          suffix && "pr-[4.75rem]",
          className
        )}
      />
    </div>
  );
}
