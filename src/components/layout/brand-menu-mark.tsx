import { ChevronDown } from "lucide-react";
import { ContrataCRMark } from "@/components/brand/brand-logo";

/** The ContrataCR symbol as the menu button: a small round badge with a chevron on its lower right corner (like an
 * account switcher), instead of a loose arrow beside the logo. The badge turns while pressed. */
export function BrandMenuMark() {
  return (
    <span className="relative inline-flex shrink-0">
      <ContrataCRMark />
      <span aria-hidden className="absolute -bottom-1 -right-1.5 grid h-[17px] w-[17px] place-items-center rounded-full bg-white shadow-[0_1px_4px_rgba(22,37,67,0.28)] ring-1 ring-[#dfe7ee]">
        <ChevronDown className="h-3 w-3 text-[#162543] transition-transform duration-200 group-active:rotate-180" strokeWidth={3} />
      </span>
    </span>
  );
}
