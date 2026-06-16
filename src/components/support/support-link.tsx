"use client";

import { type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { OPEN_SUPPORT_EVENT } from "@/lib/support-events";

// Auth-conditional "Soporte" link:
//  • logged OUT → navigate to the standalone /soporte page (support works for guests).
//  • logged IN  → open the support modal OVER the current page (no navigation).
// Direct navigation to /soporte still shows the page in both states — only link
// clicks open the modal for logged-in users. `onNavigate` closes the host menu/drawer.
export function SupportLink({ className, children, onNavigate }: { className?: string; children: ReactNode; onNavigate?: () => void }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <Link href="/soporte" className={className} onClick={onNavigate}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_EVENT)); }}
    >
      {children}
    </button>
  );
}
