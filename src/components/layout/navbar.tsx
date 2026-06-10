"use client";

import { LandingNavbar } from "@/components/landing/landing-navbar";

/**
 * Single shared app header.
 *
 * `Navbar` is kept as a thin wrapper around `LandingNavbar` so EVERY page —
 * home, /buscar, dashboards, registro, login, etc. — renders the exact same
 * role-aware header (Categorías mega-menu + autocomplete, Recursos, account
 * menu). `LandingNavbar` is `position: fixed`, so we add the `h-16` spacer that
 * the in-flow pages used to get from the old sticky header.
 */
export function Navbar() {
  return (
    <>
      <LandingNavbar />
      <div className="h-16" aria-hidden />
    </>
  );
}
