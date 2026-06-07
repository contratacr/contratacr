"use client";

import { Input } from "@/components/ui/input";
import { cleanId, formatId, detectIdType, idTypeLabel } from "@/lib/cedula";

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
}

const DEFAULT_HINT = "CR: 9 dígitos · DIMEX: 11-12 · NITE: 10";

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
}: CedulaInputProps) {
  const type = detectIdType(value);
  const label = (
    <span className="flex items-center justify-between gap-2">
      <span>
        Número de identificación
        {required ? (
          <span className="text-red-500"> *</span>
        ) : (
          <span className="text-[#9ca3af] font-normal"> (opcional)</span>
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
      type="text"
      inputMode="numeric"
      pattern="[0-9-]*"
      autoComplete="off"
      maxLength={14}
      placeholder="1-0000-0000"
      hint={hint ?? DEFAULT_HINT}
      error={error}
      autoFocus={autoFocus}
      aria-invalid={!!error}
    />
  );
}
