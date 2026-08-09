"use client";

import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";

export function MarketplaceSectionLayoutShell({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const pathname = usePathname();
  const isPublishPage = segment === "publicar";
  const isEditPage = pathname.endsWith("/editar");
  const usesContextualMarketplaceSearch = !isPublishPage && !isEditPage;

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fa]">
      <div className="hidden lg:block">
        <LandingNavbar
          mobileSearch={false}
          forceCompactSearch={!usesContextualMarketplaceSearch}
          marketplaceDesktop={usesContextualMarketplaceSearch}
        />
        <div className="ccr-navbar-spacer h-16" aria-hidden />
      </div>
      {!isPublishPage && (
        <>
          <div className="lg:hidden">
            <LandingNavbar mobileSearch={false} drawerOnly />
          </div>
        </>
      )}
      <div className="flex-1">{children}</div>
      <LandingFooter />
    </div>
  );
}
