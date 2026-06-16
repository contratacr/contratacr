"use client";

import { type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";

// Session- + location-aware "Soporte" entry point, consistent app-wide:
//  • logged OUT, or anywhere OUTSIDE the dashboard → the PUBLIC /soporte page/form
//    (support works without an account; everyone in the public context lands here).
//  • logged IN and INSIDE the dashboard → the panel's INLINE "Soporte" SECTION
//    (?tab=soporte) — no modal, no separate page (the pro panel for professionals,
//    the client panel otherwise).
// `onNavigate` closes the host menu/drawer.
export function SupportLink({ className, children, onNavigate }: { className?: string; children: ReactNode; onNavigate?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const inDashboard = pathname.startsWith("/dashboard");
  const isPro = user?.user_metadata?.role === "professional";

  const href = user && inDashboard
    ? (isPro ? "/dashboard/profesional?tab=soporte" : "/dashboard/cliente?tab=soporte")
    : "/soporte";

  return (
    <Link href={href} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}
