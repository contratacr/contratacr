"use client";

import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
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
      {/* El pie va en la web (también aquí, para no dejar la sección sin salida);
          en la app no, que ahí manda la barra de abajo. */}
      <FooterSoloWeb />
    </div>
  );
}
