"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

// There is no longer a separate client panel — every account uses the ONE unified
// "Mi panel" (with a mode switch). This route now just forwards any old client
// link into the unified panel's "Usar servicios" mode, mapping the legacy tabs.
const TAB_MAP: Record<string, string> = {
  bookings: "sent_bookings",
  projects: "sent_projects",
  saved: "saved",
  network: "network",
  notifications: "notifications",
  soporte: "soporte",
  profile: "profile",
  cuenta: "cuenta",
};

export default function ClientDashboardRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const legacy = searchParams.get("tab") ?? "bookings";
    const tab = TAB_MAP[legacy] ?? "sent_bookings";
    const params = new URLSearchParams({ tab });
    // Ambiguous tabs (profile + shared) need the mode so we land in "Usar servicios".
    if (!["sent_bookings", "sent_projects", "saved"].includes(tab)) params.set("mode", "use");
    const ticket = searchParams.get("ticket");
    if (ticket) params.set("ticket", ticket);
    router.replace(`/dashboard/profesional?${params}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
    </div>
  );
}
