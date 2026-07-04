"use client";

import { type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";

// Session- + location-aware "Soporte" entry point, consistent app-wide:
//  • logged OUT → the PUBLIC /soporte page/form.
//  • logged IN → the account's single inline support inbox in the unified panel.
// `onNavigate` closes the host menu/drawer.
export function SupportLink({ className, children, onNavigate }: { className?: string; children: ReactNode; onNavigate?: () => void }) {
  const { user } = useAuth();
  const href = user
    ? "/dashboard/profesional?tab=soporte"
    : "/soporte";

  return (
    <Link href={href} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}
