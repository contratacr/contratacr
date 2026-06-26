import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExpandToggle({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all duration-200",
        open
          ? "border-[#009FD9] bg-[#009FD9] text-white shadow-[0_8px_18px_-12px_rgba(0,159,217,0.9)]"
          : "border-[#e5edf4] bg-[#f8fbfd] text-[#6b7280] group-hover:border-[#bfe3f5] group-hover:bg-[#EBF5FB] group-hover:text-[#0089bb]",
        className
      )}
      aria-hidden="true"
    >
      <ChevronDown
        className={cn(
          "h-4 w-4 stroke-[2.6] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open && "rotate-180"
        )}
      />
    </span>
  );
}
