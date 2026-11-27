"use client";
import { CABECERA_TITULO } from "@/components/layout/cabecera";
import type { MouseEventHandler } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContrataCRMark } from "@/components/brand/brand-logo";
import { BrandMenuMark, toggleBrandMenu } from "@/components/layout/brand-menu-mark";
import { useSiteFeatures } from "@/components/site-features";
import { cn } from "@/lib/utils";
import { PHONE_DIRECTORY_HEADER } from "@/lib/directory/phone-header";

/** Same 32px mark and zero added gap as the home brand lockup. */
export function SectionBrand({ title, as: Heading = "h1", onHomeClick, className, compact = false }: {
  title: string;
  /** Phones: only the symbol ▾ (the title stays for screen readers); the screen puts its search beside it. */
  compact?: boolean;
  as?: "h1" | "p";
  onHomeClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) {
  // Directory on (test, owner 2026-11-26): on phones the brand + title is the menu button (chevron, menu from the left),
  // like the home header; the separate ☰ of the screen steps aside. With the directory off nothing changes.
  const siteFeatures = useSiteFeatures();
  const menuMode = PHONE_DIRECTORY_HEADER && siteFeatures.directorySections.length > 0;
  const t = useTranslations("quickNav");
  return (
    <div data-ccr-section-brand="" className={cn("flex min-w-0 items-center gap-0", className)}>
      <Link href="/" aria-label="ContrataCR" onClick={onHomeClick} className={cn("shrink-0", menuMode && "max-lg:hidden")}>
        <ContrataCRMark />
      </Link>
      {menuMode && (
        <button type="button" data-ccr-brand-menu="" aria-label={t("menu")} onClick={(e) => toggleBrandMenu(e.currentTarget)} className="group mr-2 flex shrink-0 items-center lg:hidden">
          <BrandMenuMark />
        </button>
      )}
      <Heading data-ccr-section-title="" className={cn(CABECERA_TITULO, compact && menuMode && "max-lg:sr-only")}>{title}</Heading>
    </div>
  );
}
