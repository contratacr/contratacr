import type { MouseEventHandler } from "react";
import { Link } from "@/i18n/navigation";
import { ContrataCRMark } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

/** Same 32px mark and zero added gap as the home brand lockup. */
export function SectionBrand({ title, as: Heading = "h1", onHomeClick, className }: {
  title: string;
  as?: "h1" | "p";
  onHomeClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) {
  return (
    <div data-ccr-section-brand="" className={cn("flex min-w-0 items-center gap-0", className)}>
      <Link href="/" aria-label="ContrataCR" onClick={onHomeClick} className="shrink-0">
        <ContrataCRMark />
      </Link>
      <Heading data-ccr-section-title="" className="min-w-0 truncate text-[19px] font-extrabold leading-6 text-[#162543]">{title}</Heading>
    </div>
  );
}
