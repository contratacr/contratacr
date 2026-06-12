"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { formatId } from "@/lib/cedula";
import { computeAge, formatAge } from "@/lib/age";

// Shared confirmation block shown after a cédula→padrón lookup (or for stored
// info). Displays the official name, cédula, and — when a birth date is available
// — DOB + computed age. Always offers a "¿No es tu información?" correction link.
// NOTE: the TSE padrón carries no birth date, so DOB/age only appear when entered
// manually (e.g. a beneficiary without a cédula) or from a future data source.
export function IdentityInfoBlock({
  fullName,
  cedula,
  dob,
  verified = true,
  onReset,
  resetLabel,
}: {
  fullName: string;
  cedula?: string;
  dob?: string | null;
  verified?: boolean;
  onReset?: () => void;
  resetLabel?: string;
}) {
  const t = useTranslations("identity");
  const age = dob ? computeAge(dob) : null;
  return (
    <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-[#15803d] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {verified && <p className="text-xs font-semibold text-[#15803d]">{t("confirmed")}</p>}
          <p className="text-base font-bold text-[#111827] mt-0.5">{fullName}</p>
          <dl className="mt-1 space-y-0.5 text-xs text-[#374151]">
            {cedula && (
              <div className="flex gap-1.5">
                <dt className="text-[#6b7280]">{t("cedulaLabel")}</dt>
                <dd className="font-medium">{formatId(cedula)}</dd>
              </div>
            )}
            {dob && (
              <div className="flex gap-1.5">
                <dt className="text-[#6b7280]">{t("dobLabel")}</dt>
                <dd className="font-medium">{dob}{age ? ` · ${formatAge(age)}` : ""}</dd>
              </div>
            )}
          </dl>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-[#6b7280] underline mt-2 hover:text-[#374151]"
            >
              {resetLabel ?? t("notYourInfo")}
            </button>
          )}
        </div>
        {verified && <CheckCircle2 className="h-5 w-5 text-[#15803d] shrink-0" />}
      </div>
    </div>
  );
}
