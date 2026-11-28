"use client";

import { LandingNavbar, type SeccionInicialDeBarra } from "@/components/landing/landing-navbar";

/**
 * Single shared app header.
 *
 * Navbar is kept as a thin wrapper around LandingNavbar so every page renders
 * the same role-aware header. Pages can opt out of the mobile search when the
 * header should stay navigation-only, like dashboard/account sections.
 */
// `seccionInicial`: a child screen's «← Título» bar painted by the server (no jump on hydrate); same values as its SectionHeaderTitle.
export function Navbar({ mobileSearch = false, seccionInicial }: { mobileSearch?: boolean; seccionInicial?: SeccionInicialDeBarra } = {}) {
  return (
    <>
      <LandingNavbar mobileSearch={mobileSearch} seccionInicial={seccionInicial} />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
    </>
  );
}
