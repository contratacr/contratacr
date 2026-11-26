"use client";
import { CABECERA_TITULO } from "@/components/layout/cabecera";
import { useEffect, type MouseEventHandler } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContrataCRMark } from "@/components/brand/brand-logo";
import { useSiteFeatures } from "@/components/site-features";
import { cn } from "@/lib/utils";

/** Same 32px mark and zero added gap as the home brand lockup. */
export function SectionBrand({ title, as: Heading = "h1", onHomeClick, className }: {
  title: string;
  as?: "h1" | "p";
  onHomeClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) {
  // Directory on (test, owner 2026-11-26): on phones the brand + title is the menu button (chevron, menu from the left),
  // like the home header; the separate ☰ of the screen steps aside. With the directory off nothing changes.
  const menuMode = useSiteFeatures().directorySections.length > 0;
  const t = useTranslations("quickNav");
  useEffect(() => {
    if (!menuMode) return;
    document.documentElement.classList.add("ccr-brand-menu");
    return () => document.documentElement.classList.remove("ccr-brand-menu");
  }, [menuMode]);
  return (
    <div data-ccr-section-brand="" className={cn("flex min-w-0 items-center gap-0", className)}>
      <Link href="/" aria-label="ContrataCR" onClick={onHomeClick} className={cn("shrink-0", menuMode && "max-lg:hidden")}>
        <ContrataCRMark />
      </Link>
      {menuMode && (
        <button type="button" data-ccr-brand-menu="" aria-label={t("menu")} onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} className="group flex shrink-0 items-center lg:hidden">
          <ContrataCRMark />
        </button>
      )}
      <Heading data-ccr-section-title="" className={CABECERA_TITULO}>{title}</Heading>
      {menuMode && (
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} className="group ml-0.5 grid h-8 w-6 shrink-0 place-items-center lg:hidden">
          <ChevronDown className="h-4 w-4 text-[#162543] transition-transform duration-200 group-active:-rotate-90" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
