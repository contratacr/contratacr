"use client";

import { useEffect, useState } from "react";
import { SupportModal } from "@/components/support/support-modal";
import { OPEN_SUPPORT_EVENT } from "@/lib/support-events";

// Mounted ONCE app-wide (in the locale layout). Opens the support modal when any
// SupportLink (logged-in) dispatches OPEN_SUPPORT_EVENT — so the modal survives
// even when the menu/drawer that triggered it unmounts.
export function SupportModalHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_EVENT, handler);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, handler);
  }, []);

  if (!open) return null;
  return <SupportModal onClose={() => setOpen(false)} />;
}
