import { ChevronDown } from "lucide-react";
import { ContrataCRMark } from "@/components/brand/brand-logo";

/** The ContrataCR symbol as the menu button: the symbol untouched, and a small round chevron badge beside its lower
 * right corner (like an account switcher). The badge turns while pressed. */
export function BrandMenuMark() {
  return (
    <span className="inline-flex shrink-0 items-end gap-0.5">
      <ContrataCRMark />
      <span aria-hidden className="mb-px grid h-4 w-4 place-items-center rounded-full bg-[#eef3f7]">
        <ChevronDown className="h-3 w-3 text-[#162543] transition-transform duration-200 group-active:rotate-180" strokeWidth={3} />
      </span>
    </span>
  );
}
