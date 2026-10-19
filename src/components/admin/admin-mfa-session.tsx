"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { AdminMfa } from "./admin-mfa";

// Mounted only inside a server-authorized admin panel. This is a UX guard;
// admin APIs independently verify the live user and verified session MFA claims.
export function AdminMfaSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<{ enrolled: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/auth/admin-mfa", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        if (!data.authenticated || !data.isAdmin) { router.replace("/admin"); router.refresh(); return; }
        if (data.required) setChallenge({ enrolled: data.enrolled === true });
      } catch { /* A connection failure cannot grant access: server guards remain authoritative. */ }
    }
    void check();
    const interval = window.setInterval(() => void check(), 30_000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [router]);
  if (challenge) return <AdminMfa enrolled={challenge.enrolled} onVerified={async () => {
    const response = await fetch("/api/auth/admin-mfa", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.isAdmin || data.required) throw new Error("MFA not confirmed");
    setChallenge(null); router.refresh();
  }} />;
  return children;
}
