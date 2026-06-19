"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cleanId, formatId, detectIdType, idTypeLabel, isValidId } from "@/lib/cedula";

interface CedulaInputProps {
  /** Stored value: clean digits only (no hyphens). */
  value: string;
  onChange: (clean: string) => void;
  /** Drives the label suffix: true → red "*", false → "(opcional)". */
  required?: boolean;
  error?: string;
  id?: string;
  autoFocus?: boolean;
  /** Override the default helper text. */
  hint?: string;
  disabled?: boolean;
  /** Override the default "Número de identificación" label (e.g. "…de la otra persona"). */
  labelText?: string;
}

/**
 * Shared Costa Rican identification field — masks as the user types, stores
 * clean digits, auto-detects the document type, and validates by length only.
 * Accepts cédula nacional, DIMEX and NITE — hence the neutral label.
 */
export function CedulaInput({
  value,
  onChange,
  required = false,
  error,
  id = "identificacion",
  autoFocus,
  hint,
  disabled,
  labelText,
}: CedulaInputProps) {
  const t = useTranslations("identity");
  const [touched, setTouched] = useState(false);
  const type = detectIdType(value);
  // Smart validation (replaces the old fixed "CR: 9 dígitos · DIMEX…" helper text):
  // nothing shows until the user leaves the field with a number that doesn't match
  // any valid CR id length (cédula 9 · NITE 10 · DIMEX 11–12) → a single friendly
  // warning. A valid format (or an empty field) shows nothing. An explicit `error`
  // from the parent (e.g. "already registered") always wins.
  const formatWarning = touched && value.length > 0 && !isValidId(value) ? t("idIncomplete") : undefined;
  const shownError = error ?? formatWarning;
  const label = (
    <span className="flex items-center justify-between gap-2">
      <span>
        {labelText ?? t("idLabel")}
        {required ? (
          <span className="text-red-500"> *</span>
        ) : (
          <span className="text-[#9ca3af] font-normal"> {t("optional")}</span>
        )}
      </span>
      {type && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#009FD9] bg-[#EBF5FB] rounded px-1.5 py-0.5 shrink-0">
          {idTypeLabel(type)}
        </span>
      )}
    </span>
  );

  return (
    <Input
      id={id}
      label={label}
      value={formatId(value)}
      onChange={(e) => onChange(cleanId(e.target.value))}
      onBlur={() => setTouched(true)}
      type="text"
      inputMode="numeric"
      pattern="[0-9-]*"
      autoComplete="off"
      maxLength={14}
      placeholder="1-0000-0000"
      hint={hint}
      error={shownError}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-invalid={!!shownError}
    />
  );
}
