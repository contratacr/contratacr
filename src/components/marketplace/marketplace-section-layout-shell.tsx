"use client";

import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { FooterSoloWeb } from "@/components/landing/footer-solo-web";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { PantallaFija } from "@/components/util/pantalla-fija";

export function MarketplaceSectionLayoutShell({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const pathname = usePathname();
  const isPublishPage = segment === "publicar";
  const isEditPage = pathname.endsWith("/editar");
  const usesContextualMarketplaceSearch = !isPublishPage && !isEditPage;
  // Las LISTAS (/empleos, /promociones) no desplazan la página: el cascarón mide la
  // pantalla y se desplaza la lista (regla data-ccr-tablero-fijo en layout.tsx).
  // Se decide por la ruta, en el servidor, para que llegue en el primer pintado.
  const esTablero = /^\/(?:es|en)?\/?(?:empleos|promociones|proyectos)\/?$/u.test(pathname);

  return (
    <div className={esTablero ? "ccr-cascaron ccr-cascaron-tablero flex min-h-screen flex-col bg-[#f4f7fa]" : "ccr-cascaron flex min-h-screen flex-col bg-[#f4f7fa]"}>
      {esTablero && <PantallaFija />}
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
      {/* `ccr-cascaron-contenido`: con la franja fija puesta, el <main> de adentro
          llena este hueco (regla data-ccr-reserva en layout.tsx). */}
      <div className="ccr-cascaron-contenido flex-1">{children}</div>
      {/* El pie va en la web (también aquí, para no dejar la sección sin salida);
          en la app no, que ahí manda la barra de abajo. */}
      {/* Un tablero es una herramienta: el pie solo en computadora. */}
      <FooterSoloWeb soloEscritorio />
    </div>
  );
}
