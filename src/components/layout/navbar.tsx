"use client";

import { LandingNavbar } from "@/components/landing/landing-navbar";

/**
 * Single shared app header.
 *
 * Navbar is kept as a thin wrapper around LandingNavbar so every page renders
 * the same role-aware header. Pages can opt out of the mobile search when the
 * header should stay navigation-only, like dashboard/account sections.
 */
export function Navbar({ mobileSearch = false }: { mobileSearch?: boolean } = {}) {
  return (
    <>
      <LandingNavbar mobileSearch={mobileSearch} />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
    </>
  );
}
