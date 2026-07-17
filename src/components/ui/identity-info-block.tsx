"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { formatId } from "@/lib/cedula";
import { computeAge, formatAge } from "@/lib/age";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";

// Shared confirmation block shown after a cedula -> padron lookup or for stored
// identity data. Keep the visual calm: title as context, official name as primary
// information, and ID details as secondary fields.
export function IdentityInfoBlock({
  fullName,
  cedula,
  dob,
  verified = true,
  showOfficialNameNotice = false,
  onReset,
  resetLabel,
}: {
  fullName: string;
  cedula?: string;
  dob?: string | null;
  verified?: boolean;
  showOfficialNameNotice?: boolean;
  onReset?: () => void;
  resetLabel?: string;
}) {
  const t = useTranslations("identity");
  const age = dob ? computeAge(dob) : null;

  return (
    <div className="rounded-2xl border border-[#bae6fd] bg-[#f8fbff] px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <BrandIconBadge icon={ShieldCheck} size={36} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          {verified && <p className="text-xs font-semibold text-[#64748b]">{t("confirmed")}</p>}
          <p className="mt-0.5 text-base font-semibold leading-snug text-[#0f172a]">{fullName}</p>

          <dl className="mt-3 grid gap-2 text-sm">
            {cedula && (
              <div>
                <dt className="text-xs font-medium text-[#64748b]">{t("cedulaLabel")}</dt>
                <dd className="mt-0.5 font-semibold text-[#0f172a]">{formatId(cedula)}</dd>
              </div>
            )}

            {dob && (
              <div>
                <dt className="text-xs font-medium text-[#64748b]">{t("dobLabel")}</dt>
                <dd className="mt-0.5 font-semibold text-[#0f172a]">
                  {dob}
                  {age ? ` · ${formatAge(age)}` : ""}
                </dd>
              </div>
            )}
          </dl>

          {showOfficialNameNotice && (
            <p className="mt-2 text-xs leading-5 text-[#475569]">{t("officialNameNotice")}</p>
          )}

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="mt-2 text-xs text-[#6b7280] underline hover:text-[#374151]"
            >
              {resetLabel ?? t("notYourInfo")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
